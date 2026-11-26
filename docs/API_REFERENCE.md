# Fontivo v1.0 — API Reference Manual

> **Version**: 1.0.0 (Release Edition) 
> **Repository**: [https://github.com/Ahmedfahmy8308/Fontivo](https://github.com/Ahmedfahmy8308/Fontivo) 
> **Base URL**: `http://127.0.0.1:3920` 
> **Adobe CC Socket Bridge**: `127.0.0.1:27715` (Raw TCP JSON) 
> **Security Binding**: Strictly loopback `127.0.0.1`

---

## Endpoints Overview

| Category | Endpoint | Method | Description |
| ------------------- | ----------------------------------- | -------- | ------------------------------------------- |
| **Core & Stats** | `/api/stats` | `GET` | Returns global font counts and statistics |
| **Fonts Library** | `/api/fonts` | `GET` | Paginated and filtered font records |
| **Families** | `/api/families` | `GET` | Grouped font families with coverage flags |
| **File Streaming** | `/api/font-file/:id` | `GET` | Streams binary font bytes (TTF/OTF) |
| **Glyphs** | `/api/font-glyphs/:id` | `GET` | Extracts glyph coverage and unicode indices |
| **Activation** | `/api/activate` | `POST` | Injects font into RAM via Win32 GDI32 |
| **Deactivation** | `/api/deactivate` | `POST` | Drops font handles from RAM |
| **Batch Lifecycle** | `/api/activate-all` | `POST` | Activates all selected or library fonts |
| **Batch Lifecycle** | `/api/deactivate-all` | `POST` | Purges all active fonts from RAM |
| **Collections** | `/api/collections` | `GET` | Lists all smart and custom collections |
| **Collections** | `/api/collections/create` | `POST` | Creates a new user collection |
| **Collections** | `/api/collections/:name` | `DELETE` | Deletes a user collection |
| **Brand Kits** | `/api/brand-kits` | `GET` | Lists all brand identity kits |
| **Brand Kits** | `/api/brand-kits` | `POST` | Saves/updates a brand kit |
| **Brand Kits** | `/api/brand-kits/:id` | `DELETE` | Deletes a brand kit |
| **Brand Kits** | `/api/brand-kits/:id/activate` | `POST` | Activates all kit fonts into RAM |
| **Brand Kits** | `/api/brand-kits/:id/export-bundle` | `POST` | Generates .ASE swatches & HTML style guide |
| **Adobe Inspector** | `/api/inspect-design-file` | `POST` | Extracts text layer fonts from PSD/AI |
| **Dialogs** | `/api/dialog/pick-design-file` | `POST` | Native OS file picker for PSD/AI |
| **Dialogs** | `/api/dialog/pick-folder` | `POST` | Native OS folder picker to add font folders |
| **System & Health** | `/api/system/ram-status` | `GET` | Returns process & system memory stats |
| **System & Health** | `/api/system/optimize-ram` | `POST` | Trims working set and flushes memory |
| **System & Health** | `/api/system/restore-default-fonts` | `POST` | Restores default Windows fonts |
| **System & Health** | `/api/clean-registry-fonts` | `POST` | Audits and purges orphaned registry keys |
| **Updater** | `/api/check-update` | `GET` | Checks for official releases |
| **Window State** | `/api/window/minimize` | `POST` | Minimizes native frameless window |
| **Window State** | `/api/window/maximize` | `POST` | Toggles maximized/restored window |
| **Window State** | `/api/window/close` | `POST` | Safely terminates application |

---

## Detailed API Specifications

### 1. Global Statistics: `GET /api/stats`

Returns system-wide counts across libraries, scripts, and status.

**Response**:

```json
{
 "total": 11207,
 "active": 4,
 "inactive": 11203,
 "favorites": 12,
 "recent": 100,
 "googleCount": 8312,
 "arabicCount": 4360,
 "englishCount": 6737,
 "symbolsCount": 110,
 "familiesCount": 4438
}
```

---

### 2. Font File Streaming: `GET /api/font-file/:id`

Streams the binary font bytes securely by internal integer ID. Prevents path traversal vulnerabilities.

- **Request**: `GET /api/font-file/42`
- **Response Headers**:
 - `Content-Type: font/ttf` or `font/otf`
 - `Cache-Control: public, max-age=31536000`
- **Response Body**: Raw binary font data.

---

### 3. In-Memory Activation: `POST /api/activate`

Injects a font into RAM using Win32 GDI32 `AddFontResourceExW(FR_PRIVATE)` and broadcasts `WM_FONTCHANGE`.

**Request**:

```json
{
 "id": 42
}
```

**Response**:

```json
{
 "success": true,
 "message": "Font activated in RAM successfully",
 "fontId": 42
}
```

---

### 4. Brand Kits Management: `GET /api/brand-kits`

Returns all persistent brand identity kits stored in `%APPDATA%\Fontivo\brand-kits.json`.

**Response**:

```json
[
 {
 "id": "bk-fintech",
 "name": "Fintech & Mobile Banking App",
 "client": "Apex Digital Bank",
 "headingFontId": "100",
 "bodyFontId": "101",
 "notes": "Primary modern digital banking typography system",
 "createdAt": 1700000000,
 "colors": [
 { "name": "Primary Blue", "hex": "#0284c7", "role": "primary" },
 { "name": "Emerald Green", "hex": "#10b981", "role": "secondary" },
 { "name": "Amber Alert", "hex": "#f59e0b", "role": "accent" },
 { "name": "Dark Slate", "hex": "#0f172a", "role": "text" },
 { "name": "Light Canvas", "hex": "#f8fafc", "role": "background" }
 ]
 }
]
```

---

### 5. Export Client Handoff Bundle: `POST /api/brand-kits/:id/export-bundle`

Generates a complete client handoff package including font files, native Adobe `.ase` swatches, and offline HTML style guide.

**Request**:

```json
{}
```

**Response**:

```json
{
 "success": true,
 "bundlePath": "C:\\Users\\User\\Desktop\\Apex-Digital-Bank-Handoff",
 "files": [
 "brand-palette.ase",
 "palette.json",
 "palette.css",
 "Brand-StyleGuide.html",
 "Fonts/HeadingFont.ttf",
 "Fonts/BodyFont.ttf"
 ]
}
```

---

### 6. Adobe Creative Cloud Socket Bridge: Port `27715`

Direct TCP socket listener communicating with Adobe CEP extensions.

**Request (JSON over TCP)**:

```json
{
 "action": "query_or_activate",
 "postScriptName": "Tajawal-Bold"
}
```

**Response**:

```json
{
 "status": "activated",
 "fontId": 142,
 "family": "Tajawal",
 "postScriptName": "Tajawal-Bold"
}
```
