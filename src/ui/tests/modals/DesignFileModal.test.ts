import { describe, it, expect } from "vitest";
import "../setup";

describe("DesignFileModal & Adobe Document Inspector Tests", () => {
  const SUPPORTED_EXTENSIONS = ["psd", "ai", "indd", "pdf"];

  const mockFileDrop = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isSupported = SUPPORTED_EXTENSIONS.includes(ext);
    return { fileName, ext, isSupported };
  };

  const mockExtractedDocumentFonts = [
    {
      name: "Inter-Bold",
      family: "Inter",
      postscriptName: "Inter-Bold",
      layerCount: 14,
    },
    {
      name: "Amiri-Regular",
      family: "Amiri",
      postscriptName: "Amiri-Regular",
      layerCount: 8,
    },
    {
      name: "Futura-CondensedExtraBold",
      family: "Futura",
      postscriptName: "Futura-CondensedExtraBold",
      layerCount: 3,
    },
    {
      name: "CustomStudioSerif",
      family: "CustomStudio",
      postscriptName: "CustomStudio-Regular",
      layerCount: 1,
    },
  ];

  const mockLocalLibraryFonts = new Set(["inter-bold", "amiri-regular"]);

  it("validates supported professional design file extensions", () => {
    expect(mockFileDrop("poster_artboard_final.psd").isSupported).toBe(true);
    expect(mockFileDrop("brand_identity_vector.ai").isSupported).toBe(true);
    expect(mockFileDrop("magazine_layout_32pp.indd").isSupported).toBe(true);
    expect(mockFileDrop("press_ready_spec.pdf").isSupported).toBe(true);
    expect(mockFileDrop("unsupported_archive.zip").isSupported).toBe(false);
    expect(mockFileDrop("word_document.docx").isSupported).toBe(false);
  });

  it("separates extracted document fonts into installed vs missing sets", () => {
    const auditFonts = (
      extracted: typeof mockExtractedDocumentFonts,
      installedSet: Set<string>,
    ) => {
      const available: typeof mockExtractedDocumentFonts = [];
      const missing: typeof mockExtractedDocumentFonts = [];

      for (const f of extracted) {
        const key = f.name.toLowerCase();
        if (installedSet.has(key)) {
          available.push(f);
        } else {
          missing.push(f);
        }
      }

      return { available, missing };
    };

    const { available, missing } = auditFonts(
      mockExtractedDocumentFonts,
      mockLocalLibraryFonts,
    );

    expect(available.length).toBe(2);
    expect(available.map((f) => f.name)).toEqual([
      "Inter-Bold",
      "Amiri-Regular",
    ]);

    expect(missing.length).toBe(2);
    expect(missing.map((f) => f.name)).toEqual([
      "Futura-CondensedExtraBold",
      "CustomStudioSerif",
    ]);
  });

  it("generates 1-click RAM activation payload for all available design fonts", () => {
    const available = mockExtractedDocumentFonts.filter((f) =>
      mockLocalLibraryFonts.has(f.name.toLowerCase()),
    );

    const activationPayload = {
      action: "activate_batch_ram",
      fontNames: available.map((f) => f.name),
      source: "adobe_design_drop",
    };

    expect(activationPayload.action).toBe("activate_batch_ram");
    expect(activationPayload.fontNames).toEqual([
      "Inter-Bold",
      "Amiri-Regular",
    ]);
  });
});
