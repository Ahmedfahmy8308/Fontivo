use std::fs;
use std::io::Write;
use std::panic;
use Fontivo::parser::FontParser;
use Fontivo::scanner::AdobeScanner;

// =========================================================================
// 1. Truncated Header Fuzzing (0 to 12 bytes)
// =========================================================================

#[test]
fn test_fuzz_truncated_headers() {
    let magic_signatures: [&[u8]; 5] = [
        &[0x00, 0x01, 0x00, 0x00], // TrueType
        b"OTTO",                   // OpenType CFF
        b"ttcf",                   // TrueType Collection
        b"wOFF",                   // WOFF 1.0
        b"wOF2",                   // WOFF 2.0
    ];

    for magic in &magic_signatures {
        // Build mock 12-byte SFNT header with numTables=1, searchRange, etc.
        let mut full_header = Vec::new();
        full_header.extend_from_slice(magic);
        full_header.extend_from_slice(&[0x00, 0x01]); // numTables = 1
        full_header.extend_from_slice(&[0x00, 0x10]); // searchRange = 16
        full_header.extend_from_slice(&[0x00, 0x00]); // entrySelector = 0
        full_header.extend_from_slice(&[0x00, 0x00]); // rangeShift = 0

        // Test every truncation slice from length 0 to 12
        for len in 0..=full_header.len() {
            let slice = &full_header[..len];

            // 1. Format detection must never panic on truncated buffers
            let fmt = FontParser::detect_format(slice);
            assert!(
                fmt == "unknown"
                    || fmt == "ttf"
                    || fmt == "otf"
                    || fmt == "ttc"
                    || fmt == "woff"
                    || fmt == "woff2",
                "Format detector returned unexpected format '{}' on truncated slice len {}",
                fmt,
                len
            );

            // 2. Parser must safely return Err without panic
            let parse_res =
                panic::catch_unwind(|| FontParser::parse_bytes(slice, "truncated_fuzz_test"));

            assert!(
                parse_res.is_ok(),
                "Panic detected on truncated header slice len {}",
                len
            );
            let result = parse_res.unwrap();
            assert!(
                result.is_err(),
                "Truncated font header (len {}) should fail parsing gracefully",
                len
            );
        }
    }
}

// =========================================================================
// 2. Corrupted Table Offsets and Negative/Overflowing Lengths
// =========================================================================

#[test]
fn test_fuzz_corrupted_table_offsets_and_lengths() {
    // A minimal valid SFNT header has 12 bytes header + 16 bytes per table record
    let header_prefixes: [&[u8]; 2] = [
        &[0x00, 0x01, 0x00, 0x00], // TTF
        b"OTTO",                   // OTF
    ];

    let invalid_offset_length_pairs: [(u32, u32); 10] = [
        (0xFFFFFFFF, 100),        // Offset at u32::MAX
        (100, 0xFFFFFFFF),        // Length at u32::MAX (integer overflow risk)
        (0x80000000, 0x80000000), // Both MSBs set (signed negative interpretation)
        (500, 0),                 // Zero-length table
        (0, 100),                 // Offset 0 (overlapping header)
        (12, 1000000),            // Length far exceeds total file size
        (u32::MAX - 5, 10),       // Offset + Length overflows u32
        (64, 4),                  // Misaligned table boundary
        (100, 20),                // Pointing past EOF
        (0x7FFFFFFF, 100),        // Max positive signed 32-bit int
    ];

    let test_tags = [b"head", b"name", b"cmap", b"maxp", b"hhea", b"OS/2"];

    for magic in &header_prefixes {
        for (offset, length) in &invalid_offset_length_pairs {
            for tag in &test_tags {
                let mut data = Vec::with_capacity(64);
                // SFNT Header
                data.extend_from_slice(magic);
                data.extend_from_slice(&1u16.to_be_bytes()); // 1 table
                data.extend_from_slice(&16u16.to_be_bytes()); // searchRange
                data.extend_from_slice(&0u16.to_be_bytes()); // entrySelector
                data.extend_from_slice(&0u16.to_be_bytes()); // rangeShift

                // Table Record: tag (4) + checksum (4) + offset (4) + length (4) = 16 bytes
                data.extend_from_slice(*tag);
                data.extend_from_slice(&0x12345678u32.to_be_bytes()); // fake checksum
                data.extend_from_slice(&offset.to_be_bytes());
                data.extend_from_slice(&length.to_be_bytes());

                // Append a few dummy data bytes (total file size ~40 bytes)
                data.extend_from_slice(&[0xAA; 12]);

                let res =
                    panic::catch_unwind(|| FontParser::parse_bytes(&data, "corrupt_table_fuzz"));

                assert!(
                    res.is_ok(),
                    "Panic caught on tag {:?} with offset 0x{:08X}, length 0x{:08X}",
                    tag,
                    offset,
                    length
                );
                assert!(
                    res.unwrap().is_err(),
                    "Corrupted table offset/length must return Err safely"
                );
            }
        }
    }
}

