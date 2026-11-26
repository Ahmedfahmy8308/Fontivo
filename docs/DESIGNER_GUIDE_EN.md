# Fontivo v1.0 — Graphic & UI/UX Designer Handbook

> **Professional Guide for Graphic Designers, Brand Identity Architects, and UI/UX Engineers** 
> **Repository**: [https://github.com/Ahmedfahmy8308/Fontivo](https://github.com/Ahmedfahmy8308/Fontivo) 
> Learn how to leverage Fontivo's native engine to streamline font activation, manage project palettes, export Adobe .ASE swatches, and test interface typography.

---

## Table of Contents

1. [Overview & Performance Advantage](#1-overview--performance-advantage)
2. [On-Demand RAM Font Activation](#2-on-demand-ram-font-activation)
3. [Adobe Creative Cloud Real-Time Integration](#3-adobe-creative-cloud-real-time-integration)
4. [Brand Identity Kits & Client Handoff Bundles](#4-brand-identity-kits--client-handoff-bundles)
5. [Smart Color Palette Extractor & WCAG Contrast](#5-smart-color-palette-extractor--wcag-contrast)
6. [UI/UX Typography Laboratory](#6-uiux-typography-laboratory)
7. [Arabic & Glyph Coverage Inspector](#7-arabic--glyph-coverage-inspector)
8. [System Health, Font Registry Purge & RAM Boost](#8-system-health-font-registry-purge--ram-boost)
9. [Keyboard Shortcuts Reference](#9-keyboard-shortcuts-reference)

---

## 1. Overview & Performance Advantage

Fontivo is designed from scratch in **Rust** to eliminate the bloat, sluggishness, and memory overhead of legacy Electron-based font managers.

- **Ultra-lightweight footprint**: Idles at approximately ~38 MB RAM (compared to 180MB - 350MB in Electron apps).
- **Transient In-Memory Loading**: Never clutters `C:\Windows\Fonts` or writes permanent keys to the Windows Registry. Fonts remain transient in RAM and are completely unloaded when deactivated or when the app exits.
- **Offline & Cloud Ready**: Comes pre-indexed with **11,207 offline fonts** across 4,438 families, plus live sync with Google Fonts.

---

## 2. On-Demand RAM Font Activation

### Activating Single Styles or Whole Families

- **Single Font Activation**: Click the circular indicator next to any font style. It turns vivid green (`●`), and the font becomes immediately usable across all running Windows applications.
- **Family Activation**: Click the activation circle on the header of a font family (e.g. _Inter_ with 18 styles). All weights and variants are injected simultaneously.
- **Instant System Broadcast**: Fontivo fires a native `WM_FONTCHANGE` message, ensuring that Adobe Photoshop, Illustrator, InDesign, Figma, and Microsoft Office refresh their font pickers on the fly without requiring a restart.

---

## 3. Adobe Creative Cloud Real-Time Integration

### Native Port 27715 Socket Listener

Fontivo runs an asynchronous socket listener on loopback port `27715`:

- Adobe Creative Cloud CEP extensions and external automation scripts query `127.0.0.1:27715` to request font activations.
- If Photoshop opens a document with missing fonts, Fontivo resolves matching PostScript names and activates them in memory in under 10 milliseconds.

### Design File Inspector (PSD / AI / INDD)

1. Navigate to the **Adobe CC Bridge** tab in the sidebar.
2. Click **Browse...** to select any `.psd`, `.ai`, or `.indd` file.
3. The native Rust parser extracts all text layers and font metadata without reading gigabytes of raw raster pixels.
4. Click **Activate Matched Fonts** to load every required font into RAM with a single click.

---

## 4. Brand Identity Kits & Client Handoff Bundles

Manage project typography and color tokens systematically:

1. Open the **Brand Kits** tab from the main control bar.
2. Select an existing kit or click **New Brand Kit**.
3. Configure:
 - Client and project name.
 - Primary Heading Font & Body Font.
 - 5-color official palette (Primary, Secondary, Accent, Text, Background).

### Pro Features in Brand Kits:

- **1-Click Project Font Activation**: Injects all heading and body font weights into RAM simultaneously.
- **Copy CSS & Tailwind Tokens**: Instant one-click copy of standard CSS variables or Tailwind CSS configuration code.
- **Export Client Handoff Bundle**:
 Clicking **Export Bundle** creates a standalone project folder on your desktop containing:
 1. `Fonts/`: The validated font files for the project.
 2. `brand-palette.ase`: A compliant **Adobe Swatch Exchange** binary file that opens directly in Photoshop and Illustrator's Swatches palette.
 3. `palette.json`: Complete color data in HEX, RGB, and HSL formats.
 4. `palette.css`: Web-ready CSS custom properties.
 5. `Brand-StyleGuide.html`: A beautiful, standalone, offline HTML style guide showcasing the typography hierarchy and color swatches.

---

## 5. Smart Color Palette Extractor & WCAG Contrast

Extract palettes and test font legibility in real time:

1. In the top toolbar, click **Palette**.
2. Drag and drop any logo, poster, or moodboard image into the drop zone.
3. The extractor calculates pixel histograms to identify the top 5 dominant colors.
4. **WCAG 2.1 Accessibility Evaluation**: The tool automatically calculates the contrast ratio between text and background colors and rates it (**AAA**, **AA**, or **Fail**).
5. **Apply to Canvas Live**: Click the button to dynamically theme the font preview canvas using the extracted colors.

---

## 6. UI/UX Typography Laboratory

Test interface typography before committing to a design system:

1. Click **UI Lab** in the toolbar.
2. **Interactive Components**:
 - Preview fonts on interactive UI buttons (Primary, Outline, Pill, Disabled).
 - Test responsive cards, article previews, and navigation bars.
3. **Tabular Figures & Pricing Alignment**:
 - Verify whether numbers align in multi-column pricing and financial tables.
 - Confirm that the selected font features monospaced digits to prevent decimal drift.
4. **Mathematical Type Scale Generator**:
 - Set your base size (e.g. 16px) and choose a geometric ratio (e.g. _Major Third 1.25_ or _Golden Ratio 1.618_).
 - Generates the complete typography scale from Caption to Display.
 - Copy production-ready CSS and Tailwind token definitions.

---

## 7. Arabic & Glyph Coverage Inspector

Font cards and family groups feature automated coverage badges:

- **`تشكيل `**: Confirms proper OpenType mark positioning (`mark` and `mkmk` tables) for Arabic diacritics.
- **`١٢٣ / 123`**: Indicates support for both Eastern and Western Arabic numerals.
- **`چ گ پ ڤ`**: Confirms extended Arabic glyph support for Persian, Urdu, and Kurdish scripts.

---

## 8. System Health, Font Registry Purge & RAM Boost

- **RAM Optimizer**: Click the RAM badge in the top right to trim working set memory and flush transient caches, instantly reclaiming memory.
- **Windows Font Registry Purge**: If your PC boots slowly due to orphaned registry keys from uninstalled software, click **Font Reset** in the sidebar. It cleans dead references while generating an automatic `.reg` backup.

---

## 9. Keyboard Shortcuts Reference

| Shortcut | Action |
| ------------------ | -------------------------------------------------------------- |
| `Ctrl + F` | Focus font search input |
| `Space` | Toggle activation of selected font |
| `Tab` | Cycle through view modes (Family / Grid / Compact / Editorial) |
| `Ctrl + Shift + R` | Optimize process RAM and flush cache |
| `Esc` | Close any active modal or return from inspector |
| `Ctrl + P` | Open Adobe CC design file inspector |
