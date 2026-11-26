use Fontivo::server::routes::workspaces::{generate_ase_binary, parse_ase_bytes, WorkspaceColor};

// =========================================================================
// 1. Header Magic, Big-Endian Version, & Exact Byte Offsets
// =========================================================================

#[test]
fn test_ase_header_magic_and_version_offsets() {
    let colors = vec![WorkspaceColor {
        name: "Cyan Accent".to_string(),
        hex: "#00FFFF".to_string(),
        role: "accent".to_string(),
    }];

    let ase_bytes = generate_ase_binary(&colors);

    // Minimum ASE size: 12 bytes header + 1 color block (>= 32 bytes)
    assert!(
        ase_bytes.len() >= 40,
        "ASE binary output is too short: {} bytes",
        ase_bytes.len()
    );

    // Byte Offset 0..4: Magic signature "ASEF"
    assert_eq!(
        &ase_bytes[0..4],
        b"ASEF",
        "Offset 0..4 must strictly be ASCII 'ASEF'"
    );

    // Byte Offset 4..6: Major version = 1 (Big-Endian u16)
    let major_version = u16::from_be_bytes([ase_bytes[4], ase_bytes[5]]);
    assert_eq!(
        major_version, 1,
        "Offset 4..6 must be Major version 1 in Big-Endian"
    );

    // Byte Offset 6..8: Minor version = 0 (Big-Endian u16)
    let minor_version = u16::from_be_bytes([ase_bytes[6], ase_bytes[7]]);
    assert_eq!(
        minor_version, 0,
        "Offset 6..8 must be Minor version 0 in Big-Endian"
    );

    // Byte Offset 8..12: Block count = 1 (Big-Endian u32)
    let block_count =
        u32::from_be_bytes([ase_bytes[8], ase_bytes[9], ase_bytes[10], ase_bytes[11]]);
    assert_eq!(
        block_count, 1,
        "Offset 8..12 must be block count 1 in Big-Endian"
    );
}

// =========================================================================
// 2. Exact Byte Offsets, UTF-16BE Name Encoding, & IEEE 754 Big-Endian Floats
// =========================================================================