// =========================================================================
// 3. Decompression Bomb & Cyclic / Infinite Loop Font Structures
// =========================================================================

#[test]
fn test_fuzz_decompression_bomb_and_cycle_structures() {
    // Scenario A: Claiming 65,535 tables with 0-byte payload
    {
        let mut data = Vec::new();
        data.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // TTF
        data.extend_from_slice(&0xFFFFu16.to_be_bytes()); // 65,535 tables claimed
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // padding
                                                                       // File ends abruptly after 12 bytes

        let res = panic::catch_unwind(|| FontParser::parse_bytes(&data, "bomb_num_tables"));
        assert!(res.is_ok(), "Parser panicked on huge numTables!");
        assert!(res.unwrap().is_err());
    }

    // Scenario B: Circular table records (two tables pointing to each other's offsets)
    {
        let mut data = Vec::new();
        data.extend_from_slice(b"OTTO");
        data.extend_from_slice(&2u16.to_be_bytes()); // 2 tables
        data.extend_from_slice(&[0x00, 0x10, 0x00, 0x01, 0x00, 0x00]);

        // Table 1: cmap pointing to Table 2 offset (28 + 16 = 44)
        data.extend_from_slice(b"cmap");
        data.extend_from_slice(&0u32.to_be_bytes());
        data.extend_from_slice(&44u32.to_be_bytes()); // offset 44
        data.extend_from_slice(&32u32.to_be_bytes()); // length 32

        // Table 2: name pointing back to Table 1 offset (12)
        data.extend_from_slice(b"name");
        data.extend_from_slice(&0u32.to_be_bytes());
        data.extend_from_slice(&12u32.to_be_bytes()); // offset 12 (cyclic pointer)
        data.extend_from_slice(&32u32.to_be_bytes());

        // Fill remaining bytes with cyclic repeating pattern
        for i in 0..128 {
            data.push((i % 256) as u8);
        }

        let res = panic::catch_unwind(|| FontParser::parse_bytes(&data, "cyclic_table_pointers"));
        assert!(res.is_ok(), "Parser panicked on circular table offsets!");
        assert!(res.unwrap().is_err());
    }

    // Scenario C: Nested cmap subtable format recursion simulation
    {
        let mut data = Vec::new();
        data.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]);
        data.extend_from_slice(&1u16.to_be_bytes()); // 1 table: cmap
        data.extend_from_slice(&[0x00, 0x10, 0x00, 0x00, 0x00, 0x00]);

        let cmap_offset = 12 + 16;
        data.extend_from_slice(b"cmap");
        data.extend_from_slice(&0u32.to_be_bytes());
        data.extend_from_slice(&(cmap_offset as u32).to_be_bytes());
        data.extend_from_slice(&64u32.to_be_bytes());

        // cmap table header: version 0, numTables 100
        data.extend_from_slice(&0u16.to_be_bytes());
        data.extend_from_slice(&100u16.to_be_bytes());
        // Subtable encodings pointing outside buffer
        for _ in 0..100 {
            data.extend_from_slice(&0x0003u16.to_be_bytes()); // Platform: Windows
            data.extend_from_slice(&0x0001u16.to_be_bytes()); // Encoding: Unicode
            data.extend_from_slice(&0x7FFFFFFFu32.to_be_bytes()); // Malicious huge offset
        }

        let res = panic::catch_unwind(|| FontParser::parse_bytes(&data, "cmap_subtable_fuzz"));
        assert!(res.is_ok(), "Parser panicked on malformed cmap subtables!");
        assert!(res.unwrap().is_err());
    }
}

