use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tiny_http::{Header, Request};

use super::common::{decode_base64_bytes, read_body, respond_json, respond_json_str};
use crate::server::state::AppState;

// ---------------------------------------------------------------------------
// Workspace Security Helpers (ID Validation, HTML/JS Escaping, Hex Sanitization)
// ---------------------------------------------------------------------------

/// Strictly validates workspace ID: `[a-zA-Z0-9_-]+`, max length 128, no traversal or separators.
pub fn validate_workspace_id(id: &str) -> Result<&str, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Invalid workspace ID: cannot be empty".to_string());
    }
    if trimmed.len() > 128 {
        return Err("Invalid workspace ID: exceeds maximum length of 128 characters".to_string());
    }
    if trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
    {
        return Err("Invalid workspace ID: path traversal characters are forbidden".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(
            "Invalid workspace ID: only ASCII alphanumeric, '-', and '_' characters are allowed"
                .to_string(),
        );
    }
    Ok(trimmed)
}

/// Escapes HTML special characters to prevent Stored XSS in generated style guides.
pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Escapes string literals for safe embedding inside single- or double-quoted JavaScript strings.
pub fn escape_js_string(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            '"' => out.push_str("\\\""),
            '<' => out.push_str("\\u003C"),
            '>' => out.push_str("\\u003E"),
            '&' => out.push_str("\\u0026"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
}

/// Validates a hex color string strictly against `^#[0-9a-fA-F]{3,8}$`.
/// Returns the validated hex color or `"#000000"` if invalid.
pub fn sanitize_hex_color(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(digits) = trimmed.strip_prefix('#') {
        let len = digits.len();
        if (3..=8).contains(&len) && digits.chars().all(|c| c.is_ascii_hexdigit()) {
            return trimmed.to_string();
        }
    }
    "#000000".to_string()
}

fn sanitize_css_font_name(raw: &str) -> String {
    raw.chars()
        .filter(|&c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.')
        .collect()
}

// ---------------------------------------------------------------------------
// Workspace Data Models (YAML / JSON Serializable)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TypographyFont {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, alias = "font_id", alias = "id")]
    pub font_id: Option<usize>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTypography {
    #[serde(default, deserialize_with = "de_font_opt")]
    pub heading_font: Option<TypographyFont>,
    #[serde(default, deserialize_with = "de_font_opt")]
    pub body_font: Option<TypographyFont>,
    #[serde(default, deserialize_with = "de_font_opt")]
    pub accent_font: Option<TypographyFont>,
    #[serde(default, deserialize_with = "de_font_opt")]
    pub code_font: Option<TypographyFont>,
}

/// Permissive deserializer allowing either full TypographyFont object or plain string name
fn de_font_opt<'de, D>(deserializer: D) -> Result<Option<TypographyFont>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        Some(serde_json::Value::String(s)) => {
            if s.trim().is_empty() {
                Ok(None)
            } else {
                Ok(Some(TypographyFont {
                    name: Some(s.clone()),
                    family: Some(s),
                    font_id: None,
                    path: None,
                    style: None,
                }))
            }
        }
        Some(serde_json::Value::Object(map)) => {
            let obj = serde_json::Value::Object(map);
            let font: TypographyFont =
                serde_json::from_value(obj).map_err(serde::de::Error::custom)?;
            Ok(Some(font))
        }
        _ => Ok(None),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceColor {
    pub name: String,
    pub hex: String,
    #[serde(default = "default_color_role")]
    pub role: String, // "primary", "secondary", "accent", "background", "text", "custom"
}

fn default_color_role() -> String {
    "custom".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCustomFont {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default, alias = "role")]
    pub label: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, alias = "font_id")]
    pub font_id: Option<usize>,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTask {
    pub id: String,
    pub text: String,
    #[serde(default = "default_task_status")]
    pub status: String, // "todo", "in_progress", "done"
    #[serde(
        default = "current_timestamp",
        alias = "createdAt",
        deserialize_with = "de_timestamp_or_now"
    )]
    pub created_at: u64,
    #[serde(default, alias = "due_date")]
    pub due_date: Option<String>,
    #[serde(default)]
    pub priority: Option<String>, // "high", "medium", "low"
    #[serde(default)]
    pub category: Option<String>, // milestone phase
}

fn default_task_status() -> String {
    "todo".to_string()
}