#[test]
fn test_ase_color_block_exact_byte_layout_and_ieee754_floats() {
    // Pure Red swatch: #FF0000 with name "Red"
    let color_name = "Red";
    let colors = vec![WorkspaceColor {
        name: color_name.to_string(),
        hex: "#FF0000".to_string(),
        role: "primary".to_string(),
    }];

    let ase_bytes = generate_ase_binary(&colors);

    // Block 0 starts at offset 12
    let mut offset = 12;

    // Offset 12..14: Block Type = 0x0001 (Color entry in Big-Endian)
    let block_type = u16::from_be_bytes([ase_bytes[offset], ase_bytes[offset + 1]]);
    assert_eq!(
        block_type, 0x0001,
        "Offset 12..14 must be Color Block type 0x0001"
    );
    offset += 2;

    // Offset 14..18: Block Length (Big-Endian u32)
    let block_len = u32::from_be_bytes([
        ase_bytes[offset],
        ase_bytes[offset + 1],
        ase_bytes[offset + 2],
        ase_bytes[offset + 3],
    ]) as usize;
    offset += 4;

    // The block length covers everything remaining in this block:
    // 2 (name_len) + (name_chars.len() * 2) + 4 (model) + 12 (3 * float32) + 2 (type)
    let expected_name_chars = color_name.len() + 1; // including null terminator
    let expected_block_len = 2 + (expected_name_chars * 2) + 4 + 12 + 2;
    assert_eq!(
        block_len, expected_block_len,
        "Block length mismatch: got {}, expected {}",
        block_len, expected_block_len
    );

    // Offset 18..20: Name Length in UTF-16 code units (including null terminator)
    let name_len = u16::from_be_bytes([ase_bytes[offset], ase_bytes[offset + 1]]) as usize;
    assert_eq!(
        name_len, 4,
        "Name 'Red' + null terminator must be 4 UTF-16 code units"
    );
    offset += 2;

    // Name Characters in UTF-16BE:
    // 'R' = 0x0052, 'e' = 0x0065, 'd' = 0x0064, '\0' = 0x0000
    let expected_name_bytes = [
        0x00, 0x52, // 'R'
        0x00, 0x65, // 'e'
        0x00, 0x64, // 'd'
        0x00, 0x00, // '\0'
    ];
    assert_eq!(
        &ase_bytes[offset..offset + 8],
        &expected_name_bytes,
        "UTF-16BE name encoding does not match expected Big-Endian byte pattern"
    );
    offset += 8;

    // Color Model: 4 bytes ASCII "RGB "
    assert_eq!(
        &ase_bytes[offset..offset + 4],
        b"RGB ",
        "Color space model must be 'RGB '"
    );
    offset += 4;

    // IEEE 754 32-bit floats in Big-Endian:
    // Red   = 255.0 / 255.0 = 1.0f32 -> Big-Endian bytes [0x3F, 0x80, 0x00, 0x00]
    // Green = 0.0 / 255.0   = 0.0f32 -> Big-Endian bytes [0x00, 0x00, 0x00, 0x00]
    // Blue  = 0.0 / 255.0   = 0.0f32 -> Big-Endian bytes [0x00, 0x00, 0x00, 0x00]
    let r_bytes = [
        ase_bytes[offset],
        ase_bytes[offset + 1],
        ase_bytes[offset + 2],
        ase_bytes[offset + 3],
    ];
    let g_bytes = [
        ase_bytes[offset + 4],
        ase_bytes[offset + 5],
        ase_bytes[offset + 6],
        ase_bytes[offset + 7],
    ];
    let b_bytes = [
        ase_bytes[offset + 8],
        ase_bytes[offset + 9],
        ase_bytes[offset + 10],
        ase_bytes[offset + 11],
    ];

    assert_eq!(
        r_bytes,
        1.0f32.to_be_bytes(),
        "Red float 1.0f32 must match Big-Endian IEEE 754 [0x3F, 0x80, 0x00, 0x00]"
    );
    assert_eq!(
        g_bytes,
        0.0f32.to_be_bytes(),
        "Green float 0.0f32 must match Big-Endian IEEE 754 [0x00, 0x00, 0x00, 0x00]"
    );
    assert_eq!(
        b_bytes,
        0.0f32.to_be_bytes(),
        "Blue float 0.0f32 must match Big-Endian IEEE 754 [0x00, 0x00, 0x00, 0x00]"
    );

    let r_float = f32::from_be_bytes(r_bytes);
    let g_float = f32::from_be_bytes(g_bytes);
    let b_float = f32::from_be_bytes(b_bytes);

    assert!((r_float - 1.0).abs() < 1e-6);
    assert!((g_float - 0.0).abs() < 1e-6);
    assert!((b_float - 0.0).abs() < 1e-6);
    offset += 12;

    // Swatch Type: 0x0002 (Normal swatch)
    let swatch_type = u16::from_be_bytes([ase_bytes[offset], ase_bytes[offset + 1]]);
    assert_eq!(
        swatch_type, 0x0002,
        "Offset for swatch type must be Normal (0x0002)"
    );
    offset += 2;

    assert_eq!(
        offset,
        ase_bytes.len(),
        "All bytes accounted for in exact byte offset assertion"
    );
}

// =========================================================================
// 3. UTF-16BE Arabic & Multilingual Character Encoding
// =========================================================================

#[test]
fn test_ase_utf16be_multilingual_arabic_encoding() {
    let arabic_palette = vec![
        WorkspaceColor {
            name: "أزرق نيلي".to_string(), // Indigo Blue
            hex: "#1E40AF".to_string(),
            role: "primary".to_string(),
        },
        WorkspaceColor {
            name: "أخضر زمردي".to_string(), // Emerald Green
            hex: "#059669".to_string(),
            role: "secondary".to_string(),
        },
    ];

    let ase_bytes = generate_ase_binary(&arabic_palette);

    // Verify roundtrip parsing recovers Arabic strings perfectly
    let parsed = parse_ase_bytes(&ase_bytes).expect("Failed to parse Arabic ASE binary");
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0].name, "أزرق نيلي");
    assert_eq!(parsed[1].name, "أخضر زمردي");

    // Manually assert Big-Endian Arabic UTF-16 code units for "أزرق نيلي"
    // 'أ' = 0x0623, 'ز' = 0x0632, 'ر' = 0x0631, 'ق' = 0x0642, ' ' = 0x0020,
    // 'ن' = 0x0646, 'ي' = 0x064A, 'ل' = 0x0644, 'ي' = 0x064A, '\0' = 0x0000
    let mut expected_be = Vec::new();
    for c in "أزرق نيلي".encode_utf16().chain(std::iter::once(0)) {
        expected_be.extend_from_slice(&c.to_be_bytes());
    }

    // Name starts after header (12) + block_type (2) + block_len (4) + name_len (2) = 20
    let name_start = 20;
    let name_slice = &ase_bytes[name_start..name_start + expected_be.len()];
    assert_eq!(
        name_slice,
        expected_be.as_slice(),
        "Arabic characters must be encoded as true UTF-16BE code units"
    );
}

// =========================================================================
// 4. Full Palette Roundtrip & Spec Compliance
// =========================================================================

