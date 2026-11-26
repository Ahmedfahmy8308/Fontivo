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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTask {
    pub id: String,
    pub text: String,
    #[serde(default = "default_task_status")]
    pub status: String, // "todo", "in_progress", "done"
    #[serde(default = "current_timestamp", alias = "createdAt")]
    pub created_at: u64,
}

fn default_task_status() -> String {
    "todo".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String, // Brand
    #[serde(default)]
    pub client: Option<String>,
    #[serde(default)]
    pub business: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "current_timestamp", alias = "updatedAt")]
    pub updated_at: u64,
    #[serde(default)]
    pub typography: WorkspaceTypography,
    #[serde(default, alias = "colors")]
    pub palette: Vec<WorkspaceColor>,
    #[serde(default)]
    pub tasks: Vec<WorkspaceTask>,
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
    let dir = data_dir.join("workspaces");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Resolves the physical project directory on disk (`%LOCALAPPDATA%\Fontivo\Workspaces\<safe_id>\`)
/// and ensures all 4 physical subfolders (`Fonts/`, `Designs/`, `Palettes/`, `Guidelines/`) exist.
pub fn ensure_workspace_physical_dir(
    ws_id: &str,
    custom_folder: Option<&str>,
) -> Result<PathBuf, String> {
    let safe_id = validate_workspace_id(ws_id)?;
    let project_root = if let Some(custom) =
        custom_folder.map(|s| s.trim()).filter(|s| !s.is_empty())
    {
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
        PathBuf::from(custom)
    } else {
        let base = env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| crate::engine::lifecycle::get_app_data_dir());
        let fontivo_base = if base.ends_with("Fontivo") {
            base
        } else {
            base.join("Fontivo")
        };
        fontivo_base.join("Workspaces").join(safe_id)
    };

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

    // 1. Copy workspace typography fonts into Fonts/
    let typography_slots = [
        &ws.typography.heading_font,
        &ws.typography.body_font,
        &ws.typography.accent_font,
        &ws.typography.code_font,
    ];

    for f_item in typography_slots.into_iter().flatten() {
        let mut resolved_font = None;
        if let Some(fid) = f_item.font_id {
            resolved_font = fonts_snapshot.iter().find(|f| f.id == fid);
        }
        if resolved_font.is_none() {
            if let Some(ref p) = f_item.path {
                resolved_font = fonts_snapshot.iter().find(|f| f.path == *p);
            }
        }
        if resolved_font.is_none() {
            if let Some(ref name) = f_item.name {
                let clean = name.to_lowercase();
                resolved_font = fonts_snapshot.iter().find(|f| {
                    f.name.to_lowercase().contains(&clean)
                        || f.family
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&clean)
                });
            }
        }

        if let Some(font) = resolved_font {
            let src = AppState::resolve_usable_font_path(&font.path);
            if src.is_file() {
                let dest_name = Path::new(&font.name)
                    .file_name()
                    .or_else(|| src.file_name())
                    .unwrap_or_default();
                let _ = fs::copy(&src, fonts_dir.join(dest_name));
            }
        } else if let Some(ref p_str) = f_item.path {
            let src = Path::new(p_str);
            if src.is_file() {
                if let Some(fname) = src.file_name() {
                    let _ = fs::copy(src, fonts_dir.join(fname));
                }
            }
        }
    }

    // 2. Write Palettes/palette.json
    let palette_json = serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "client": ws.client,
        "business": ws.business,
        "updatedAt": ws.updated_at,
        "palette": ws.palette,
        "typography": {
            "heading": ws.typography.heading_font,
            "body": ws.typography.body_font,
            "accent": ws.typography.accent_font,
            "code": ws.typography.code_font,
        }
    });
    let _ = fs::write(
        palettes_dir.join("palette.json"),
        serde_json::to_string_pretty(&palette_json).unwrap_or_default(),
    );

    // 3. Write Palettes/palette.css
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

    let _ = sync_workspace_physical_files(ws, &[], None);

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
                client: None,
                business: None,
                description: None,
                updated_at: current_timestamp(),
                typography: WorkspaceTypography::default(),
                palette: Vec::new(),
                tasks: Vec::new(),
                notes,
                success: Some(true),
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
            },
            WorkspaceTask {
                id: "task-2".to_string(),
                text: "Extract and verify WCAG 2.1 AAA color contrast ratios".to_string(),
                status: "in_progress".to_string(),
                created_at: current_timestamp() - 3600,
            },
            WorkspaceTask {
                id: "task-3".to_string(),
                text: "Export Adobe Swatch Exchange (.ASE) and CSS tokens bundle".to_string(),
                status: "todo".to_string(),
                created_at: current_timestamp(),
            },
        ],
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
        tasks_html.push_str(&format!(
            r#"<li class="task-item">
                <span class="task-text">{text}</span>
                {status}
            </li>"#,
            text = escape_html(&t.text),
            status = status_badge
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
        heading_name = heading_name,
        body_name = body_name,
        accent_name = accent_name,
        code_name = code_name,
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

/// POST /api/workspaces: save or update a workspace
pub fn save_workspace(
    mut req: Request,
    state: &Arc<RwLock<AppState>>,
    cors_origin: Header,
    json_header: Header,
) {
    let body = read_body(&mut req);
    if let Ok(mut ws) = serde_json::from_str::<Workspace>(&body) {
        if ws.id.trim().is_empty() {
            ws.id = format!("ws-{}", current_timestamp());
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
        let _ = sync_workspace_physical_files(&ws, &fonts_snapshot, None);

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
        400,
        serde_json::json!({ "success": false, "error": "Invalid workspace JSON payload" }),
        cors_origin,
        json_header,
    );
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
    if let Ok(mut ws) = serde_json::from_str::<Workspace>(&body) {
        if ws.id.trim().is_empty() {
            ws.id = safe_url_id.to_string();
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
        let _ = sync_workspace_physical_files(&ws, &fonts_snapshot, None);

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
        400,
        serde_json::json!({ "success": false, "error": "Invalid workspace JSON payload" }),
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

    let mut removed = false;
    if json_path.exists() {
        let _ = fs::remove_file(json_path);
        removed = true;
    }
    if yaml_path.exists() {
        let _ = fs::remove_file(yaml_path);
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

    let typography_slots: Vec<Option<TypographyFont>> = vec![
        ws.typography.heading_font,
        ws.typography.body_font,
        ws.typography.accent_font,
        ws.typography.code_font,
    ];

    for font_opt in typography_slots.into_iter().flatten() {
        let target_font = if let Some(fid) = font_opt.font_id {
            st.fonts.iter().find(|f| f.id == fid).cloned()
        } else if let Some(ref path_str) = font_opt.path {
            st.fonts.iter().find(|f| f.path == *path_str).cloned()
        } else if let Some(ref name_str) = font_opt.name {
            let clean = name_str.to_lowercase();
            st.fonts
                .iter()
                .find(|f| {
                    f.name.to_lowercase().contains(&clean)
                        || f.family
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&clean)
                        || f.post_script_name
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&clean)
                })
                .cloned()
        } else {
            None
        };

        if let Some(font) = target_font {
            let usable = AppState::resolve_usable_font_path(&font.path);
            if usable.exists() {
                let _ = st.activator.activate_ram(&usable.to_string_lossy());
                st.active_font_ids.insert(font.id);
                activated_ids.push(font.id);
                activated_names.push(font.family.unwrap_or(font.name));
            }
        } else if let Some(ref path_str) = font_opt.path {
            let usable = AppState::resolve_usable_font_path(path_str);
            if usable.exists() {
                let _ = st.activator.activate_ram(&usable.to_string_lossy());
                activated_names.push(font_opt.name.unwrap_or_else(|| {
                    usable
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                }));
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

    // 1. Copy workspace typography fonts if present on disk
    let typography_slots = [
        &ws.typography.heading_font,
        &ws.typography.body_font,
        &ws.typography.accent_font,
        &ws.typography.code_font,
    ];

    for f_item in typography_slots.into_iter().flatten() {
        let mut resolved_path: Option<PathBuf> = None;
        if let Some(fid) = f_item.font_id {
            if let Some(font) = fonts_snapshot.iter().find(|f| f.id == fid) {
                resolved_path = Some(PathBuf::from(&font.path));
            }
        } else if let Some(ref p) = f_item.path {
            resolved_path = Some(PathBuf::from(p));
        } else if let Some(ref name) = f_item.name {
            let clean = name.to_lowercase();
            if let Some(font) = fonts_snapshot
                .iter()
                .find(|f| f.name.to_lowercase().contains(&clean))
            {
                resolved_path = Some(PathBuf::from(&font.path));
            }
        }

        if let Some(src) = resolved_path {
            let usable = AppState::resolve_usable_font_path(&src.to_string_lossy());
            if usable.is_file() {
                if let Some(fname) = src.file_name().or_else(|| usable.file_name()) {
                    let _ = fs::copy(&usable, fonts_dir.join(fname));
                }
            }
        }
    }

    // 2. Generate tokens.json
    let tokens_path = project_dir.join("tokens.json");
    let tokens_payload = serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "client": ws.client,
        "business": ws.business,
        "description": ws.description,
        "exportedAt": current_timestamp(),
        "typography": {
            "heading": ws.typography.heading_font,
            "body": ws.typography.body_font,
            "accent": ws.typography.accent_font,
            "code": ws.typography.code_font,
        },
        "palette": ws.palette,
        "tasks": ws.tasks,
        "notes": ws.notes,
    });
    let _ = fs::write(
        &tokens_path,
        serde_json::to_string_pretty(&tokens_payload).unwrap_or_default(),
    );

    // 3. Generate palette.css (sanitized against CSS injection)
    let palette_css_path = project_dir.join("palette.css");
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
    let target_dir = match sub_raw.to_ascii_lowercase().as_str() {
        "" => base_dir.clone(),
        "fonts" => base_dir.join("Fonts"),
        "designs" => base_dir.join("Designs"),
        "palettes" => base_dir.join("Palettes"),
        "guidelines" => base_dir.join("Guidelines"),
        _ => {
            respond_json(
                req,
                400,
                serde_json::json!({
                    "success": false,
                    "error": "Invalid subfolder: allowed values are 'Fonts', 'Designs', 'Palettes', 'Guidelines', or ''"
                }),
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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDesignFile {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub fonts_used: Vec<String>,
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
/// for `.psd/.ai/.indd/.pdf/.svg` design files and `.ttf/.otf/.ttc` font files
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
        #[serde(default)]
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
        PathBuf::from(fp.trim())
    } else if let Some(id_str) = parsed.id.as_ref().filter(|s| !s.trim().is_empty()) {
        match ensure_workspace_physical_dir(id_str, None) {
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
    let mut all_fonts_used_set = std::collections::HashSet::new();
    let mut total_scanned = 0usize;

    fn walk_workspace_dir(
        dir: &Path,
        depth: usize,
        total_scanned: &mut usize,
        design_files: &mut Vec<DiscoveredDesignFile>,
        font_files: &mut Vec<DiscoveredFontFile>,
        subfolder_tree: &mut Vec<SubfolderTreeNode>,
        all_fonts_used_set: &mut std::collections::HashSet<String>,
    ) {
        if depth > 4 || *total_scanned >= 500 {
            return;
        }

        let mut local_designs = 0usize;
        let mut local_fonts = 0usize;
        let mut child_dirs = Vec::new();

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

                if matches!(ext.as_str(), "psd" | "ai" | "indd" | "pdf" | "svg") {
                    *total_scanned += 1;
                    local_designs += 1;
                    let extracted =
                        crate::scanner::AdobeScanner::extract_font_names(&p).unwrap_or_default();
                    for f in &extracted {
                        all_fonts_used_set.insert(f.clone());
                    }
                    design_files.push(DiscoveredDesignFile {
                        name: fname,
                        path: p.to_string_lossy().to_string(),
                        extension: ext.to_uppercase(),
                        size,
                        fonts_used: extracted,
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
                    all_fonts_used_set.insert(family.clone());

                    font_files.push(DiscoveredFontFile {
                        name: fname,
                        path: p.to_string_lossy().to_string(),
                        family,
                        style,
                        format: ext.to_uppercase(),
                        size,
                        is_arabic,
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
                &child,
                depth + 1,
                total_scanned,
                design_files,
                font_files,
                subfolder_tree,
                all_fonts_used_set,
            );
        }
    }

    walk_workspace_dir(
        &target_folder,
        0,
        &mut total_scanned,
        &mut design_files,
        &mut font_files,
        &mut subfolder_tree,
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
            "subfolderTree": subfolder_tree
        }),
        cors_origin,
        json_header,
    );
}
