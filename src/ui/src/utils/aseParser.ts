// =============================================================================
// Adobe Swatch Exchange (.ASE) Binary Parser & Generator
// Adobe specification compliant ASE binary reader & exporter.
// Compatible with Adobe Photoshop, Illustrator, InDesign, and Figma tokens.
// =============================================================================

import { rgbToHex, hexToRgb } from "./colorUtils";
import { AseColor, AseParseResult } from "../types/palette";

/**
 * Parses binary Adobe Swatch Exchange (.ASE) file from an ArrayBuffer.
 * Specification:
 * - 4 bytes: Magic ASCII "ASEF"
 * - 2 bytes: Major version (1)
 * - 2 bytes: Minor version (0)
 * - 4 bytes: Number of blocks (uint32)
 * - Blocks: 0x0001 (Color), 0xC001 (Group start), 0xC002 (Group end)
 */
export function parseAseBuffer(buffer: ArrayBuffer): AseParseResult {
  const view = new DataView(buffer);
  let offset = 0;

  // 1. Signature check
  const magic = String.fromCharCode(
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
  );

  if (magic !== "ASEF") {
    throw new Error(
      'Invalid ASE signature: expected "ASEF", got "' + magic + '"',
    );
  }

  const majorVersion = view.getUint16(offset);
  offset += 2;
  const minorVersion = view.getUint16(offset);
  offset += 2;
  const numBlocks = view.getUint32(offset);
  offset += 4;

  const colors: AseColor[] = [];
  let currentGroup = "Default";

  for (let b = 0; b < numBlocks && offset < buffer.byteLength; b++) {
    const blockType = view.getUint16(offset);
    offset += 2;
    const blockLength = view.getUint32(offset);
    offset += 4;
    const blockEnd = offset + blockLength;

    if (blockType === 0xc001) {
      // Group Start
      const nameLen = view.getUint16(offset);
      offset += 2;
      let groupName = "";
      for (let i = 0; i < nameLen - 1; i++) {
        groupName += String.fromCharCode(view.getUint16(offset));
        offset += 2;
      }
      offset += 2; // skip null terminator
      currentGroup = groupName || "Group";
    } else if (blockType === 0xc002) {
      // Group End
      currentGroup = "Default";
    } else if (blockType === 0x0001) {
      // Color Entry
      const nameLen = view.getUint16(offset);
      offset += 2;
      let colorName = "";
      for (let i = 0; i < nameLen - 1; i++) {
        colorName += String.fromCharCode(view.getUint16(offset));
        offset += 2;
      }
      offset += 2; // skip null terminator

      // 4-byte color space identifier
      const colorSpace = String.fromCharCode(
        view.getUint8(offset++),
        view.getUint8(offset++),
        view.getUint8(offset++),
        view.getUint8(offset++),
      );

      let r = 0,
        g = 0,
        b = 0;

      if (colorSpace === "RGB ") {
        const rf = view.getFloat32(offset);
        offset += 4;
        const gf = view.getFloat32(offset);
        offset += 4;
        const bf = view.getFloat32(offset);
        offset += 4;
        r = Math.round(rf * 255);
        g = Math.round(gf * 255);
        b = Math.round(bf * 255);
      } else if (colorSpace === "CMYK") {
        const c = view.getFloat32(offset);
        offset += 4;
        const m = view.getFloat32(offset);
        offset += 4;
        const y = view.getFloat32(offset);
        offset += 4;
        const k = view.getFloat32(offset);
        offset += 4;
        r = Math.round(255 * (1 - c) * (1 - k));
        g = Math.round(255 * (1 - m) * (1 - k));
        b = Math.round(255 * (1 - y) * (1 - k));
      } else if (colorSpace === "Gray") {
        const gray = view.getFloat32(offset);
        offset += 4;
        r = Math.round(gray * 255);
        g = r;
        b = r;
      } else if (colorSpace === "LAB ") {
        const l = view.getFloat32(offset);
        offset += 4;
        const a = view.getFloat32(offset);
        offset += 4;
        const bb = view.getFloat32(offset);
        offset += 4;
        // Basic approximate CIELab to RGB fallback
        const y = (l + 16) / 116;
        const x = a / 500 + y;
        const z = y - bb / 200;
        r = Math.max(0, Math.min(255, Math.round(x * 255)));
        g = Math.max(0, Math.min(255, Math.round(y * 255)));
        b = Math.max(0, Math.min(255, Math.round(z * 255)));
      }

      // Color type (0 = Global, 1 = Spot, 2 = Normal)
      let colorType = 2;
      if (offset + 2 <= blockEnd) {
        colorType = view.getUint16(offset);
        offset += 2;
      }

      const hex = rgbToHex(r, g, b);
      colors.push({
        name: colorName || `Color ${colors.length + 1}`,
        hex,
        rgb: { r, g, b },
        space: colorSpace.trim(),
        group: currentGroup,
        type: colorType === 0 ? "Global" : colorType === 1 ? "Spot" : "Normal",
      });
    }

    // Advance to guaranteed end of block
    offset = blockEnd;
  }

  return {
    version: `${majorVersion}.${minorVersion}`,
    totalColors: colors.length,
    colors,
  };
}