// =========================================================================
// 4. Random Byte Fuzzed Inputs (1,000+ Iterations)
// =========================================================================

#[test]
fn test_fuzz_random_byte_fuzzed_inputs() {
    // Deterministic linear PRNG (LCG) for reproducible fuzzing
    let mut seed: u64 = 0xDEADBEEF_CAFEBABE;
    let mut next_u32 = || -> u32 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        (seed >> 32) as u32
    };

    let test_sizes = [
        1, 2, 3, 4, 7, 11, 12, 13, 16, 32, 64, 128, 256, 512, 1024, 4096, 16384,
    ];
    let iterations_per_size = 50;

    for &size in &test_sizes {
        for _ in 0..iterations_per_size {
            let mut buffer = vec![0u8; size];
            for b in buffer.iter_mut() {
                *b = (next_u32() & 0xFF) as u8;
            }

            // Occasionally inject valid magic prefixes into random junk
            if size >= 4 && (next_u32() % 3 == 0) {
                let magics = [[0x00, 0x01, 0x00, 0x00], *b"OTTO", *b"ttcf", *b"wOFF"];
                let chosen = magics[(next_u32() as usize) % magics.len()];
                buffer[0..4].copy_from_slice(&chosen);
            }

            let res = panic::catch_unwind(|| FontParser::parse_bytes(&buffer, "random_fuzz"));

            assert!(
                res.is_ok(),
                "CRITICAL: Parser panicked on random fuzz buffer of size {} bytes!",
                size
            );

            // In 99.999% of cases, random bytes return Err. If somehow valid, must not panic.
            let _ = res.unwrap();
        }
    }
}

// =========================================================================
// 5. Adobe Design Scanner Malformed Streams & Expansion Bombs
// =========================================================================

#[test]
fn test_fuzz_adobe_scanner_malformed_inputs() {
    let temp_dir = std::env::temp_dir().join("fontivo_scanner_fuzz_test");
    let _ = fs::create_dir_all(&temp_dir);

    // 1. Unclosed XMP Packet
    {
        let unclosed_xmp = temp_dir.join("corrupt_xmp.psd");
        let payload = b"8BPS\x00\x01\x00\x00\x00\x00\x00\x00<?xpacket begin=\"\xEF\xBB\xBF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\
<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\
<rdf:Description><stFnt:fontName>MaliciousUnclosedFont";
        fs::write(&unclosed_xmp, payload).unwrap();

        let res = panic::catch_unwind(|| AdobeScanner::extract_font_names(&unclosed_xmp));
        assert!(res.is_ok(), "AdobeScanner panicked on unclosed XMP packet!");
        let names = res.unwrap().unwrap_or_default();
        // Should either extract safely or return empty without hanging
        let _ = names;
    }

    // 2. Corrupted /FontSet structure with negative brackets
    {
        let corrupt_ai = temp_dir.join("corrupt_fontset.ai");
        let payload =
            b"%!PS-Adobe-3.0\n/FontSet [ /BrokenName /Another << >> ] \n/FontName /GhostFont def\n";
        fs::write(&corrupt_ai, payload).unwrap();

        let res = panic::catch_unwind(|| AdobeScanner::extract_font_names(&corrupt_ai));
        assert!(
            res.is_ok(),
            "AdobeScanner panicked on corrupt PostScript /FontSet!"
        );
        let _ = res.unwrap();
    }

    // 3. Billion Laughs / Recursive Entity expansion simulation in XML
    {
        let entity_bomb = temp_dir.join("entity_bomb.psd");
        let payload = b"<?xml version=\"1.0\"?>\n<!DOCTYPE lolz [\n <!ENTITY lol \"lol\">\n <!ENTITY lol1 \"&lol;&lol;\">\
 <!ENTITY lol2 \"&lol1;&lol1;\">\n]>\n<root>&lol2;</root>";
        fs::write(&entity_bomb, payload).unwrap();

        let res = panic::catch_unwind(|| AdobeScanner::extract_font_names(&entity_bomb));
        assert!(
            res.is_ok(),
            "AdobeScanner panicked on XML entity structure!"
        );
    }

    let _ = fs::remove_dir_all(&temp_dir);
}
