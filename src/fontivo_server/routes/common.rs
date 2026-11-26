use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tiny_http::{Header, Request, Response, StatusCode};

pub const CONTENT_SECURITY_POLICY: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data: blob:; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

pub fn add_security_headers<R: Read>(res: &mut Response<R>) {
    res.add_header(Header::from_bytes(&b"X-Content-Type-Options"[..], &b"nosniff"[..]).unwrap());
    res.add_header(Header::from_bytes(&b"X-Frame-Options"[..], &b"DENY"[..]).unwrap());
    res.add_header(Header::from_bytes(&b"Referrer-Policy"[..], &b"no-referrer"[..]).unwrap());
    res.add_header(
        Header::from_bytes(
            &b"Content-Security-Policy"[..],
            CONTENT_SECURITY_POLICY.as_bytes(),
        )
        .unwrap(),
    );
}

pub fn respond_json_str(
    req: Request,
    status: u16,
    body: String,
    cors_origin: Header,
    json_header: Header,
) {
    let mut res = Response::from_string(body).with_status_code(StatusCode(status));
    res.add_header(cors_origin);
    res.add_header(json_header);
    add_security_headers(&mut res);
    let _ = req.respond(res);
}

pub fn respond_json(
    req: Request,
    status: u16,
    body: serde_json::Value,
    cors_origin: Header,
    json_header: Header,
) {
    respond_json_str(req, status, body.to_string(), cors_origin, json_header);
}

pub fn read_body(req: &mut tiny_http::Request) -> String {
    let mut body = String::new();
    // Cap request body to 2 MB to prevent memory exhaustion DoS
    let _ = req
        .as_reader()
        .take(2 * 1024 * 1024)
        .read_to_string(&mut body);
    body
}

pub fn urlencoding_decode(val: &str) -> String {
    let mut out: Vec<u8> = Vec::with_capacity(val.len());
    let bytes = val.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(hex);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn decode_base64_bytes(input: &str) -> Option<Vec<u8>> {
    let clean = input.trim();
    let clean = if let Some(pos) = clean.find(";base64,") {
        &clean[pos + 8..]
    } else {
        clean
    };

    let b64_table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [255u8; 256];
    for (i, &b) in b64_table.iter().enumerate() {
        table[b as usize] = i as u8;
    }

    let bytes: Vec<u8> = clean
        .bytes()
        .filter(|&b| b != b'=' && b != b'\r' && b != b'\n' && b != b' ')
        .collect();

    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = table[bytes[i] as usize];
        let b1 = if i + 1 < bytes.len() {
            table[bytes[i + 1] as usize]
        } else {
            0
        };
        let b2 = if i + 2 < bytes.len() {
            table[bytes[i + 2] as usize]
        } else {
            0
        };
        let b3 = if i + 3 < bytes.len() {
            table[bytes[i + 3] as usize]
        } else {
            0
        };

        if b0 == 255 || b1 == 255 {
            return None;
        }

        out.push((b0 << 2) | (b1 >> 4));
        if i + 2 < bytes.len() {
            if b2 == 255 {
                return None;
            }
            out.push(((b1 & 0x0f) << 4) | (b2 >> 2));
        }
        if i + 3 < bytes.len() {
            if b3 == 255 {
                return None;
            }
            out.push(((b2 & 0x03) << 6) | b3);
        }
        i += 4;
    }

    Some(out)
}

pub fn walk_fonts_in_dir(dir: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut results = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if let Ok(sub) = walk_fonts_in_dir(&path) {
                    results.extend(sub);
                }
            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_l = ext.to_lowercase();
                if ext_l == "ttf"
                    || ext_l == "otf"
                    || ext_l == "woff"
                    || ext_l == "woff2"
                    || ext_l == "ttc"
                {
                    results.push(path);
                }
            }
        }
    }
    Ok(results)
}