/**
 * Generates binary Adobe Swatch Exchange (.ASE) ArrayBuffer from a list of colors.
 */
export function generateAseBuffer(
  colors: Array<{ name?: string; hex: string }> = [],
): ArrayBuffer {
  // Calculate buffer size needed
  // Header: 4 ('ASEF') + 2 + 2 + 4 = 12 bytes
  let totalBytes = 12;

  for (const c of colors) {
    const name = c.name || "Color";
    const nameBytes = (name.length + 1) * 2; // UTF-16BE + null terminator
    // Block: 2 (type) + 4 (length) + 2 (nameLen) + nameBytes + 4 ('RGB ') + 12 (3 floats) + 2 (type)
    const blockPayload = 2 + nameBytes + 4 + 12 + 2;
    totalBytes += 2 + 4 + blockPayload;
  }

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  // 1. Signature "ASEF"
  view.setUint8(offset++, "A".charCodeAt(0));
  view.setUint8(offset++, "S".charCodeAt(0));
  view.setUint8(offset++, "E".charCodeAt(0));
  view.setUint8(offset++, "F".charCodeAt(0));

  // 2. Version 1.0
  view.setUint16(offset, 1);
  offset += 2;
  view.setUint16(offset, 0);
  offset += 2;

  // 3. Number of blocks
  view.setUint32(offset, colors.length);
  offset += 4;

  // 4. Color Blocks
  for (const c of colors) {
    const name = c.name || "Color";
    const nameLen = name.length + 1; // with \0
    for (let i = 0; i < 1; i++) {
      // dummy
    }
    const nameBytes = nameLen * 2;
    const blockLength = 2 + nameBytes + 4 + 12 + 2;

    // Block type: 0x0001 (Color)
    view.setUint16(offset, 0x0001);
    offset += 2;
    view.setUint32(offset, blockLength);
    offset += 4;

    // Name length (characters)
    view.setUint16(offset, nameLen);
    offset += 2;
    for (let i = 0; i < name.length; i++) {
      view.setUint16(offset, name.charCodeAt(i));
      offset += 2;
    }
    view.setUint16(offset, 0);
    offset += 2; // null terminator

    // Color Space: "RGB "
    view.setUint8(offset++, "R".charCodeAt(0));
    view.setUint8(offset++, "G".charCodeAt(0));
    view.setUint8(offset++, "B".charCodeAt(0));
    view.setUint8(offset++, " ".charCodeAt(0));

    // Channels float32
    const rgb = hexToRgb(c.hex);
    view.setFloat32(offset, rgb.r / 255.0);
    offset += 4;
    view.setFloat32(offset, rgb.g / 255.0);
    offset += 4;
    view.setFloat32(offset, rgb.b / 255.0);
    offset += 4;

    // Color type: 0 (Global)
    view.setUint16(offset, 0);
    offset += 2;
  }

  return buffer;
}

/**
 * Triggers a client-side download of the palette as an Adobe .ASE file.
 */
export function downloadAseFile(
  colors: Array<{ name?: string; hex: string }>,
  filename: string = "Fontivo-Palette.ase",
): void {
  const buffer = generateAseBuffer(colors);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ase") ? filename : `${filename}.ase`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports colors as CSS Variables code snippet.
 */
export function exportToCssVariables(
  colors: Array<{ name?: string; hex: string }>,
  prefix: string = "fontivo",
): string {
  const lines = [":root {"];
  for (const c of colors) {
    const slug = (c.name || "color")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    lines.push(`  --${prefix}-${slug}: ${c.hex};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Exports colors as Tailwind CSS extend configuration.
 */
export function exportToTailwindConfig(
  colors: Array<{ name?: string; hex: string }>,
): string {
  const obj: Record<string, string> = {};
  for (const c of colors) {
    const slug = (c.name || "color")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    obj[slug] = c.hex;
  }
  return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(obj, null, 8).replace(/"([^"]+)":/g, "$1:")}\n    }\n  }\n};`;
}