/// Permissive timestamp deserializer accepting numeric epoch seconds or date/ISO strings.
fn de_timestamp_or_now<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match val {
        Some(serde_json::Value::Number(n)) => n
            .as_u64()
            .or_else(|| n.as_f64().map(|f| f.max(0.0) as u64))
            .unwrap_or_else(current_timestamp),
        Some(serde_json::Value::String(s)) => {
            s.trim().parse::<u64>().unwrap_or_else(|_| current_timestamp())
        }
        _ => current_timestamp(),
    })
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String, // Brand
    #[serde(default)]
    pub client: Option<String>,
    #[serde(default)]
    pub business: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub campaign_name: Option<String>,
    #[serde(default)]
    pub brand_tagline: Option<String>,
    #[serde(default)]
    pub target_audience: Option<String>,
    #[serde(default)]
    pub deadline: Option<String>,
    #[serde(default)]
    pub logo_data_url: Option<String>,
    #[serde(default)]
    pub logo_path: Option<String>,
    #[serde(default)]
    pub folder_path: Option<String>,
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(
        default = "current_timestamp",
        alias = "updatedAt",
        deserialize_with = "de_timestamp_or_now"
    )]
    pub updated_at: u64,
    #[serde(default)]
    pub typography: WorkspaceTypography,
    #[serde(default, alias = "projectFonts")]
    pub project_fonts: Vec<TypographyFont>,
    #[serde(default, alias = "custom_fonts")]
    pub custom_fonts: Vec<WorkspaceCustomFont>,
    #[serde(default, alias = "colors")]
    pub palette: Vec<WorkspaceColor>,
    #[serde(default)]
    pub tasks: Vec<WorkspaceTask>,
    #[serde(default, alias = "pinned_assets")]
    pub pinned_assets: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub success: Option<bool>,
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ---------------------------------------------------------------------------
// WCAG 2.1 Contrast Metrics & Adobe Swatch Exchange (.ASE) Models
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContrastMetrics {
    pub luminance: f32,
    pub contrast_on_white: f32,
    pub contrast_on_black: f32,
    pub wcag_aa: bool,
    pub wcag_aaa: bool,
    pub wcag_aa_large: bool,
    pub recommended_text_color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RgbValues {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AseParsedColor {
    pub name: String,
    pub hex: String,
    pub rgb: RgbValues,
    pub color_space: String,
    pub color_type: String,
    pub group: Option<String>,
    pub contrast: ContrastMetrics,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AseInspectResponse {
    pub success: bool,
    pub total_colors: usize,
    pub version: String,
    pub block_count: usize,
    pub colors: Vec<AseParsedColor>,
}

// ---------------------------------------------------------------------------
// Color Space Conversions & WCAG Calculations
// ---------------------------------------------------------------------------

fn srgb_to_linear(c: u8) -> f32 {
    let v = c as f32 / 255.0;
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

pub fn calculate_contrast_metrics(r: u8, g: u8, b: u8) -> ContrastMetrics {
    let r_lin = srgb_to_linear(r);
    let g_lin = srgb_to_linear(g);
    let b_lin = srgb_to_linear(b);
    let lum = 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin;

    let rounded_lum = (lum * 1000.0).round() / 1000.0;
    let ratio_white = (1.0 + 0.05) / (lum + 0.05);
    let ratio_black = (lum + 0.05) / (0.0 + 0.05);

    let contrast_on_white = (ratio_white * 100.0).round() / 100.0;
    let contrast_on_black = (ratio_black * 100.0).round() / 100.0;

    let max_contrast = if contrast_on_white > contrast_on_black {
        contrast_on_white
    } else {
        contrast_on_black
    };

    let wcag_aa = max_contrast >= 4.5;
    let wcag_aa_large = max_contrast >= 3.0;
    let wcag_aaa = max_contrast >= 7.0;

    let recommended_text_color = if contrast_on_white >= contrast_on_black {
        "#FFFFFF".to_string()
    } else {
        "#000000".to_string()
    };

    ContrastMetrics {
        luminance: rounded_lum,
        contrast_on_white,
        contrast_on_black,
        wcag_aa,
        wcag_aaa,
        wcag_aa_large,
        recommended_text_color,
    }
}

fn cmyk_to_rgb(c: f32, m: f32, y: f32, k: f32) -> (u8, u8, u8) {
    let r = (1.0 - c) * (1.0 - k);
    let g = (1.0 - m) * (1.0 - k);
    let b = (1.0 - y) * (1.0 - k);
    (
        (r * 255.0).round().clamp(0.0, 255.0) as u8,
        (g * 255.0).round().clamp(0.0, 255.0) as u8,
        (b * 255.0).round().clamp(0.0, 255.0) as u8,
    )
}

fn lab_to_rgb(l: f32, a: f32, b: f32) -> (u8, u8, u8) {
    let l_scaled = if l <= 1.0 && a.abs() <= 1.0 && b.abs() <= 1.0 {
        l * 100.0
    } else {
        l
    };
    let fy = (l_scaled + 16.0) / 116.0;
    let fx = a / 500.0 + fy;
    let fz = fy - b / 200.0;

    let finv = |t: f32| -> f32 {
        let delta = 6.0 / 29.0;
        if t > delta {
            t * t * t
        } else {
            3.0 * delta * delta * (t - 4.0 / 29.0)
        }
    };

    // D65 standard illuminant
    let x_n = 0.95047;
    let y_n = 1.00000;
    let z_n = 1.08883;

    let x = x_n * finv(fx);
    let y = y_n * finv(fy);
    let z = z_n * finv(fz);

    let r_lin = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    let g_lin = -0.969_266 * x + 1.8760108 * y + 0.0415560 * z;
    let b_lin = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

    let gamma = |c: f32| -> f32 {
        if c <= 0.0031308 {
            12.92 * c
        } else {
            1.055 * c.powf(1.0 / 2.4) - 0.055
        }
    };

    let r = (gamma(r_lin) * 255.0).round().clamp(0.0, 255.0) as u8;
    let g = (gamma(g_lin) * 255.0).round().clamp(0.0, 255.0) as u8;
    let b = (gamma(b_lin) * 255.0).round().clamp(0.0, 255.0) as u8;

    (r, g, b)
}

// ---------------------------------------------------------------------------
// Binary ASE Parser & Exporter
// ---------------------------------------------------------------------------

pub fn parse_ase_bytes(bytes: &[u8]) -> Result<Vec<AseParsedColor>, String> {
    if bytes.len() < 12 {
        return Err("File too short to be a valid ASE swatch file".to_string());
    }

    if &bytes[0..4] != b"ASEF" {
        return Err("Invalid ASE signature: expected magic 'ASEF'".to_string());
    }

    let _major = u16::from_be_bytes([bytes[4], bytes[5]]);
    let _minor = u16::from_be_bytes([bytes[6], bytes[7]]);
    let num_blocks = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;

    let mut colors = Vec::new();
    let mut current_group: Option<String> = None;
    let mut offset = 12;
    let mut blocks_read = 0;

    while offset + 6 <= bytes.len() && blocks_read < num_blocks {
        let block_type = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
        let block_len = u32::from_be_bytes([
            bytes[offset + 2],
            bytes[offset + 3],
            bytes[offset + 4],
            bytes[offset + 5],
        ]) as usize;
        offset += 6;
        blocks_read += 1;

        if offset + block_len > bytes.len() {
            break;
        }

        let block_data = &bytes[offset..offset + block_len];
        offset += block_len;

        match block_type {
            0xc001 => {
                // Group Start
                if block_data.len() >= 2 {
                    let name_len = u16::from_be_bytes([block_data[0], block_data[1]]) as usize;
                    let byte_len = name_len * 2;
                    if 2 + byte_len <= block_data.len() {
                        let name_chars: Vec<u16> = block_data[2..2 + byte_len]
                            .chunks_exact(2)
                            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                            .filter(|&c| c != 0)
                            .collect();
                        let group_name = String::from_utf16_lossy(&name_chars);
                        current_group = Some(group_name);
                    }
                }
            }
            0xc002 => {
                // Group End
                current_group = None;
            }
            0x0001 => {
                // Color Entry
                if block_data.len() >= 2 {
                    let name_len = u16::from_be_bytes([block_data[0], block_data[1]]) as usize;
                    let byte_len = name_len * 2;
                    let mut pos = 2;

                    let color_name = if pos + byte_len <= block_data.len() {
                        let name_chars: Vec<u16> = block_data[pos..pos + byte_len]
                            .chunks_exact(2)
                            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                            .filter(|&c| c != 0)
                            .collect();
                        pos += byte_len;
                        let s = String::from_utf16_lossy(&name_chars);
                        if s.is_empty() {
                            "Untitled Color".to_string()
                        } else {
                            s
                        }
                    } else {
                        "Untitled Color".to_string()
                    };

                    if pos + 4 <= block_data.len() {
                        let color_space_str =
                            std::str::from_utf8(&block_data[pos..pos + 4]).unwrap_or("RGB ");
                        pos += 4;

                        let (r, g, b, color_space_clean) = match color_space_str {
                            "RGB " => {
                                if pos + 12 <= block_data.len() {
                                    let r_f = f32::from_be_bytes([
                                        block_data[pos],
                                        block_data[pos + 1],
                                        block_data[pos + 2],
                                        block_data[pos + 3],
                                    ]);
                                    let g_f = f32::from_be_bytes([
                                        block_data[pos + 4],
                                        block_data[pos + 5],
                                        block_data[pos + 6],
                                        block_data[pos + 7],
                                    ]);
                                    let b_f = f32::from_be_bytes([
                                        block_data[pos + 8],
                                        block_data[pos + 9],
                                        block_data[pos + 10],
                                        block_data[pos + 11],
                                    ]);
                                    pos += 12;
                                    (
                                        (r_f * 255.0).round().clamp(0.0, 255.0) as u8,
                                        (g_f * 255.0).round().clamp(0.0, 255.0) as u8,
                                        (b_f * 255.0).round().clamp(0.0, 255.0) as u8,
                                        "RGB".to_string(),
                                    )
                                } else {
                                    (0, 0, 0, "RGB".to_string())
                                }
                            }
                            "CMYK" => {
                                if pos + 16 <= block_data.len() {
                                    let c_f = f32::from_be_bytes([
                                        block_data[pos],
                                        block_data[pos + 1],
                                        block_data[pos + 2],
                                        block_data[pos + 3],
                                    ]);
                                    let m_f = f32::from_be_bytes([
                                        block_data[pos + 4],
                                        block_data[pos + 5],
                                        block_data[pos + 6],
                                        block_data[pos + 7],
                                    ]);
                                    let y_f = f32::from_be_bytes([
                                        block_data[pos + 8],
                                        block_data[pos + 9],
                                        block_data[pos + 10],
                                        block_data[pos + 11],
                                    ]);
                                    let k_f = f32::from_be_bytes([
                                        block_data[pos + 12],
                                        block_data[pos + 13],
                                        block_data[pos + 14],
                                        block_data[pos + 15],
                                    ]);
                                    pos += 16;
                                    let (r, g, b) = cmyk_to_rgb(c_f, m_f, y_f, k_f);
                                    (r, g, b, "CMYK".to_string())
                                } else {
                                    (0, 0, 0, "CMYK".to_string())
                                }
                            }
                            "Gray" => {
                                if pos + 4 <= block_data.len() {
                                    let gray_f = f32::from_be_bytes([
                                        block_data[pos],
                                        block_data[pos + 1],
                                        block_data[pos + 2],
                                        block_data[pos + 3],
                                    ]);
                                    pos += 4;
                                    let val = (gray_f * 255.0).round().clamp(0.0, 255.0) as u8;
                                    (val, val, val, "Gray".to_string())
                                } else {
                                    (0, 0, 0, "Gray".to_string())
                                }
                            }
                            "LAB " => {
                                if pos + 12 <= block_data.len() {
                                    let l_f = f32::from_be_bytes([
                                        block_data[pos],
                                        block_data[pos + 1],
                                        block_data[pos + 2],
                                        block_data[pos + 3],
                                    ]);
                                    let a_f = f32::from_be_bytes([
                                        block_data[pos + 4],
                                        block_data[pos + 5],
                                        block_data[pos + 6],
                                        block_data[pos + 7],
                                    ]);
                                    let b_f = f32::from_be_bytes([
                                        block_data[pos + 8],
                                        block_data[pos + 9],
                                        block_data[pos + 10],
                                        block_data[pos + 11],
                                    ]);
                                    pos += 12;
                                    let (r, g, b) = lab_to_rgb(l_f, a_f, b_f);
                                    (r, g, b, "LAB".to_string())
                                } else {
                                    (0, 0, 0, "LAB".to_string())
                                }
                            }
                            _ => (0, 0, 0, color_space_str.trim().to_string()),
                        };

                        let color_type_desc = if pos + 2 <= block_data.len() {
                            let c_type = u16::from_be_bytes([block_data[pos], block_data[pos + 1]]);
                            match c_type {
                                0 => "Global",
                                1 => "Spot",
                                2 => "Normal",
                                _ => "Custom",
                            }
                        } else {
                            "Normal"
                        };

                        let hex = format!("#{:02X}{:02X}{:02X}", r, g, b);
                        let contrast = calculate_contrast_metrics(r, g, b);

                        colors.push(AseParsedColor {
                            name: color_name,
                            hex,
                            rgb: RgbValues { r, g, b },
                            color_space: color_space_clean,
                            color_type: color_type_desc.to_string(),
                            group: current_group.clone(),
                            contrast,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    Ok(colors)
}

pub fn generate_ase_binary(palette: &[WorkspaceColor]) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(b"ASEF");
    buf.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // Version 1.0
    let block_count = palette.len() as u32;
    buf.extend_from_slice(&block_count.to_be_bytes());

    for color in palette {
        buf.extend_from_slice(&[0x00, 0x01]); // Color block

        let hex = color.hex.trim_start_matches('#');
        let (r_u8, g_u8, b_u8) = if hex.len() == 3 || hex.len() == 4 {
            let parse_double = |idx: usize| -> u8 {
                let ch = hex.get(idx..idx + 1).unwrap_or("0");
                u8::from_str_radix(&format!("{}{}", ch, ch), 16).unwrap_or(0)
            };
            (parse_double(0), parse_double(1), parse_double(2))
        } else {
            (
                u8::from_str_radix(hex.get(0..2).unwrap_or("00"), 16).unwrap_or(0),
                u8::from_str_radix(hex.get(2..4).unwrap_or("00"), 16).unwrap_or(0),
                u8::from_str_radix(hex.get(4..6).unwrap_or("00"), 16).unwrap_or(0),
            )
        };
        let r = r_u8 as f32 / 255.0;
        let g = g_u8 as f32 / 255.0;
        let b = b_u8 as f32 / 255.0;

        let name_chars: Vec<u16> = color
            .name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let name_len = name_chars.len() as u16;

        let block_len = (2 + name_chars.len() * 2 + 4 + 12 + 2) as u32;
        buf.extend_from_slice(&block_len.to_be_bytes());

        buf.extend_from_slice(&name_len.to_be_bytes());
        for c in name_chars {
            buf.extend_from_slice(&c.to_be_bytes());
        }

        buf.extend_from_slice(b"RGB ");
        buf.extend_from_slice(&r.to_be_bytes());
        buf.extend_from_slice(&g.to_be_bytes());
        buf.extend_from_slice(&b.to_be_bytes());
        buf.extend_from_slice(&[0x00, 0x02]); // Normal swatch
    }

    buf
}

// ---------------------------------------------------------------------------
// YAML Serialization & Disk Helpers
// ---------------------------------------------------------------------------

pub fn workspace_to_yaml(ws: &Workspace) -> String {
    let mut yaml = String::new();
    yaml.push_str(&format!("id: \"{}\"\n", ws.id));
    yaml.push_str(&format!("name: \"{}\"\n", ws.name.replace('"', "\\\"")));
    if let Some(ref client) = ws.client {
        yaml.push_str(&format!("client: \"{}\"\n", client.replace('"', "\\\"")));
    }
    if let Some(ref bus) = ws.business {
        yaml.push_str(&format!("business: \"{}\"\n", bus.replace('"', "\\\"")));
    }
    if let Some(ref desc) = ws.description {
        yaml.push_str(&format!("description: \"{}\"\n", desc.replace('"', "\\\"")));
    }
    if let Some(ref deadline) = ws.deadline {
        yaml.push_str(&format!("deadline: \"{}\"\n", deadline.replace('"', "\\\"")));
    }
    yaml.push_str(&format!("updatedAt: {}\n", ws.updated_at));

    yaml.push_str("typography:\n");
    let print_font = |yaml: &mut String, label: &str, font: &Option<TypographyFont>| {
        if let Some(ref f) = font {
            yaml.push_str(&format!("  {}:\n", label));
            if let Some(ref name) = f.name {
                yaml.push_str(&format!("    name: \"{}\"\n", name.replace('"', "\\\"")));
            }
            if let Some(id) = f.font_id {
                yaml.push_str(&format!("    fontId: {}\n", id));
            }
            if let Some(ref path) = f.path {
                yaml.push_str(&format!(
                    "    path: \"{}\"\n",
                    path.replace('\\', "/").replace('"', "\\\"")
                ));
            }
            if let Some(ref fam) = f.family {
                yaml.push_str(&format!("    family: \"{}\"\n", fam.replace('"', "\\\"")));
            }
            if let Some(ref sty) = f.style {
                yaml.push_str(&format!("    style: \"{}\"\n", sty.replace('"', "\\\"")));
            }
        }
    };
    print_font(&mut yaml, "headingFont", &ws.typography.heading_font);
    print_font(&mut yaml, "bodyFont", &ws.typography.body_font);
    print_font(&mut yaml, "accentFont", &ws.typography.accent_font);
    print_font(&mut yaml, "codeFont", &ws.typography.code_font);

    if !ws.custom_fonts.is_empty() {
        yaml.push_str("customFonts:\n");
        for cf in &ws.custom_fonts {
            yaml.push_str(&format!("  - label: \"{}\"\n", cf.label.replace('"', "\\\"")));
            if let Some(ref name) = cf.name {
                yaml.push_str(&format!("    name: \"{}\"\n", name.replace('"', "\\\"")));
            }
            if let Some(ref fam) = cf.family {
                yaml.push_str(&format!("    family: \"{}\"\n", fam.replace('"', "\\\"")));
            }
            if let Some(ref sty) = cf.style {
                yaml.push_str(&format!("    style: \"{}\"\n", sty.replace('"', "\\\"")));
            }
            if let Some(id) = cf.font_id {
                yaml.push_str(&format!("    fontId: {}\n", id));
            }
            if let Some(ref p) = cf.path {
                yaml.push_str(&format!(
                    "    path: \"{}\"\n",
                    p.replace('\\', "/").replace('"', "\\\"")
                ));
            }
        }
    }

    yaml.push_str("palette:\n");
    for c in &ws.palette {
        yaml.push_str(&format!("  - name: \"{}\"\n", c.name.replace('"', "\\\"")));
        yaml.push_str(&format!("    hex: \"{}\"\n", c.hex));
        yaml.push_str(&format!("    role: \"{}\"\n", c.role));
    }

    yaml.push_str("tasks:\n");
    for t in &ws.tasks {
        yaml.push_str(&format!("  - id: \"{}\"\n", t.id));
        yaml.push_str(&format!("    text: \"{}\"\n", t.text.replace('"', "\\\"")));
        yaml.push_str(&format!("    status: \"{}\"\n", t.status));
        yaml.push_str(&format!("    createdAt: {}\n", t.created_at));
        if let Some(ref dd) = t.due_date {
            yaml.push_str(&format!("    dueDate: \"{}\"\n", dd.replace('"', "\\\"")));
        }
        if let Some(ref pr) = t.priority {
            yaml.push_str(&format!("    priority: \"{}\"\n", pr.replace('"', "\\\"")));
        }
        if let Some(ref cat) = t.category {
            yaml.push_str(&format!("    category: \"{}\"\n", cat.replace('"', "\\\"")));
        }
    }

    if !ws.pinned_assets.is_empty() {
        yaml.push_str("pinnedAssets:\n");
        for pa in &ws.pinned_assets {
            yaml.push_str(&format!("  - \"{}\"\n", pa.replace('"', "\\\"")));
        }
    }

    let escaped_notes = ws
        .notes
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    yaml.push_str(&format!("notes: \"{}\"\n", escaped_notes));

    yaml
}

fn get_workspaces_dir(data_dir: &Path) -> PathBuf {
    let dir = data_dir.join("Workspaces");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn resolve_workspace_root_path(
    ws_id: &str,
    custom_folder: Option<&str>,
) -> Result<PathBuf, String> {
    let safe_id = validate_workspace_id(ws_id)?;
    if let Some(custom) = custom_folder.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if custom.contains("..") || custom.contains('\0') {
            return Err("Security violation: path traversal in workspace folderPath".to_string());
        }
        let custom_lower = custom.to_lowercase();
        if custom_lower.starts_with("c:\\windows")
            || custom_lower.starts_with("c:\\program files")
            || custom_lower.starts_with("c:\\program files (x86)")
        {
            return Err(
                "Security violation: cannot use system directory as workspace folderPath"
                    .to_string(),
            );
        }
        Ok(PathBuf::from(custom))
    } else {
        Ok(crate::engine::lifecycle::get_app_data_dir()
            .join("Workspaces")
            .join(safe_id))
    }
}

fn resolve_existing_workspace_root(
    data_dir: &Path,
    safe_id: &str,
) -> Result<(Option<Workspace>, PathBuf), (u16, String)> {
    let ws_dir = get_workspaces_dir(data_dir);
    let ws_opt = load_workspace_from_disk(&ws_dir, safe_id);
    let custom_root = ws_opt.as_ref().and_then(|w| w.folder_path.as_deref());
    let root = resolve_workspace_root_path(safe_id, custom_root).map_err(|e| (400, e))?;
    if !root.is_dir() {
        return Err((404, "Workspace folder not found".to_string()));
    }
    Ok((ws_opt, root))
}

/// Resolves the physical project directory on disk (`%LOCALAPPDATA%\Fontivo\Workspaces\<safe_id>\`)
/// and ensures all 4 physical subfolders (`Fonts/`, `Designs/`, `Palettes/`, `Guidelines/`) exist.
pub fn ensure_workspace_physical_dir(
    ws_id: &str,
    custom_folder: Option<&str>,
) -> Result<PathBuf, String> {
    let project_root = resolve_workspace_root_path(ws_id, custom_folder)?;

    fs::create_dir_all(project_root.join("Fonts"))
        .map_err(|e| format!("Failed to create Fonts subfolder: {}", e))?;
    fs::create_dir_all(project_root.join("Designs"))
        .map_err(|e| format!("Failed to create Designs subfolder: {}", e))?;
    fs::create_dir_all(project_root.join("Palettes"))
        .map_err(|e| format!("Failed to create Palettes subfolder: {}", e))?;
    fs::create_dir_all(project_root.join("Guidelines"))
        .map_err(|e| format!("Failed to create Guidelines subfolder: {}", e))?;

    Ok(project_root)
}

/// Resolves a `TypographyFont` slot against an `AppState` font snapshot by ID, path, or family/name.
fn find_matching_font_in_snapshot<'a>(
    f_item: &TypographyFont,
    fonts_snapshot: &'a [crate::server::state::FontRecord],
) -> Option<&'a crate::server::state::FontRecord> {
    if let Some(fid) = f_item.font_id {
        if let Some(f) = fonts_snapshot.iter().find(|f| f.id == fid) {
            return Some(f);
        }
    }
    if let Some(ref p) = f_item.path {
        if let Some(f) = fonts_snapshot
            .iter()
            .find(|f| f.path.eq_ignore_ascii_case(p))
        {
            return Some(f);
        }
    }
    let query = f_item
        .family
        .as_deref()
        .or(f_item.name.as_deref())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if query.is_empty() {
        return None;
    }
    fonts_snapshot
        .iter()
        .find(|f| {
            f.family
                .as_deref()
                .map(|fam| fam.eq_ignore_ascii_case(&query))
                .unwrap_or(false)
                || f.display_name
                    .as_deref()
                    .map(|d| d.eq_ignore_ascii_case(&query))
                    .unwrap_or(false)
                || f.name.eq_ignore_ascii_case(&query)
        })
        .or_else(|| {
            fonts_snapshot.iter().find(|f| {
                f.family
                    .as_deref()
                    .map(|fam| fam.to_ascii_lowercase().contains(&query))
                    .unwrap_or(false)
                    || f.name.to_ascii_lowercase().contains(&query)
                    || f.post_script_name
                        .as_deref()
                        .map(|ps| ps.to_ascii_lowercase().contains(&query))
                        .unwrap_or(false)
            })
        })
}

fn copy_font_slots_to_dir(
    slots: &[TypographyFont],
    fonts_snapshot: &[crate::server::state::FontRecord],
    fonts_dir: &Path,
) {
    for f_item in slots {
        if let Some(font) = find_matching_font_in_snapshot(f_item, fonts_snapshot) {
            let src = AppState::resolve_usable_font_path(&font.path);
            if src.is_file() {
                let name_path = Path::new(&font.name);
                let dest_name = if name_path.extension().is_some() {
                    name_path.file_name().or_else(|| src.file_name())
                } else {
                    src.file_name().or_else(|| name_path.file_name())
                }
                .unwrap_or_default();
                if !dest_name.is_empty() {
                    let _ = fs::copy(&src, fonts_dir.join(dest_name));
                }
            }
        } else if let Some(ref p_str) = f_item.path {
            let src = AppState::resolve_usable_font_path(p_str);
            if src.is_file() {
                if let Some(fname) = src.file_name() {
                    let _ = fs::copy(&src, fonts_dir.join(fname));
                }
            }
        }
    }
}

fn collect_all_workspace_font_slots(ws: &Workspace) -> Vec<TypographyFont> {
    let mut all_slots: Vec<TypographyFont> = [
        &ws.typography.heading_font,
        &ws.typography.body_font,
        &ws.typography.accent_font,
        &ws.typography.code_font,
    ]
    .into_iter()
    .flatten()
    .cloned()
    .collect();
    all_slots.extend(ws.project_fonts.iter().cloned());
    all_slots.extend(ws.custom_fonts.iter().map(|cf| TypographyFont {
        name: cf.name.clone(),
        font_id: cf.font_id,
        path: cf.path.clone(),
        family: cf.family.clone(),
        style: cf.style.clone(),
    }));
    all_slots
}

fn build_workspace_palette_css(ws: &Workspace) -> String {
    let mut css = String::from("/* Generated by Fontivo Brand & Workspace Engine */\n:root {\n");
    if let Some(h) = ws
        .typography
        .heading_font
        .as_ref()
        .and_then(|f| f.name.as_ref())
    {
        css.push_str(&format!(
            "  --font-heading: '{}', sans-serif;\n",
            sanitize_css_font_name(h)
        ));
    }
    if let Some(b) = ws
        .typography
        .body_font
        .as_ref()
        .and_then(|f| f.name.as_ref())
    {
        css.push_str(&format!(
            "  --font-body: '{}', sans-serif;\n",
            sanitize_css_font_name(b)
        ));
    }
    if let Some(a) = ws
        .typography
        .accent_font
        .as_ref()
        .and_then(|f| f.name.as_ref())
    {
        css.push_str(&format!(
            "  --font-accent: '{}', serif;\n",
            sanitize_css_font_name(a)
        ));
    }
    if let Some(c) = ws
        .typography
        .code_font
        .as_ref()
        .and_then(|f| f.name.as_ref())
    {
        css.push_str(&format!(
            "  --font-code: '{}', monospace;\n",
            sanitize_css_font_name(c)
        ));
    }
    for (idx, cf) in ws.custom_fonts.iter().enumerate() {
        if let Some(fname) = cf.family.as_deref().or(cf.name.as_deref()) {
            let role_slug: String = cf
                .label
                .to_lowercase()
                .chars()
                .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
                .collect();
            let clean_slug = role_slug.trim_matches('-');
            let var_name = if clean_slug.is_empty() {
                format!("custom-{}", idx + 1)
            } else {
                format!("custom-{}", clean_slug)
            };
            css.push_str(&format!(
                "  --font-{}: '{}', sans-serif;\n",
                var_name,
                sanitize_css_font_name(fname)
            ));
        }
    }
    for c in &ws.palette {
        let clean_role: String = c
            .name
            .to_lowercase()
            .chars()
            .map(|ch| if ch.is_alphanumeric() { ch } else { '-' })
            .collect();
        css.push_str(&format!(
            "  --color-{}: {};\n",
            clean_role,
            sanitize_hex_color(&c.hex)
        ));
    }
    css.push_str("}\n");
    css
}

/// Synchronizes all physical workspace files (`Fonts/`, `Palettes/palette.{ase,css,json}`, `Guidelines/styleguide.html`)
pub fn sync_workspace_physical_files(
    ws: &Workspace,
    fonts_snapshot: &[crate::server::state::FontRecord],
    custom_folder: Option<&str>,
) -> Result<PathBuf, String> {
    let project_dir = ensure_workspace_physical_dir(&ws.id, custom_folder)?;
    let fonts_dir = project_dir.join("Fonts");
    let palettes_dir = project_dir.join("Palettes");
    let guidelines_dir = project_dir.join("Guidelines");

    // 1. Copy workspace typography, project fonts, and custom font roles into Fonts/
    let all_font_slots = collect_all_workspace_font_slots(ws);
    copy_font_slots_to_dir(&all_font_slots, fonts_snapshot, &fonts_dir);

    // 2. Write Palettes/palette.json
    let palette_json = serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "client": ws.client,
        "business": ws.business,
        "deadline": ws.deadline,
        "updatedAt": ws.updated_at,
        "palette": ws.palette,
        "typography": {
            "heading": ws.typography.heading_font,
            "body": ws.typography.body_font,
            "accent": ws.typography.accent_font,
            "code": ws.typography.code_font,
            "customFonts": ws.custom_fonts,
        }
    });
    let _ = fs::write(
        palettes_dir.join("palette.json"),
        serde_json::to_string_pretty(&palette_json).unwrap_or_default(),
    );

    // 3. Write Palettes/palette.css
    let css = build_workspace_palette_css(ws);
    let _ = fs::write(palettes_dir.join("palette.css"), css);

    // 4. Write Palettes/palette.ase
    let ase_bytes = generate_ase_binary(&ws.palette);
    let _ = fs::write(palettes_dir.join("palette.ase"), ase_bytes);

    // 5. Write Guidelines/styleguide.html
    let html = generate_standalone_styleguide_html(ws);
    let _ = fs::write(guidelines_dir.join("styleguide.html"), html);

    Ok(project_dir)
}

fn save_workspace_to_disk(dir: &Path, ws: &Workspace) -> Result<(), String> {
    let safe_id = validate_workspace_id(&ws.id)?;
    let json_path = dir.join(format!("{}.json", safe_id));
    let yaml_path = dir.join(format!("{}.yaml", safe_id));

    if let Ok(canon_dir) = dir.canonicalize() {
        if json_path
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .as_deref()
            != Some(&canon_dir)
            || yaml_path
                .parent()
                .and_then(|p| p.canonicalize().ok())
                .as_deref()
                != Some(&canon_dir)
        {
            return Err(
                "Security violation: workspace path escapes workspaces directory".to_string(),
            );
        }
    }

    let json_str = serde_json::to_string_pretty(ws)
        .map_err(|e| format!("Failed to serialize workspace to JSON: {}", e))?;
    fs::write(&json_path, json_str)
        .map_err(|e| format!("Failed to write workspace JSON: {}", e))?;

    let yaml_str = workspace_to_yaml(ws);
    fs::write(&yaml_path, yaml_str)
        .map_err(|e| format!("Failed to write workspace YAML: {}", e))?;

    let _ = sync_workspace_physical_files(ws, &[], ws.folder_path.as_deref());

    Ok(())
}

fn load_workspace_from_disk(dir: &Path, id: &str) -> Option<Workspace> {
    let safe_id = validate_workspace_id(id).ok()?;
    let json_path = dir.join(format!("{}.json", safe_id));
    if json_path.is_file() {
        if let Ok(content) = fs::read_to_string(&json_path) {
            if let Ok(ws) = serde_json::from_str::<Workspace>(&content) {
                return Some(ws);
            }
        }
    }

    let yaml_path = dir.join(format!("{}.yaml", safe_id));
    if yaml_path.is_file() {
        if let Ok(content) = fs::read_to_string(&yaml_path) {
            let mut name = safe_id.to_string();
            let mut notes = String::new();
            for line in content.lines() {
                let trimmed = line.trim();
                if let Some(stripped) = trimmed.strip_prefix("name:") {
                    let n = stripped.trim().trim_matches('"');
                    if !n.is_empty() {
                        name = n.to_string();
                    }
                } else if let Some(stripped) = trimmed.strip_prefix("notes:") {
                    notes = stripped.trim().trim_matches('"').to_string();
                }
            }
            return Some(Workspace {
                id: safe_id.to_string(),
                name,
                notes,
                success: Some(true),
                ..Default::default()
            });
        }
    }

    None
}

fn load_all_workspaces(dir: &Path) -> Vec<Workspace> {
    let mut list = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(ws) = serde_json::from_str::<Workspace>(&content) {
                        list.push(ws);
                    }
                }
            }
        }
    }

    if list.is_empty() {
        let sample = get_default_workspace();
        let _ = save_workspace_to_disk(dir, &sample);
        list.push(sample);
    }

    list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    list
}

fn get_default_workspace() -> Workspace {
    Workspace {
        id: "fontivo-brand-system".to_string(),
        name: "Fontivo Design System".to_string(),
        client: Some("Fontivo Labs".to_string()),
        business: Some("Design Systems & Typography Tools".to_string()),
        category: Some("Branding & Visual Identity".to_string()),
        campaign_name: None,
        brand_tagline: None,
        target_audience: None,
        deadline: None,
        logo_data_url: None,
        logo_path: None,
        folder_path: None,
        folders: vec![
            "Fonts".to_string(),
            "Designs".to_string(),
            "Palettes".to_string(),
            "Guidelines".to_string(),
        ],
        description: Some("Production brand workspace for Fontivo desktop application, typography tokens, and high-contrast color palette.".to_string()),
        updated_at: current_timestamp(),
        typography: WorkspaceTypography {
            heading_font: Some(TypographyFont {
                name: Some("Inter Display".to_string()),
                font_id: Some(1),
                path: None,
                family: Some("Inter".to_string()),
                style: Some("Bold".to_string()),
            }),
            body_font: Some(TypographyFont {
                name: Some("Inter".to_string()),
                font_id: Some(2),
                path: None,
                family: Some("Inter".to_string()),
                style: Some("Regular".to_string()),
            }),
            accent_font: Some(TypographyFont {
                name: Some("Playfair Display".to_string()),
                font_id: None,
                path: None,
                family: Some("Playfair Display".to_string()),
                style: Some("Italic".to_string()),
            }),
            code_font: Some(TypographyFont {
                name: Some("JetBrains Mono".to_string()),
                font_id: None,
                path: None,
                family: Some("JetBrains Mono".to_string()),
                style: Some("Regular".to_string()),
            }),
        },
        project_fonts: Vec::new(),
        custom_fonts: Vec::new(),
        palette: vec![
            WorkspaceColor { name: "Deep Violet".to_string(), hex: "#5200EA".to_string(), role: "primary".to_string() },
            WorkspaceColor { name: "Electric Indigo".to_string(), hex: "#7C3AED".to_string(), role: "secondary".to_string() },
            WorkspaceColor { name: "Vibrant Cyan".to_string(), hex: "#06B6D4".to_string(), role: "accent".to_string() },
            WorkspaceColor { name: "Dark Surface".to_string(), hex: "#09090B".to_string(), role: "background".to_string() },
            WorkspaceColor { name: "Off White".to_string(), hex: "#F4F4F5".to_string(), role: "text".to_string() },
        ],
        tasks: vec![
            WorkspaceTask {
                id: "task-1".to_string(),
                text: "Finalize brand typography hierarchy and font pairings".to_string(),
                status: "done".to_string(),
                created_at: current_timestamp() - 86400,
                ..Default::default()
            },
            WorkspaceTask {
                id: "task-2".to_string(),
                text: "Extract and verify WCAG 2.1 AAA color contrast ratios".to_string(),
                status: "in_progress".to_string(),
                created_at: current_timestamp() - 3600,
                ..Default::default()
            },
            WorkspaceTask {
                id: "task-3".to_string(),
                text: "Export Adobe Swatch Exchange (.ASE) and CSS tokens bundle".to_string(),
                status: "todo".to_string(),
                created_at: current_timestamp(),
                ..Default::default()
            },
        ],
        pinned_assets: Vec::new(),
        notes: "Design principles: Clean Swiss-style typography, 60-30-10 color balance, and accessible contrast on dark backgrounds.".to_string(),
        success: Some(true),
    }
}

// ---------------------------------------------------------------------------
// HTML Style Guide Generator (XSS-Safe)
// ---------------------------------------------------------------------------

pub fn generate_standalone_styleguide_html(ws: &Workspace) -> String {
    let mut swatches_html = String::new();
    for c in &ws.palette {
        let safe_hex = sanitize_hex_color(&c.hex);
        let hex_clean = safe_hex.trim_start_matches('#');
        let (r, g, b) = if hex_clean.len() == 3 || hex_clean.len() == 4 {
            let expand = |idx: usize| -> u8 {
                let ch = hex_clean.get(idx..idx + 1).unwrap_or("0");
                u8::from_str_radix(&format!("{}{}", ch, ch), 16).unwrap_or(0)
            };
            (expand(0), expand(1), expand(2))
        } else {
            (
                u8::from_str_radix(hex_clean.get(0..2).unwrap_or("00"), 16).unwrap_or(0),
                u8::from_str_radix(hex_clean.get(2..4).unwrap_or("00"), 16).unwrap_or(0),
                u8::from_str_radix(hex_clean.get(4..6).unwrap_or("00"), 16).unwrap_or(0),
            )
        };
        let contrast = calculate_contrast_metrics(r, g, b);
        let safe_hex_html = escape_html(&safe_hex);
        let safe_hex_js = escape_html(&escape_js_string(&safe_hex));
        let safe_name = escape_html(&c.name);
        let safe_role = escape_html(&c.role.to_uppercase());

        let contrast_val = if contrast.contrast_on_white > contrast.contrast_on_black {
            contrast.contrast_on_white
        } else {
            contrast.contrast_on_black
        };
        let contrast_str = format!("{}:1", contrast_val);

        swatches_html.push_str(&format!(
            r#"<div class="swatch-card">
                <div class="swatch-color" style="background-color: {hex_html}; color: {rec_text};">
                    <span class="swatch-contrast-badge">{contrast_str}</span>
                </div>
                <div class="swatch-meta">
                    <div class="swatch-name">{name}</div>
                    <div class="swatch-hex" onclick="navigator.clipboard.writeText('{hex_js}')" title="Click to copy">{hex_html}</div>
                    <div class="swatch-role-tag">{role}</div>
                    <div class="swatch-details">
                        <span>RGB({r}, {g}, {b})</span>
                        <span class="badge {badge_class}">{badge_text}</span>
                    </div>
                </div>
            </div>"#,
            hex_html = safe_hex_html,
            hex_js = safe_hex_js,
            rec_text = contrast.recommended_text_color,
            contrast_str = contrast_str,
            name = safe_name,
            role = safe_role,
            r = r,
            g = g,
            b = b,
            badge_class = if contrast.wcag_aaa { "badge-aaa" } else if contrast.wcag_aa { "badge-aa" } else { "badge-fail" },
            badge_text = if contrast.wcag_aaa { "WCAG AAA" } else if contrast.wcag_aa { "WCAG AA" } else { "Low Contrast" }
        ));
    }

    let mut tasks_html = String::new();
    for t in &ws.tasks {
        let status_badge = match t.status.as_str() {
            "done" => r#"<span class="task-badge badge-done">Done</span>"#,
            "in_progress" => r#"<span class="task-badge badge-progress">In Progress</span>"#,
            _ => r#"<span class="task-badge badge-todo">To Do</span>"#,
        };
        let mut meta_badges = String::new();
        if let Some(ref prio) = t.priority {
            if !prio.trim().is_empty() {
                meta_badges.push_str(&format!(
                    r#"<span class="task-badge badge-todo">{}</span>"#,
                    escape_html(prio)
                ));
            }
        }
        if let Some(ref cat) = t.category {
            if !cat.trim().is_empty() {
                meta_badges.push_str(&format!(
                    r#"<span class="task-badge badge-todo">{}</span>"#,
                    escape_html(cat)
                ));
            }
        }
        if let Some(ref due) = t.due_date {
            if !due.trim().is_empty() {
                meta_badges.push_str(&format!(
                    r#"<span class="task-badge badge-todo">Due: {}</span>"#,
                    escape_html(due)
                ));
            }
        }
        tasks_html.push_str(&format!(
            r#"<li class="task-item">
                <span class="task-text">{text}</span>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">{meta_badges}{status}</div>
            </li>"#,
            text = escape_html(&t.text),
            meta_badges = meta_badges,
            status = status_badge
        ));
    }

    let mut custom_fonts_html = String::new();
    for cf in &ws.custom_fonts {
        let role_label = if cf.label.trim().is_empty() {
            "Custom Font Role"
        } else {
            cf.label.trim()
        };
        let font_label = cf
            .family
            .as_deref()
            .or(cf.name.as_deref())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Unspecified");
        custom_fonts_html.push_str(&format!(
            r#"<div class="type-card">
                    <div class="type-role">{role}</div>
                    <div class="type-name">{fname}</div>
                    <div class="type-preview-h">The Quick Brown Fox Jumps Over The Lazy Dog</div>
                    <div class="type-preview-h" dir="rtl" style="font-family: inherit;">أبجد هوز حطي كلمن سعفص قرشت</div>
                </div>"#,
            role = escape_html(role_label),
            fname = escape_html(font_label),
        ));
    }

    let safe_ws_name = escape_html(&ws.name);
    let safe_ws_name_code = escape_html(&escape_js_string(&ws.name));
    let heading_name = escape_html(
        &ws.typography
            .heading_font
            .as_ref()
            .and_then(|f| f.name.clone())
            .unwrap_or_else(|| "Inter Display".to_string()),
    );
    let body_name = escape_html(
        &ws.typography
            .body_font
            .as_ref()
            .and_then(|f| f.name.clone())
            .unwrap_or_else(|| "Inter".to_string()),
    );
    let accent_name = escape_html(
        &ws.typography
            .accent_font
            .as_ref()
            .and_then(|f| f.name.clone())
            .unwrap_or_else(|| "Playfair Display".to_string()),
    );
    let code_name = escape_html(
        &ws.typography
            .code_font
            .as_ref()
            .and_then(|f| f.name.clone())
            .unwrap_or_else(|| "JetBrains Mono".to_string()),
    );

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{name} — Brand & Typography Guidelines</title>
    <style>
        :root {{
            --bg: #130c16;
            --surface: #1b1220;
            --surface-elevated: #291c2e;
            --border: #43314d;
            --text: #fff9f2;
            --text-muted: #d8cedf;
            --action: #f16b50;
            --action-hover: #d9583e;
            --success: #c7d65a;
            --warning: #f7b544;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            background: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 40px 24px;
        }}
        .container {{ max-width: 1040px; margin: 0 auto; }}
        header {{
            border-bottom: 1px solid var(--border);
            padding-bottom: 32px;
            margin-bottom: 40px;
        }}
        .brand-pill {{
            display: inline-block;
            background: var(--action);
            color: #130c16;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            padding: 4px 12px;
            border-radius: 9999px;
            margin-bottom: 16px;
        }}
        h1 {{ font-size: 40px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 8px; }}
        .header-meta {{
            color: var(--text-muted);
            font-size: 14px;
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            margin-top: 12px;
        }}
        .section-title {{
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .section-title::before {{
            content: "";
            display: inline-block;
            width: 4px;
            height: 18px;
            background: var(--action);
            border-radius: 2px;
        }}
        .card-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
            gap: 16px;
            margin-bottom: 48px;
        }}
        .swatch-card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.2s, border-color 0.2s;
        }}
        .swatch-card:hover {{
            transform: translateY(-2px);
            border-color: var(--action);
        }}
        .swatch-color {{
            height: 110px;
            display: flex;
            align-items: flex-end;
            justify-content: flex-end;
            padding: 10px;
        }}
        .swatch-contrast-badge {{
            font-size: 11px;
            font-weight: 700;
            background: rgba(0,0,0,0.4);
            padding: 2px 8px;
            border-radius: 6px;
            backdrop-filter: blur(4px);
        }}
        .swatch-meta {{ padding: 16px; }}
        .swatch-name {{ font-weight: 700; font-size: 15px; margin-bottom: 4px; }}
        .swatch-hex {{
            font-family: monospace;
            font-size: 13px;
            color: var(--text-muted);
            cursor: pointer;
            display: inline-block;
            margin-bottom: 8px;
        }}
        .swatch-hex:hover {{ color: var(--text); text-decoration: underline; }}
        .swatch-role-tag {{
            display: inline-block;
            font-size: 10px;
            font-weight: 700;
            background: var(--surface-elevated);
            color: var(--text-muted);
            padding: 2px 8px;
            border-radius: 4px;
            margin-bottom: 8px;
        }}
        .swatch-details {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 8px;
            border-top: 1px solid var(--surface-elevated);
            padding-top: 8px;
        }}
        .badge {{ padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px; }}
        .badge-aaa {{ background: #064e3b; color: #6ee7b7; }}
        .badge-aa {{ background: #1e3a8a; color: #93c5fd; }}
        .badge-fail {{ background: #7f1d1d; color: #fca5a5; }}
        .type-specimen-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 48px;
        }}
        @media (max-width: 768px) {{ .type-specimen-grid {{ grid-template-columns: 1fr; }} }}
        .type-card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
        }}
        .type-role {{
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--action);
            letter-spacing: 0.08em;
            margin-bottom: 4px;
        }}
        .type-name {{ font-size: 20px; font-weight: 800; margin-bottom: 16px; }}
        .type-preview-h {{ font-size: 28px; font-weight: 700; line-height: 1.2; margin-bottom: 8px; }}
        .type-preview-p {{ font-size: 14px; color: var(--text-muted); line-height: 1.7; }}
        .type-preview-code {{ font-family: monospace; font-size: 13px; background: var(--bg); padding: 12px; border-radius: 8px; color: #38bdf8; }}
        .tasks-list {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            list-style: none;
            margin-bottom: 48px;
        }}
        .task-item {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--surface-elevated);
        }}
        .task-item:last-child {{ border-bottom: none; }}
        .task-text {{ font-size: 14px; }}
        .task-badge {{
            font-size: 11px;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 6px;
        }}
        .badge-done {{ background: #064e3b; color: #6ee7b7; }}
        .badge-progress {{ background: #78350f; color: #fde68a; }}
        .badge-todo {{ background: var(--surface-elevated); color: var(--text-muted); }}
        .notes-card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            font-size: 14px;
            color: var(--text-muted);
            margin-bottom: 48px;
        }}
        footer {{
            border-top: 1px solid var(--border);
            padding-top: 24px;
            font-size: 12px;
            color: var(--text-muted);
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="brand-pill">Brand Project Workspace</div>
            <h1>{name}</h1>
            {description_html}
            <div class="header-meta">
                {client_html}
                {business_html}
                {deadline_html}
                <span>Generated by Fontivo Brand & Workspace Engine</span>
            </div>
        </header>

        <section>
            <h2 class="section-title">Brand Typography Tokens</h2>
            <div class="type-specimen-grid">
                <div class="type-card">
                    <div class="type-role">Heading Font</div>
                    <div class="type-name">{heading_name}</div>
                    <div class="type-preview-h">The Quick Brown Fox Jumps Over The Lazy Dog</div>
                    <div class="type-preview-h" dir="rtl" style="font-family: inherit;">أبجد هوز حطي كلمن سعفص قرشت</div>
                </div>
                <div class="type-card">
                    <div class="type-role">Body Font</div>
                    <div class="type-name">{body_name}</div>
                    <div class="type-preview-p">
                        Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed.
                    </div>
                </div>
                <div class="type-card">
                    <div class="type-role">Accent Font</div>
                    <div class="type-name">{accent_name}</div>
                    <div class="type-preview-h" style="font-style: italic;">Elegance & Creative Precision</div>
                </div>
                <div class="type-card">
                    <div class="type-role">Code Font</div>
                    <div class="type-name">{code_name}</div>
                    <div class="type-preview-code">const brand = {{ name: "{name_code}", engine: "Fontivo" }};</div>
                </div>
                {custom_fonts_html}
            </div>
        </section>

        <section>
            <h2 class="section-title">Color Palette & WCAG 2.1 Contrast Matrix</h2>
            <div class="card-grid">
                {swatches_html}
            </div>
        </section>

        {tasks_section}

        {notes_section}

        <footer>
            <span>Exported from Fontivo Studio • Adobe Swatch Exchange (.ASE), CSS Tokens, & Style Guide</span>
        </footer>
    </div>
</body>
</html>"#,
        name = safe_ws_name,
        name_code = safe_ws_name_code,
        description_html = ws
            .description
            .as_ref()
            .map(|d| format!(
                r#"<p style="color: var(--text-muted); font-size: 16px; max-width: 700px;">{}</p>"#,
                escape_html(d)
            ))
            .unwrap_or_default(),
        client_html = ws
            .client
            .as_ref()
            .map(|c| format!("<span>Client: <strong>{}</strong></span>", escape_html(c)))
            .unwrap_or_default(),
        business_html = ws
            .business
            .as_ref()
            .map(|b| format!("<span>Industry: <strong>{}</strong></span>", escape_html(b)))
            .unwrap_or_default(),
        deadline_html = ws
            .deadline
            .as_ref()
            .filter(|d| !d.trim().is_empty())
            .map(|d| format!("<span>Deadline: <strong>{}</strong></span>", escape_html(d)))
            .unwrap_or_default(),
        heading_name = heading_name,
        body_name = body_name,
        accent_name = accent_name,
        code_name = code_name,
        custom_fonts_html = custom_fonts_html,
        swatches_html = swatches_html,
        tasks_section = if ws.tasks.is_empty() {
            String::new()
        } else {
            format!(
                r#"<section><h2 class="section-title">Brand Delivery Tasks</h2><ul class="tasks-list">{}</ul></section>"#,
                tasks_html
            )
        },
        notes_section = if ws.notes.is_empty() {
            String::new()
        } else {
            format!(
                r#"<section><h2 class="section-title">Brand Notes & Guidelines</h2><div class="notes-card">{}</div></section>"#,
                escape_html(&ws.notes)
            )
        }
    )
}

// ---------------------------------------------------------------------------
// HTTP Request Handlers
// ---------------------------------------------------------------------------

/// GET /api/workspaces: list all project workspaces
pub fn get_workspaces(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };

    let dir = get_workspaces_dir(&data_dir);
    let list = load_all_workspaces(&dir);

    respond_json_str(
        req,
        200,
        serde_json::to_string(&list).unwrap_or_else(|_| "[]".to_string()),
        cors_origin,
        json_header,
    );
}

/// GET /api/workspaces/:id: get single workspace details
pub fn get_workspace_by_id(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };

    let dir = get_workspaces_dir(&data_dir);
    if let Some(mut ws) = load_workspace_from_disk(&dir, safe_id) {
        ws.success = Some(true);
        respond_json_str(
            req,
            200,
            serde_json::to_string(&ws).unwrap_or_default(),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        404,
        serde_json::json!({ "success": false, "error": "Workspace not found" }),
        cors_origin,
        json_header,
    );
}

fn resolve_single_typography_slot(
    slot: &mut Option<TypographyFont>,
    fonts_snapshot: &[crate::server::state::FontRecord],
) {
    let Some(item) = slot.as_mut() else { return };
    if let Some(font) = find_matching_font_in_snapshot(item, fonts_snapshot) {
        item.font_id = Some(font.id);
        item.family = font.family.clone().or_else(|| Some(font.name.clone()));
        item.name = font
            .display_name
            .clone()
            .or_else(|| Some(font.name.clone()));
        item.style = font.style.clone();
        item.path = Some(font.path.clone());
    }
}

fn resolve_workspace_fonts_against_snapshot(
    ws: &mut Workspace,
    fonts_snapshot: &[crate::server::state::FontRecord],
) {
    resolve_single_typography_slot(&mut ws.typography.heading_font, fonts_snapshot);
    resolve_single_typography_slot(&mut ws.typography.body_font, fonts_snapshot);
    resolve_single_typography_slot(&mut ws.typography.accent_font, fonts_snapshot);
    resolve_single_typography_slot(&mut ws.typography.code_font, fonts_snapshot);
    for pf in &mut ws.project_fonts {
        let mut slot = Some(pf.clone());
        resolve_single_typography_slot(&mut slot, fonts_snapshot);
        if let Some(resolved) = slot {
            *pf = resolved;
        }
    }
    for cf in &mut ws.custom_fonts {
        let mut slot = Some(TypographyFont {
            name: cf.name.clone(),
            font_id: cf.font_id,
            path: cf.path.clone(),
            family: cf.family.clone(),
            style: cf.style.clone(),
        });
        resolve_single_typography_slot(&mut slot, fonts_snapshot);
        if let Some(resolved) = slot {
            cf.font_id = resolved.font_id;
            cf.family = resolved.family;
            cf.name = resolved.name;
            cf.style = resolved.style;
            cf.path = resolved.path;
        }
    }
}

/// Validates a relative subfolder path inside a workspace (`Designs/Campaigns/Social`),
/// preventing traversal, drive prefixes, nulls, and excessive depth.
pub fn validate_relative_subfolder(raw: &str) -> Result<String, String> {
    let trimmed_raw = raw.trim();
    if trimmed_raw.starts_with("//") || trimmed_raw.starts_with("\\\\") {
        return Err("Security violation: UNC network paths are forbidden".to_string());
    }
    let normalized = trimmed_raw.replace('\\', "/");
    let clean = normalized.trim_matches('/');
    if clean.is_empty() {
        return Ok(String::new());
    }
    if clean.contains("..") || clean.contains('\0') || clean.contains(':') {
        return Err(
            "Security violation: invalid characters in workspace subfolder path".to_string(),
        );
    }
    let segments: Vec<&str> = clean
        .split('/')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if segments.len() > 8 {
        return Err("Subfolder nesting exceeds maximum depth of 8 levels".to_string());
    }
    for seg in &segments {
        if *seg == "." || *seg == ".." || seg.len() > 80 {
            return Err("Invalid subfolder name".to_string());
        }
        let stem_upper = seg
            .split('.')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_uppercase();
        if matches!(
            stem_upper.as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        ) {
            return Err("Security violation: reserved OS device name in workspace path".to_string());
        }
        if !seg.chars().all(|c| {
            c.is_alphanumeric()
                || matches!(
                    c,
                    ' ' | '-' | '_' | '.' | '&' | '(' | ')' | '+' | ',' | '@' | '#' | '!' | '\'' | '[' | ']' | '~' | '='
                )
        }) {
            return Err(
                "Subfolder and asset path segments contain disallowed characters"
                    .to_string(),
            );
        }
    }
    Ok(segments.join("/"))
}

fn persist_workspace_payload(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    body: &str,
    default_id_override: Option<&str>,
    cors_origin: Header,
    json_header: Header,
) {
    let mut ws = match serde_json::from_str::<Workspace>(body) {
        Ok(w) => w,
        Err(_) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Invalid workspace JSON payload" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    if ws.id.trim().is_empty() {
        ws.id = match default_id_override {
            Some(id) => id.to_string(),
            None => format!("ws-{}", current_timestamp()),
        };
    } else {
        match validate_workspace_id(&ws.id) {
            Ok(valid) => ws.id = valid.to_string(),
            Err(err) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": err }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        }
    }

    if ws.updated_at == 0 {
        ws.updated_at = current_timestamp();
    }
    ws.success = Some(true);

    let (data_dir, fonts_snapshot) = {
        let st = state.read().unwrap();
        (st.data_dir.clone(), st.fonts.clone())
    };

    resolve_workspace_fonts_against_snapshot(&mut ws, &fonts_snapshot);

    // Ensure valid physical path and nested custom folders exist on disk
    if let Ok(phys) = ensure_workspace_physical_dir(&ws.id, ws.folder_path.as_deref()) {
        ws.folder_path = Some(phys.to_string_lossy().to_string());
        for rel in &ws.folders {
            if let Ok(safe_rel) = validate_relative_subfolder(rel) {
                if !safe_rel.is_empty() {
                    let _ = fs::create_dir_all(phys.join(safe_rel));
                }
            }
        }
    }

    let dir = get_workspaces_dir(&data_dir);
    if let Err(e) = save_workspace_to_disk(&dir, &ws) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": e }),
            cors_origin,
            json_header,
        );
        return;
    }
    let _ = sync_workspace_physical_files(&ws, &fonts_snapshot, ws.folder_path.as_deref());

    respond_json_str(
        req,
        200,
        serde_json::to_string(&ws).unwrap_or_default(),
        cors_origin,
        json_header,
    );
}