#[test]
fn test_ase_full_brand_kit_palette_roundtrip() {
    let brand_palette = vec![
        WorkspaceColor {
            name: "Brand Primary".to_string(),
            hex: "#6366F1".to_string(),
            role: "primary".to_string(),
        },
        WorkspaceColor {
            name: "Brand Slate Dark".to_string(),
            hex: "#0F172A".to_string(),
            role: "background".to_string(),
        },
        WorkspaceColor {
            name: "Amber Highlight".to_string(),
            hex: "#F59E0B".to_string(),
            role: "accent".to_string(),
        },
        WorkspaceColor {
            name: "Emerald Success".to_string(),
            hex: "#10B981".to_string(),
            role: "secondary".to_string(),
        },
        WorkspaceColor {
            name: "Pure White Text".to_string(),
            hex: "#FFFFFF".to_string(),
            role: "text".to_string(),
        },
        WorkspaceColor {
            name: "Pure Black Shade".to_string(),
            hex: "#000000".to_string(),
            role: "custom".to_string(),
        },
    ];

    let ase_bytes = generate_ase_binary(&brand_palette);
    assert!(!ase_bytes.is_empty());

    let parsed_colors = parse_ase_bytes(&ase_bytes).expect("Roundtrip parsing failed");
    assert_eq!(parsed_colors.len(), brand_palette.len());

    for (orig, parsed) in brand_palette.iter().zip(parsed_colors.iter()) {
        assert_eq!(&parsed.name, &orig.name);
        assert_eq!(
            parsed.hex.to_uppercase(),
            orig.hex.to_uppercase(),
            "Hex mismatch for color '{}'",
            orig.name
        );
        assert_eq!(parsed.color_space, "RGB");
    }
}

// =========================================================================
// 5. Adobe Photoshop / Illustrator Spec Compliance: Groups and Edge Cases
// =========================================================================

#[test]
fn test_ase_photoshop_illustrator_spec_compliance() {
    // 1. Minimum valid ASE file (0 swatches)
    {
        let empty_palette: Vec<WorkspaceColor> = Vec::new();
        let bytes = generate_ase_binary(&empty_palette);
        assert_eq!(bytes.len(), 12);
        assert_eq!(&bytes[0..4], b"ASEF");
        assert_eq!(&bytes[8..12], &[0, 0, 0, 0]);

        let parsed = parse_ase_bytes(&bytes).expect("Empty ASE must parse successfully");
        assert_eq!(parsed.len(), 0);
    }

    // 2. Reject files shorter than 12-byte header
    {
        let truncated = b"ASEF\x00\x01";
        let res = parse_ase_bytes(truncated);
        assert!(res.is_err(), "Files < 12 bytes must fail");
    }

    // 3. Reject invalid magic signatures
    {
        let mut bad_magic = vec![0u8; 12];
        bad_magic[0..4].copy_from_slice(b"NOPE");
        let res = parse_ase_bytes(&bad_magic);
        assert!(res.is_err(), "Invalid magic must fail");
    }

    // 4. Manually construct Adobe Group Blocks (0xC001 Start Group, 0xC002 End Group)
    {
        let mut grouped_ase = Vec::new();
        grouped_ase.extend_from_slice(b"ASEF");
        grouped_ase.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // Version 1.0
        grouped_ase.extend_from_slice(&3u32.to_be_bytes()); // 3 blocks: Group Start, Swatch, Group End

        // Block 1: Group Start (0xC001)
        grouped_ase.extend_from_slice(&[0xC0, 0x01]);
        let grp_name = "Brand Identity\0";
        let grp_chars: Vec<u16> = grp_name.encode_utf16().collect();
        let grp_len = (2 + grp_chars.len() * 2) as u32;
        grouped_ase.extend_from_slice(&grp_len.to_be_bytes());
        grouped_ase.extend_from_slice(&(grp_chars.len() as u16).to_be_bytes());
        for c in grp_chars {
            grouped_ase.extend_from_slice(&c.to_be_bytes());
        }

        // Block 2: Swatch inside group
        let swatch = WorkspaceColor {
            name: "Inside Group Blue".to_string(),
            hex: "#2563EB".to_string(),
            role: "primary".to_string(),
        };
        let single_swatch_bytes = generate_ase_binary(&[swatch]);
        grouped_ase.extend_from_slice(&single_swatch_bytes[12..]); // Append color block only

        // Block 3: Group End (0xC002) with 0-length
        grouped_ase.extend_from_slice(&[0xC0, 0x02]);
        grouped_ase.extend_from_slice(&0u32.to_be_bytes());

        // Parse with group-aware parser
        let parsed = parse_ase_bytes(&grouped_ase).expect("Grouped ASE must parse successfully");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Inside Group Blue");
        assert_eq!(parsed[0].group.as_deref(), Some("Brand Identity"));
    }
}