/// POST /api/workspaces: save or update a workspace
pub fn save_workspace(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    persist_workspace_payload(req, state, &body, None, cors_origin, json_header);
}

/// POST /api/workspaces/:id: save or update a workspace using URL identifier
pub fn save_workspace_with_id(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    url_id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_url_id = match validate_workspace_id(url_id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let body = read_body(&mut req);
    persist_workspace_payload(
        req,
        state,
        &body,
        Some(safe_url_id),
        cors_origin,
        json_header,
    );
}

/// DELETE /api/workspaces/:id: delete a workspace from disk
pub fn delete_workspace(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };

    let dir = get_workspaces_dir(&data_dir);
    let json_path = dir.join(format!("{}.json", safe_id));
    let yaml_path = dir.join(format!("{}.yaml", safe_id));
    let folder_dir = dir.join(safe_id);
    let app_ws_dir = crate::engine::lifecycle::get_app_data_dir()
        .join("Workspaces")
        .join(safe_id);

    let mut removed = false;
    if json_path.exists() {
        let _ = fs::remove_file(json_path);
        removed = true;
    }
    if yaml_path.exists() {
        let _ = fs::remove_file(yaml_path);
        removed = true;
    }
    if folder_dir.exists() && folder_dir.is_dir() {
        let _ = fs::remove_dir_all(folder_dir);
        removed = true;
    }
    if app_ws_dir.exists() && app_ws_dir.is_dir() {
        let _ = fs::remove_dir_all(app_ws_dir);
        removed = true;
    }

    respond_json(
        req,
        200,
        serde_json::json!({ "success": removed, "id": safe_id }),
        cors_origin,
        json_header,
    );
}

/// POST /api/workspaces/:id/activate-ram: 1-click RAM activation of all fonts in workspace
pub fn activate_workspace_ram(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let ws = {
        let st = state.read().unwrap();
        let dir = get_workspaces_dir(&st.data_dir);
        load_workspace_from_disk(&dir, safe_id)
    };

    let ws = match ws {
        Some(w) => w,
        None => {
            respond_json(
                req,
                404,
                serde_json::json!({ "success": false, "error": "Workspace not found" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut st = state.write().unwrap();
    let mut activated_ids = Vec::new();
    let mut activated_names = Vec::new();

    let all_slots = collect_all_workspace_font_slots(&ws);

    for font_opt in all_slots {
        let target_font = find_matching_font_in_snapshot(&font_opt, &st.fonts).cloned();

        if let Some(font) = target_font {
            let usable = AppState::resolve_usable_font_path(&font.path);
            if usable.exists() {
                let _ = st.activator.activate_ram(&usable.to_string_lossy());
                st.active_font_ids.insert(font.id);
                if !activated_ids.contains(&font.id) {
                    activated_ids.push(font.id);
                }
                let display_nm = font.family.unwrap_or(font.name);
                if !activated_names
                    .iter()
                    .any(|n: &String| n.eq_ignore_ascii_case(&display_nm))
                {
                    activated_names.push(display_nm);
                }
            }
        } else if let Some(ref path_str) = font_opt.path {
            let usable = AppState::resolve_usable_font_path(path_str);
            if usable.exists() {
                let _ = st.activator.activate_ram(&usable.to_string_lossy());
                let display_nm = font_opt.name.unwrap_or_else(|| {
                    usable
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                });
                if !activated_names
                    .iter()
                    .any(|n: &String| n.eq_ignore_ascii_case(&display_nm))
                {
                    activated_names.push(display_nm);
                }
            }
        }
    }

    // Also activate any physical font files dropped directly inside the workspace's Fonts/ directory
    if let Ok(phys_dir) = ensure_workspace_physical_dir(safe_id, ws.folder_path.as_deref()) {
        let fonts_dir = phys_dir.join("Fonts");
        if let Ok(entries) = fs::read_dir(fonts_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if matches!(ext.as_str(), "ttf" | "otf" | "ttc") {
                        let _ = st.activator.activate_ram(&p.to_string_lossy());
                        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                            if !activated_names.iter().any(|n| n.eq_ignore_ascii_case(stem)) {
                                activated_names.push(stem.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    for f in &mut st.fonts {
        if activated_ids.contains(&f.id) {
            f.is_active = true;
        }
    }
    st.save_active_fonts();

    let json_resp = serde_json::json!({
        "success": true,
        "activatedCount": activated_ids.len(),
        "activatedIds": activated_ids,
        "activatedFonts": activated_names
    });

    respond_json(req, 200, json_resp, cors_origin, json_header);
}

/// POST /api/workspaces/:id/export-bundle: export .ase swatches, palette.css, tokens.json, and standalone HTML style guide
pub fn export_workspace_bundle(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let (ws, fonts_snapshot) = {
        let st = state.read().unwrap();
        let dir = get_workspaces_dir(&st.data_dir);
        (load_workspace_from_disk(&dir, safe_id), st.fonts.clone())
    };

    let ws = match ws {
        Some(w) => w,
        None => {
            respond_json(
                req,
                404,
                serde_json::json!({ "success": false, "error": "Workspace not found" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let downloads = env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Downloads")
        .join("Fontivo Projects");

    let safe_name_raw: String = ws
        .name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe_name = if safe_name_raw.trim_matches('_').is_empty() {
        safe_id.to_string()
    } else {
        safe_name_raw
    };

    let project_dir = downloads.join(format!("{}-Handoff", safe_name));
    let fonts_dir = project_dir.join("Fonts");

    if let Err(e) = fs::create_dir_all(&fonts_dir) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to create project folder: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    // 1. Copy workspace typography, project, and custom role fonts if present on disk
    let all_slots = collect_all_workspace_font_slots(&ws);
    copy_font_slots_to_dir(&all_slots, &fonts_snapshot, &fonts_dir);

    // 2. Generate tokens.json
    let tokens_path = project_dir.join("tokens.json");
    let tokens_payload = serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "client": ws.client,
        "business": ws.business,
        "deadline": ws.deadline,
        "description": ws.description,
        "exportedAt": current_timestamp(),
        "typography": {
            "heading": ws.typography.heading_font,
            "body": ws.typography.body_font,
            "accent": ws.typography.accent_font,
            "code": ws.typography.code_font,
            "customFonts": ws.custom_fonts,
        },
        "palette": ws.palette,
        "tasks": ws.tasks,
        "pinnedAssets": ws.pinned_assets,
        "notes": ws.notes,
    });
    let _ = fs::write(
        &tokens_path,
        serde_json::to_string_pretty(&tokens_payload).unwrap_or_default(),
    );

    // 3. Generate palette.css (sanitized against CSS injection)
    let palette_css_path = project_dir.join("palette.css");
    let css = build_workspace_palette_css(&ws);
    let _ = fs::write(&palette_css_path, css);

    // 4. Generate Adobe Swatch Exchange (.ase) binary
    let ase_bytes = generate_ase_binary(&ws.palette);
    let ase_filename = format!("{}-swatches.ase", safe_name);
    let ase_path = project_dir.join(&ase_filename);
    let _ = fs::write(&ase_path, ase_bytes);

    // 5. Generate Standalone HTML Style Guide
    let guide_html_path = project_dir.join("Brand-StyleGuide.html");
    let guide_html = generate_standalone_styleguide_html(&ws);
    let _ = fs::write(&guide_html_path, guide_html);

    // 6. Launch Explorer on Windows
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(&project_dir)
            .spawn();
    }

    let path_str = project_dir.to_string_lossy().to_string().replace('\\', "/");
    let resp = serde_json::json!({
        "success": true,
        "bundlePath": path_str,
        "folderPath": path_str,
        "files": [
            ase_filename,
            "palette.css",
            "tokens.json",
            "Brand-StyleGuide.html"
        ]
    });

    respond_json(req, 200, resp, cors_origin, json_header);
}

/// POST /api/ase/inspect: inspect Adobe Swatch Exchange (.ASE) binary file
pub fn inspect_ase(
    mut req: Request,
    _state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    // Read up to 10MB of payload
    let mut raw_bytes = Vec::new();
    let _ = req
        .as_reader()
        .take(10 * 1024 * 1024)
        .read_to_end(&mut raw_bytes);

    let ase_bytes = if let Some(pos) = raw_bytes.windows(4).position(|w| w == b"ASEF") {
        // Direct binary ASEF found (either at start or inside multipart upload)
        raw_bytes[pos..].to_vec()
    } else {
        // Attempt JSON parsing with filePath, data/base64, or hex
        #[derive(Deserialize)]
        struct InspectAsePayload {
            #[serde(default, alias = "filePath", alias = "path")]
            file_path: Option<String>,
            #[serde(default, alias = "data", alias = "base64", alias = "content")]
            data: Option<String>,
            #[serde(default)]
            hex: Option<String>,
        }

        if let Ok(payload) = serde_json::from_slice::<InspectAsePayload>(&raw_bytes) {
            if let Some(ref path_str) = payload.file_path {
                let p = Path::new(path_str);
                if p.is_file() {
                    match fs::read(p) {
                        Ok(b) => b,
                        Err(e) => {
                            respond_json(
                                req,
                                400,
                                serde_json::json!({ "success": false, "error": format!("Failed to read ASE file: {}", e) }),
                                cors_origin,
                                json_header,
                            );
                            return;
                        }
                    }
                } else {
                    respond_json(
                        req,
                        404,
                        serde_json::json!({ "success": false, "error": "Specified ASE filePath does not exist" }),
                        cors_origin,
                        json_header,
                    );
                    return;
                }
            } else if let Some(ref b64_str) = payload.data {
                match decode_base64_bytes(b64_str) {
                    Some(b) => b,
                    None => {
                        respond_json(
                            req,
                            400,
                            serde_json::json!({ "success": false, "error": "Invalid base64 encoding in ASE data payload" }),
                            cors_origin,
                            json_header,
                        );
                        return;
                    }
                }
            } else if let Some(ref hex_str) = payload.hex {
                match hex::decode(hex_str.trim()) {
                    Ok(b) => b,
                    Err(e) => {
                        respond_json(
                            req,
                            400,
                            serde_json::json!({ "success": false, "error": format!("Invalid hex encoding: {}", e) }),
                            cors_origin,
                            json_header,
                        );
                        return;
                    }
                }
            } else {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": "Payload missing filePath, data/base64, or valid ASEF binary" }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        } else {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Invalid request payload: expected binary ASEF stream or JSON" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    match parse_ase_bytes(&ase_bytes) {
        Ok(colors) => {
            let total = colors.len();
            let resp = AseInspectResponse {
                success: true,
                total_colors: total,
                version: "1.0".to_string(),
                block_count: total,
                colors,
            };
            respond_json_str(
                req,
                200,
                serde_json::to_string(&resp).unwrap_or_default(),
                cors_origin,
                json_header,
            );
        }
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
        }
    }
}

/// POST /api/workspaces/open-folder: opens physical workspace folder or subfolder in Windows Explorer
pub fn open_workspace_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct OpenWorkspaceFolderReq {
        #[serde(default)]
        id: String,
        #[serde(default)]
        subfolder: Option<String>,
        #[serde(default)]
        folder_path: Option<String>,
    }

    let parsed = match serde_json::from_str::<OpenWorkspaceFolderReq>(&body) {
        Ok(p) => p,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid JSON payload: {}", e) }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let ws_id = if parsed.id.trim().is_empty() {
        "fontivo-brand-system"
    } else {
        parsed.id.trim()
    };

    let safe_id = match validate_workspace_id(ws_id) {
        Ok(id) => id,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    // Sync workspace physical files first if workspace exists
    {
        let st = state.read().unwrap();
        let dir = get_workspaces_dir(&st.data_dir);
        if let Some(ws) = load_workspace_from_disk(&dir, safe_id) {
            let _ = sync_workspace_physical_files(&ws, &st.fonts, parsed.folder_path.as_deref());
        }
    }

    let base_dir = match ensure_workspace_physical_dir(safe_id, parsed.folder_path.as_deref()) {
        Ok(d) => d,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let sub_raw = parsed.subfolder.as_deref().unwrap_or("").trim();
    let target_dir = match validate_relative_subfolder(sub_raw) {
        Ok(rel) if rel.is_empty() => base_dir.clone(),
        Ok(rel) => {
            let mut p = base_dir.clone();
            for seg in rel.split('/') {
                p = p.join(seg);
            }
            p
        }
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let _ = fs::create_dir_all(&target_dir);

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn();
    }

    let path_str = target_dir.to_string_lossy().to_string();
    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": safe_id,
            "subfolder": sub_raw,
            "folderPath": path_str,
            "subfolders": ["Fonts", "Designs", "Palettes", "Guidelines"]
        }),
        cors_origin,
        json_header,
    );
}

fn encode_uri_component_safe(val: &str) -> String {
    let mut out = String::with_capacity(val.len());
    for byte in val.as_bytes() {
        let ch = *byte;
        if ch.is_ascii_alphanumeric() || matches!(ch, b'-' | b'_' | b'.' | b'~' | b'/') {
            out.push(ch as char);
        } else {
            out.push_str(&format!("%{:02X}", ch));
        }
    }
    out
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDesignFile {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub subfolder: String,
    pub extension: String,
    pub format: String,
    pub size: u64,
    pub fonts_used: Vec<String>,
    pub used_fonts: Vec<String>,
    pub missing_fonts: Vec<String>,
    pub all_active: bool,
    pub preview_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFontFile {
    pub name: String,
    pub path: String,
    pub family: String,
    pub style: String,
    pub format: String,
    pub size: u64,
    pub is_arabic: bool,
    pub is_active: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderTreeNode {
    pub name: String,
    pub path: String,
    pub depth: usize,
    pub design_count: usize,
    pub font_count: usize,
}

/// POST /api/workspaces/scan-folder: recursively scans folder (depth <= 4, max 500 files)
/// for `.psd/.ai/.indd/.pdf/.svg/.png/.jpg/.webp/.fig/.xd` design files and `.ttf/.otf/.ttc` font files
pub fn scan_workspace_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct ScanFolderReq {
        #[serde(default, alias = "workspaceId")]
        id: Option<String>,
        #[serde(default)]
        folder_path: Option<String>,
    }

    let parsed = match serde_json::from_str::<ScanFolderReq>(&body) {
        Ok(p) => p,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid JSON payload: {}", e) }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let (data_dir, fonts_snapshot) = {
        let st = state.read().unwrap();
        (st.data_dir.clone(), st.fonts.clone())
    };
    let ws_dir = get_workspaces_dir(&data_dir);
    let ws_custom_root = parsed
        .id
        .as_deref()
        .and_then(|id| load_workspace_from_disk(&ws_dir, id))
        .and_then(|w| w.folder_path);

    let target_folder = if let Some(fp) =
        parsed.folder_path.as_ref().filter(|s| !s.trim().is_empty())
    {
        if fp.contains("..") || fp.contains('\0') {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Security violation: path traversal is forbidden" }),
                cors_origin,
                json_header,
            );
            return;
        }
        let candidate = PathBuf::from(fp.trim());
        if !candidate.exists() && parsed.id.is_some() {
            ensure_workspace_physical_dir(
                parsed.id.as_deref().unwrap_or("default"),
                ws_custom_root.as_deref(),
            )
            .unwrap_or(candidate)
        } else {
            candidate
        }
    } else if let Some(id_str) = parsed.id.as_ref().filter(|s| !s.trim().is_empty()) {
        match ensure_workspace_physical_dir(id_str, ws_custom_root.as_deref()) {
            Ok(d) => d,
            Err(e) => {
                respond_json(
                    req,
                    400,
                    serde_json::json!({ "success": false, "error": e }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        }
    } else {
        respond_json(
            req,
            400,
            serde_json::json!({ "success": false, "error": "Either 'folderPath' or workspace 'id' is required" }),
            cors_origin,
            json_header,
        );
        return;
    };

    if !target_folder.exists() || !target_folder.is_dir() {
        respond_json(
            req,
            404,
            serde_json::json!({ "success": false, "error": "Target folder does not exist or is not a directory" }),
            cors_origin,
            json_header,
        );
        return;
    }

    let mut design_files: Vec<DiscoveredDesignFile> = Vec::new();
    let mut font_files: Vec<DiscoveredFontFile> = Vec::new();
    let mut subfolder_tree: Vec<SubfolderTreeNode> = Vec::new();
    let mut discovered_folders: Vec<String> = Vec::new();
    let mut all_fonts_used_set = std::collections::HashSet::new();
    let mut total_scanned = 0usize;

    #[allow(clippy::too_many_arguments)]
    fn walk_workspace_dir(
        root: &Path,
        dir: &Path,
        ws_id: Option<&str>,
        fonts_snapshot: &[crate::server::state::FontRecord],
        depth: usize,
        total_scanned: &mut usize,
        design_files: &mut Vec<DiscoveredDesignFile>,
        font_files: &mut Vec<DiscoveredFontFile>,
        subfolder_tree: &mut Vec<SubfolderTreeNode>,
        discovered_folders: &mut Vec<String>,
        all_fonts_used_set: &mut std::collections::HashSet<String>,
    ) {
        if depth > 4 || *total_scanned >= 500 {
            return;
        }

        let mut local_designs = 0usize;
        let mut local_fonts = 0usize;
        let mut child_dirs = Vec::new();

        if let Ok(rel_dir) = dir.strip_prefix(root) {
            let rel_str = rel_dir.to_string_lossy().replace('\\', "/");
            if !rel_str.is_empty() {
                discovered_folders.push(rel_str);
            }
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if *total_scanned >= 500 {
                    break;
                }
                let p = entry.path();
                if p.is_dir() {
                    child_dirs.push(p);
                    continue;
                }
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let fname = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file")
                    .to_string();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                if matches!(
                    ext.as_str(),
                    "psd" | "ai" | "indd" | "pdf" | "svg" | "png" | "jpg" | "jpeg" | "webp" | "fig" | "xd"
                ) {
                    *total_scanned += 1;
                    local_designs += 1;
                    let extracted = if matches!(ext.as_str(), "psd" | "ai" | "indd" | "pdf" | "svg") {
                        crate::scanner::AdobeScanner::extract_font_names(&p).unwrap_or_default()
                    } else {
                        Vec::new()
                    };
                    let mut missing_fonts = Vec::new();
                    for ufont in &extracted {
                        all_fonts_used_set.insert(ufont.clone());
                        let ulow = ufont.to_ascii_lowercase();
                        let active_match = fonts_snapshot.iter().any(|f| {
                            f.is_active
                                && (f.name.to_ascii_lowercase().contains(&ulow)
                                    || f.family
                                        .as_deref()
                                        .map(|fam| fam.to_ascii_lowercase().contains(&ulow))
                                        .unwrap_or(false))
                        });
                        if !active_match {
                            missing_fonts.push(ufont.clone());
                        }
                    }

                    let rel_file = p
                        .strip_prefix(root)
                        .ok()
                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|| fname.clone());
                    let rel_sub = p
                        .parent()
                        .and_then(|par| par.strip_prefix(root).ok())
                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "Designs".to_string());
                    let is_image = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "svg");
                    let preview_url = if is_image {
                        ws_id.map(|id_str| {
                            format!(
                                "/api/workspaces/{}/asset?path={}",
                                id_str,
                                encode_uri_component_safe(&rel_file)
                            )
                        })
                    } else {
                        None
                    };

                    design_files.push(DiscoveredDesignFile {
                        name: fname,
                        path: p.to_string_lossy().to_string(),
                        relative_path: rel_file,
                        subfolder: rel_sub,
                        extension: ext.to_uppercase(),
                        format: ext.to_uppercase(),
                        size,
                        fonts_used: extracted.clone(),
                        used_fonts: extracted,
                        all_active: missing_fonts.is_empty(),
                        missing_fonts,
                        preview_url,
                    });
                } else if matches!(ext.as_str(), "ttf" | "otf" | "ttc") {
                    *total_scanned += 1;
                    local_fonts += 1;
                    let meta = crate::parser::FontParser::parse_file(&p).ok();
                    let family = meta.as_ref().map(|m| m.family.clone()).unwrap_or_else(|| {
                        p.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or(&fname)
                            .to_string()
                    });
                    let style = meta
                        .as_ref()
                        .map(|m| m.subfamily.clone())
                        .unwrap_or_else(|| "Regular".to_string());
                    let is_arabic = meta
                        .as_ref()
                        .map(|m| m.coverage.supports_arabic)
                        .unwrap_or(false);
                    let fam_low = family.to_ascii_lowercase();
                    let name_low = fname.to_ascii_lowercase();
                    let is_active = fonts_snapshot.iter().any(|f| {
                        f.is_active
                            && (f.name.to_ascii_lowercase() == name_low
                                || f.family
                                    .as_deref()
                                    .map(|fam| fam.to_ascii_lowercase() == fam_low)
                                    .unwrap_or(false))
                    });
                    all_fonts_used_set.insert(family.clone());

                    font_files.push(DiscoveredFontFile {
                        name: fname,
                        path: p.to_string_lossy().to_string(),
                        family,
                        style,
                        format: ext.to_uppercase(),
                        size,
                        is_arabic,
                        is_active,
                    });
                }
            }
        }

        let dir_name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Root")
            .to_string();
        subfolder_tree.push(SubfolderTreeNode {
            name: dir_name,
            path: dir.to_string_lossy().to_string(),
            depth,
            design_count: local_designs,
            font_count: local_fonts,
        });

        for child in child_dirs {
            walk_workspace_dir(
                root,
                &child,
                ws_id,
                fonts_snapshot,
                depth + 1,
                total_scanned,
                design_files,
                font_files,
                subfolder_tree,
                discovered_folders,
                all_fonts_used_set,
            );
        }
    }

    walk_workspace_dir(
        &target_folder,
        &target_folder,
        parsed.id.as_deref(),
        &fonts_snapshot,
        0,
        &mut total_scanned,
        &mut design_files,
        &mut font_files,
        &mut subfolder_tree,
        &mut discovered_folders,
        &mut all_fonts_used_set,
    );

    let mut fonts_used: Vec<String> = all_fonts_used_set.into_iter().collect();
    fonts_used.sort();

    let now_sec = current_timestamp();
    if let Ok(mut st) = state.write() {
        st.record_operation(crate::server::state::SystemOperation {
            id: format!("op-scan-{}", now_sec),
            title: format!(
                "Workspace Folder Scan ({})",
                target_folder
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Project")
            ),
            kind: "workspace_scan".to_string(),
            status: "completed".to_string(),
            progress_percent: 100.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            processed_items: total_scanned,
            total_items: total_scanned,
            speed_bps: 0,
            message: format!(
                "Discovered {} design file(s) and {} font file(s)",
                design_files.len(),
                font_files.len()
            ),
            updated_at: now_sec,
        });
    }

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": parsed.id,
            "folderPath": target_folder.to_string_lossy().to_string(),
            "totalScanned": total_scanned,
            "designFiles": design_files,
            "fontFiles": font_files,
            "fontsUsed": fonts_used,
            "subfolderTree": subfolder_tree,
            "discoveredFolders": discovered_folders
        }),
        cors_origin,
        json_header,
    );
}

/// POST /api/workspaces/:id/folders: create a nested folder (Folder inside Folder) on disk cleanly
pub fn create_workspace_folder(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct CreateFolderReq {
        #[serde(default)]
        parent_path: Option<String>,
        #[serde(default)]
        folder_name: Option<String>,
        #[serde(default)]
        relative_path: Option<String>,
    }

    let parsed = serde_json::from_str::<CreateFolderReq>(&body).unwrap_or_default();
    let combined = if let Some(ref rel) = parsed.relative_path {
        rel.clone()
    } else {
        let parent = parsed.parent_path.as_deref().unwrap_or("").trim();
        let name = parsed.folder_name.as_deref().unwrap_or("").trim();
        if parent.is_empty() {
            name.to_string()
        } else {
            format!("{}/{}", parent.trim_end_matches(['/', '\\']), name)
        }
    };

    let clean_rel = match validate_relative_subfolder(&combined) {
        Ok(r) if !r.is_empty() => r,
        Ok(_) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Folder name cannot be empty" }),
                cors_origin,
                json_header,
            );
            return;
        }
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };
    let ws_dir = get_workspaces_dir(&data_dir);
    let mut ws_opt = load_workspace_from_disk(&ws_dir, safe_id);
    let custom_root = ws_opt.as_ref().and_then(|w| w.folder_path.as_deref());

    let phys_root = match ensure_workspace_physical_dir(safe_id, custom_root) {
        Ok(d) => d,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut target_path = phys_root.clone();
    for seg in clean_rel.split('/') {
        target_path = target_path.join(seg);
    }

    if let Err(e) = fs::create_dir_all(&target_path) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to create folder: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    if let Some(ref mut ws) = ws_opt {
        if !ws
            .folders
            .iter()
            .any(|f| f.eq_ignore_ascii_case(&clean_rel))
        {
            ws.folders.push(clean_rel.clone());
            let _ = save_workspace_to_disk(&ws_dir, ws);
        }
    }

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": safe_id,
            "relativePath": clean_rel,
            "folderPath": target_path.to_string_lossy().to_string()
        }),
        cors_origin,
        json_header,
    );
}

/// POST /api/workspaces/:id/upload-design?fileName=...&subfolder=...
pub fn upload_workspace_design(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(valid) => valid,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let raw_name = query_params
        .get("fileName")
        .or_else(|| query_params.get("filename"))
        .cloned()
        .unwrap_or_else(|| "Design.png".to_string());
    let clean_name = Path::new(&raw_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Design.png")
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'], "_");
    let ext = Path::new(&clean_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if !matches!(
        ext.as_str(),
        "psd" | "ai" | "indd" | "pdf" | "svg" | "png" | "jpg" | "jpeg" | "webp" | "fig" | "xd"
    ) {
        respond_json(
            req,
            400,
            serde_json::json!({
                "success": false,
                "error": "Unsupported design format. Allowed: psd, ai, indd, pdf, svg, png, jpg, jpeg, webp, fig, xd"
            }),
            cors_origin,
            json_header,
        );
        return;
    }

    let sub_raw = query_params
        .get("subfolder")
        .map(|s| s.as_str())
        .unwrap_or("Designs");
    let clean_sub = match validate_relative_subfolder(sub_raw) {
        Ok(r) if !r.is_empty() => r,
        Ok(_) => "Designs".to_string(),
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut bytes = Vec::new();
    let cap = 64 * 1024 * 1024 + 1;
    if req
        .as_reader()
        .take(cap as u64)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.is_empty()
    {
        respond_json(
            req,
            400,
            serde_json::json!({ "success": false, "error": "Empty or unreadable design upload" }),
            cors_origin,
            json_header,
        );
        return;
    }
    if bytes.len() > 64 * 1024 * 1024 {
        respond_json(
            req,
            413,
            serde_json::json!({ "success": false, "error": "Design file exceeds 64 MB limit" }),
            cors_origin,
            json_header,
        );
        return;
    }

    let (data_dir, fonts_snapshot) = {
        let st = state.read().unwrap();
        (st.data_dir.clone(), st.fonts.clone())
    };
    let ws_dir = get_workspaces_dir(&data_dir);
    let mut ws_opt = load_workspace_from_disk(&ws_dir, safe_id);
    let phys_root = match ensure_workspace_physical_dir(
        safe_id,
        ws_opt.as_ref().and_then(|w| w.folder_path.as_deref()),
    ) {
        Ok(d) => d,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut target_dir = phys_root.clone();
    for seg in clean_sub.split('/') {
        target_dir = target_dir.join(seg);
    }
    if let Err(e) = fs::create_dir_all(&target_dir) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to create target folder: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    let dest_path = target_dir.join(&clean_name);
    if let Err(e) = fs::write(&dest_path, &bytes) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to save design file: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    let used_fonts = if matches!(ext.as_str(), "psd" | "ai" | "indd" | "pdf" | "svg") {
        crate::scanner::AdobeScanner::extract_font_names(&dest_path).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut missing_fonts = Vec::new();
    for ufont in &used_fonts {
        let ulow = ufont.to_ascii_lowercase();
        let active_match = fonts_snapshot.iter().any(|f| {
            f.is_active
                && (f.name.to_ascii_lowercase().contains(&ulow)
                    || f.family
                        .as_deref()
                        .map(|fam| fam.to_ascii_lowercase().contains(&ulow))
                        .unwrap_or(false))
        });
        if !active_match {
            missing_fonts.push(ufont.clone());
        }
    }

    let rel_file = format!("{}/{}", clean_sub, clean_name);
    if let Some(ref mut ws) = ws_opt {
        if !ws
            .folders
            .iter()
            .any(|f| f.eq_ignore_ascii_case(&clean_sub))
        {
            ws.folders.push(clean_sub.clone());
            let _ = save_workspace_to_disk(&ws_dir, ws);
        }
    }

    let is_image = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "svg");
    let preview_url = if is_image {
        Some(format!(
            "/api/workspaces/{}/asset?path={}",
            safe_id,
            encode_uri_component_safe(&rel_file)
        ))
    } else {
        None
    };

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "design": {
                "name": clean_name,
                "path": dest_path.to_string_lossy().to_string(),
                "relativePath": rel_file,
                "subfolder": clean_sub,
                "format": ext.to_uppercase(),
                "size": bytes.len(),
                "usedFonts": used_fonts,
                "missingFonts": missing_fonts,
                "allActive": missing_fonts.is_empty(),
                "previewUrl": preview_url
            }
        }),
        cors_origin,
        json_header,
    );
}

/// POST /api/workspaces/save-palette: persists updated color palette + writes Palettes/palette.{ase,css,json}
pub fn save_workspace_palette(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct SavePaletteReq {
        #[serde(default, alias = "id")]
        workspace_id: Option<String>,
        #[serde(default)]
        palette: Vec<WorkspaceColor>,
    }

    let parsed = match serde_json::from_str::<SavePaletteReq>(&body) {
        Ok(p) => p,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid palette payload: {}", e) }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let safe_id = match parsed
        .workspace_id
        .as_deref()
        .map(validate_workspace_id)
        .transpose()
    {
        Ok(Some(v)) => v,
        _ => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Missing or invalid workspaceId" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let (data_dir, fonts_snapshot) = {
        let st = state.read().unwrap();
        (st.data_dir.clone(), st.fonts.clone())
    };
    let ws_dir = get_workspaces_dir(&data_dir);
    let mut ws = load_workspace_from_disk(&ws_dir, safe_id).unwrap_or_else(|| Workspace {
        id: safe_id.to_string(),
        name: safe_id.to_string(),
        ..Default::default()
    });
    ws.palette = parsed
        .palette
        .into_iter()
        .map(|mut c| {
            c.hex = sanitize_hex_color(&c.hex);
            c
        })
        .collect();
    ws.updated_at = current_timestamp();

    if let Err(e) = save_workspace_to_disk(&ws_dir, &ws) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": e }),
            cors_origin,
            json_header,
        );
        return;
    }

    let phys = sync_workspace_physical_files(&ws, &fonts_snapshot, ws.folder_path.as_deref())
        .ok()
        .map(|d| d.join("Palettes").join("palette.ase").to_string_lossy().to_string());

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": safe_id,
            "asePath": phys,
            "paletteCount": ws.palette.len()
        }),
        cors_origin,
        json_header,
    );
}

/// DELETE /api/workspaces/:id/design-file?path=...: removes an uploaded design asset cleanly from disk
pub fn delete_workspace_design_file(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(v) => v,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let rel_raw = query_params.get("path").map(|s| s.as_str()).unwrap_or("");
    let clean_rel = match validate_relative_subfolder(rel_raw) {
        Ok(r) if !r.is_empty() => r,
        _ => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Invalid file path" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };
    let (_, root) = match resolve_existing_workspace_root(&data_dir, safe_id) {
        Ok(r) => r,
        Err((status, e)) => {
            respond_json(
                req,
                status,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut target = root.clone();
    for seg in clean_rel.split('/') {
        target = target.join(seg);
    }

    let ok_contained = match (root.canonicalize(), target.canonicalize()) {
        (Ok(cr), Ok(ct)) => ct.starts_with(cr) && ct.is_file(),
        _ => false,
    };
    if !ok_contained {
        respond_json(
            req,
            404,
            serde_json::json!({ "success": false, "error": "Design file not found" }),
            cors_origin,
            json_header,
        );
        return;
    }

    if let Err(e) = fs::remove_file(&target) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to delete file: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    respond_json(
        req,
        200,
        serde_json::json!({ "success": true, "removedPath": clean_rel }),
        cors_origin,
        json_header,
    );
}

/// GET /api/workspaces/:id/asset?path=...: serves safe image thumbnails / project logos inside a workspace
pub fn serve_workspace_asset(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(v) => v,
        Err(_) => {
            let mut res = tiny_http::Response::from_string("Invalid ID")
                .with_status_code(tiny_http::StatusCode(400));
            res.add_header(cors_origin);
            let _ = req.respond(res);
            return;
        }
    };
    let rel_raw = query_params.get("path").map(|s| s.as_str()).unwrap_or("");
    let clean_rel = match validate_relative_subfolder(rel_raw) {
        Ok(r) if !r.is_empty() => r,
        _ => {
            let mut res = tiny_http::Response::from_string("Invalid asset path")
                .with_status_code(tiny_http::StatusCode(400));
            res.add_header(cors_origin);
            let _ = req.respond(res);
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };
    let (_, root) = match resolve_existing_workspace_root(&data_dir, safe_id) {
        Ok(r) => r,
        Err(_) => {
            let mut res = tiny_http::Response::from_string("Workspace not found")
                .with_status_code(tiny_http::StatusCode(404));
            res.add_header(cors_origin);
            let _ = req.respond(res);
            return;
        }
    };

    let mut target = root.clone();
    for seg in clean_rel.split('/') {
        target = target.join(seg);
    }

    let ok_contained = match (root.canonicalize(), target.canonicalize()) {
        (Ok(cr), Ok(ct)) => ct.starts_with(cr) && ct.is_file(),
        _ => false,
    };

    if !ok_contained {
        let mut res = tiny_http::Response::from_string("Asset not found")
            .with_status_code(tiny_http::StatusCode(404));
        res.add_header(cors_origin);
        let _ = req.respond(res);
        return;
    }

    if let Ok(bytes) = fs::read(&target) {
        let ext = target
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            "pdf" => "application/pdf",
            "html" => "text/html; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            _ => "application/octet-stream",
        };
        let mime_h = Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap();
        let mut res = tiny_http::Response::from_data(bytes);
        res.add_header(cors_origin);
        res.add_header(mime_h);
        super::common::add_security_headers(&mut res);
        let _ = req.respond(res);
    }
}

/// Validates and resolves a relative file path inside a workspace root directory.
pub fn resolve_workspace_file_path<'a>(
    data_dir: &Path,
    id: &'a str,
    rel_raw: &str,
) -> Result<(&'a str, String, PathBuf), (u16, String)> {
    let safe_id = validate_workspace_id(id).map_err(|e| (400, e))?;
    let clean_rel = validate_relative_subfolder(rel_raw).map_err(|e| (400, e))?;
    if clean_rel.is_empty() {
        return Err((400, "File path cannot be empty".to_string()));
    }

    let (_, root) = resolve_existing_workspace_root(data_dir, safe_id)?;

    let mut target = root.clone();
    for seg in clean_rel.split('/') {
        target = target.join(seg);
    }

    if !target.exists() {
        return Err((404, "Workspace file not found".to_string()));
    }

    let canon_root = root
        .canonicalize()
        .map_err(|e| (500, format!("Failed to resolve workspace root: {}", e)))?;
    let canon_target = target
        .canonicalize()
        .map_err(|e| (404, format!("Failed to resolve workspace file: {}", e)))?;

    if !canon_target.starts_with(&canon_root) {
        return Err((
            403,
            "Security violation: file path escapes workspace root".to_string(),
        ));
    }
    if !canon_target.is_file() {
        return Err((400, "Target path is not a file".to_string()));
    }

    let clean_path = crate::server::state::strip_windows_verbatim_prefix(&canon_target);
    Ok((safe_id, clean_rel, clean_path))
}

/// POST /api/workspaces/:id/open-file: validates workspace file path and launches OS default viewer
pub fn open_workspace_file(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenFileReq {
        #[serde(alias = "relativePath")]
        path: String,
    }

    let parsed = match serde_json::from_str::<OpenFileReq>(&body) {
        Ok(p) => p,
        Err(e) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": format!("Invalid JSON payload: {}", e) }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };

    let (safe_id, clean_rel, launch_path) =
        match resolve_workspace_file_path(&data_dir, id, &parsed.path) {
            Ok(resolved) => resolved,
            Err((status, err)) => {
                respond_json(
                    req,
                    status,
                    serde_json::json!({ "success": false, "error": err }),
                    cors_origin,
                    json_header,
                );
                return;
            }
        };

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(&launch_path)
            .spawn();
    }
    #[cfg(not(windows))]
    {
        #[cfg(target_os = "macos")]
        let opener = "open";
        #[cfg(not(target_os = "macos"))]
        let opener = "xdg-open";
        let _ = std::process::Command::new(opener)
            .arg(&launch_path)
            .spawn();
    }

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": safe_id,
            "relativePath": clean_rel,
            "filePath": launch_path.to_string_lossy().to_string()
        }),
        cors_origin,
        json_header,
    );
}

/// DELETE /api/workspaces/:id/folders?path=...: deletes a nested workspace subfolder (depth >= 2)
/// while strictly protecting the 4 base folders (`Fonts`, `Designs`, `Palettes`, `Guidelines`).
pub fn delete_workspace_folder(
    req: Request,
    state: &Arc<RwLock<AppState>>,
    id: &str,
    query_params: &std::collections::HashMap<String, String>,
    cors_origin: Header,
    json_header: Header,
) {
    let safe_id = match validate_workspace_id(id) {
        Ok(v) => v,
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let rel_raw = query_params
        .get("path")
        .or_else(|| query_params.get("subfolder"))
        .map(|s| s.as_str())
        .unwrap_or("");
    let clean_rel = match validate_relative_subfolder(rel_raw) {
        Ok(r) if !r.is_empty() => r,
        Ok(_) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Folder path cannot be empty" }),
                cors_origin,
                json_header,
            );
            return;
        }
        Err(err) => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": err }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let segments: Vec<&str> = clean_rel.split('/').collect();
    let is_allowed_base = segments
        .first()
        .map(|s| {
            matches!(
                s.to_ascii_lowercase().as_str(),
                "fonts" | "designs" | "palettes" | "guidelines"
            )
        })
        .unwrap_or(false);
    if segments.len() < 2 || !is_allowed_base {
        respond_json(
            req,
            400,
            serde_json::json!({
                "success": false,
                "error": "Cannot delete protected base workspace folders (Fonts, Designs, Palettes, Guidelines); subfolder depth must be >= 2"
            }),
            cors_origin,
            json_header,
        );
        return;
    }

    let data_dir = {
        let st = state.read().unwrap();
        st.data_dir.clone()
    };
    let ws_dir = get_workspaces_dir(&data_dir);
    let (mut ws_opt, root) = match resolve_existing_workspace_root(&data_dir, safe_id) {
        Ok(r) => r,
        Err((status, e)) => {
            respond_json(
                req,
                status,
                serde_json::json!({ "success": false, "error": e }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let mut target = root.clone();
    for seg in &segments {
        target = target.join(seg);
    }

    if !target.exists() {
        respond_json(
            req,
            404,
            serde_json::json!({ "success": false, "error": "Workspace subfolder not found" }),
            cors_origin,
            json_header,
        );
        return;
    }

    let (canon_root, canon_target) = match (root.canonicalize(), target.canonicalize()) {
        (Ok(cr), Ok(ct)) => (cr, ct),
        _ => {
            respond_json(
                req,
                400,
                serde_json::json!({ "success": false, "error": "Failed to resolve folder path" }),
                cors_origin,
                json_header,
            );
            return;
        }
    };

    let is_protected_base = ["Fonts", "Designs", "Palettes", "Guidelines"]
        .iter()
        .any(|base| {
            root.join(base)
                .canonicalize()
                .map(|cb| cb == canon_target)
                .unwrap_or(false)
        });

    if !canon_target.starts_with(&canon_root)
        || canon_target == canon_root
        || is_protected_base
        || !canon_target.is_dir()
    {
        respond_json(
            req,
            400,
            serde_json::json!({
                "success": false,
                "error": "Security violation: cannot delete workspace root or protected base folders"
            }),
            cors_origin,
            json_header,
        );
        return;
    }

    if let Err(e) = fs::remove_dir_all(&canon_target) {
        respond_json(
            req,
            500,
            serde_json::json!({ "success": false, "error": format!("Failed to delete folder: {}", e) }),
            cors_origin,
            json_header,
        );
        return;
    }

    let clean_low = clean_rel.to_ascii_lowercase();
    let child_prefix = format!("{}/", clean_low);
    let updated_folders = if let Some(ref mut ws) = ws_opt {
        ws.folders.retain(|f| {
            let fn_norm = f
                .trim()
                .replace('\\', "/")
                .trim_matches('/')
                .to_ascii_lowercase();
            fn_norm != clean_low && !fn_norm.starts_with(&child_prefix)
        });
        ws.pinned_assets.retain(|p| {
            let pn_norm = p
                .trim()
                .replace('\\', "/")
                .trim_matches('/')
                .to_ascii_lowercase();
            pn_norm != clean_low && !pn_norm.starts_with(&child_prefix)
        });
        ws.updated_at = current_timestamp();
        let _ = save_workspace_to_disk(&ws_dir, ws);
        ws.folders.clone()
    } else {
        Vec::new()
    };

    respond_json(
        req,
        200,
        serde_json::json!({
            "success": true,
            "id": safe_id,
            "removedPath": clean_rel,
            "folders": updated_folders
        }),
        cors_origin,
        json_header,
    );
}
