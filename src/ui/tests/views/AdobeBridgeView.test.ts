import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import AdobeBridgeView, {
  normalizePendingActivations,
  normalizeAdobeFontEntry,
} from "../../src/components/views/AdobeBridgeView";

describe("AdobeBridgeView Component Tests", () => {
  it("renders Adobe CC Bridge container and inspector controls", () => {
    const html = renderToString(
      React.createElement(AdobeBridgeView, {
        t: {
          adobeBridgeTitle: "Adobe CC Real-Time Bridge",
          scanDesignFile: "Inspect Design File (PSD, AI, INDD)",
        },
        isRtl: false,
      }),
    );

    expect(html).toContain("Adobe CC Real-Time Bridge");
    expect(html).toContain("CONNECTED");
    expect(html).not.toContain("27715");
    expect(html).toContain("Photoshop");
    expect(html).toContain("Illustrator");
    expect(html).toContain("InDesign");
  });

  it("renders Arabic localized header when isRtl is true", () => {
    const html = renderToString(
      React.createElement(AdobeBridgeView, {
        t: {
          adobeBridgeTitle: "جسر أدوبي المباشر (Adobe CC Bridge)",
          scanDesignFile: "فحص ملف تصميم (PSD, AI, INDD)",
        },
        isRtl: true,
      }),
    );

    expect(html).toContain("جسر أدوبي المباشر (Adobe CC Bridge)");
    expect(html).toContain("فحص ملف تصميم (PSD, AI, INDD)");
    expect(html).toContain("تصفح الملف...");
    expect(html).toContain("فحص الملف");
  });

  it("correctly normalizes and strips quotes from file paths", () => {
    const cleanPath = (p: string) => p.replace(/^["']|["']$/g, "").trim();
    expect(
      cleanPath('"C:\\Users\\ahmed\\Downloads\\FRAME INTERVIEWS.psd"'),
    ).toBe("C:\\Users\\ahmed\\Downloads\\FRAME INTERVIEWS.psd");
    expect(cleanPath("'C:\\Designs\\poster.ai'")).toBe(
      "C:\\Designs\\poster.ai",
    );
    expect(cleanPath("   D:\\Art\\layout.indd   ")).toBe(
      "D:\\Art\\layout.indd",
    );
  });

  it("normalizes raw backend inspection payload into frontend display structure", () => {
    const rawBackendData = {
      filePath: "C:\\Users\\ahmed\\Downloads\\FRAME INTERVIEWS.psd",
      totalFonts: 2,
      alreadyActiveCount: 0,
      fonts: [
        {
          name: "GE SS Two Light",
          status: "available",
          fontId: 45,
          id: 45,
          matchedId: 45,
          available: true,
          isMatched: true,
          isActive: false,
          family: "GE SS Two",
          path: "C:\\Fonts\\gesstwo.otf",
          postScriptName: "GESSTwoLight-Light",
          style: "Light",
        },
        {
          name: "UnknownBrandCustomFont",
          status: "missing",
          fontId: null,
          id: null,
          matchedId: null,
          available: false,
          isMatched: false,
          isActive: false,
          family: null,
          path: null,
          postScriptName: null,
          style: null,
        },
      ],
    };

    const formatInspectData = (data: any, fallbackPath?: string) => {
      const fPath = data.filePath || fallbackPath || "";
      const fName = data.fileName || fPath.split(/[\\/]/).pop() || "";
      const fontsList = (data.fonts || []).map((f: any) => {
        const mid = f.matchedId ?? f.fontId ?? f.id;
        const isMatched = Boolean(
          f.isMatched ||
          f.available ||
          mid != null ||
          f.status === "available" ||
          f.status === "active",
        );
        const isActive = Boolean(f.isActive || f.status === "active");
        return {
          name: f.name,
          matchedId: mid,
          fontId: mid,
          id: mid,
          status: isActive ? "active" : isMatched ? "available" : "missing",
          isMatched,
          available: isMatched,
          isActive,
          postScriptName: f.postScriptName || f.name,
          style: f.style || "",
        };
      });

      const total = data.totalDetected ?? data.totalFonts ?? fontsList.length;
      const matched =
        data.matchedCount ?? fontsList.filter((f: any) => f.isMatched).length;

      return {
        success: true,
        fileName: fName,
        filePath: fPath,
        totalDetected: total,
        matchedCount: matched,
        fonts: fontsList,
      };
    };

    const formatted = formatInspectData(rawBackendData);
    expect(formatted.success).toBe(true);
    expect(formatted.fileName).toBe("FRAME INTERVIEWS.psd");
    expect(formatted.totalDetected).toBe(2);
    expect(formatted.matchedCount).toBe(1);
    expect(formatted.fonts[0].isMatched).toBe(true);
    expect(formatted.fonts[0].matchedId).toBe(45);
    expect(formatted.fonts[1].isMatched).toBe(false);
  });

  it("normalizes live /api/adobe/pending-activations payloads for Photoshop/Illustrator/InDesign", () => {
    const normalized = normalizePendingActivations({
      documents: [
        {
          id: "doc-psd-1",
          documentName: "ramadan-campaign.psd",
          appName: "Photoshop",
          totalFonts: 4,
          matchedCount: 3,
          missingCount: 1,
          matchedFontIds: ["f-1", "f-2", "f-3"],
        },
      ],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0].documentName).toBe("ramadan-campaign.psd");
    expect(normalized[0].appName).toBe("Photoshop");
    expect(normalized[0].totalFonts).toBe(4);
    expect(normalized[0].matchedCount).toBe(3);
    expect(normalized[0].matchedFontIds).toEqual(["f-1", "f-2", "f-3"]);
  });

  it("normalizes multi-document 4-tier (system/local/google/missing) Adobe payloads", () => {
    const normalized = normalizePendingActivations({
      documents: [
        {
          id: "doc-psd-1",
          documentName: "ramadan-campaign.psd",
          app: "Photoshop",
          fonts: [
            { name: "ArialMT", status: "system", active: false },
            {
              name: "GE-SS-Two-Bold",
              status: "local",
              fontId: "f-1",
              active: false,
            },
            {
              name: "Cairo-Bold",
              status: "google",
              googleFamily: "Cairo",
              active: false,
            },
            { name: "ProprietaryBrandFont", status: "missing", active: false },
          ],
          counts: {
            total: 4,
            system: 1,
            local: 1,
            google: 1,
            missing: 1,
            active: 0,
          },
        },
        {
          id: "doc-ai-2",
          documentName: "brand-guidelines.ai",
          app: "Illustrator",
          fonts: [
            {
              name: "Tajawal-Medium",
              status: "google",
              googleFamily: "Tajawal",
              active: false,
            },
          ],
          counts: {
            total: 1,
            system: 0,
            local: 0,
            google: 1,
            missing: 0,
            active: 0,
          },
        },
      ],
    });

    expect(normalized).toHaveLength(2);
    expect(normalized[0].documentName).toBe("ramadan-campaign.psd");
    expect(normalized[0].appName).toBe("Photoshop");
    expect(normalized[0].systemCount).toBe(1);
    expect(normalized[0].localCount).toBe(1);
    expect(normalized[0].googleCount).toBe(1);
    expect(normalized[0].missingCount).toBe(1);
    expect(normalized[0].fonts[2].googleFamily).toBe("Cairo");
    expect(normalized[1].appName).toBe("Illustrator");
    expect(normalized[1].googleCount).toBe(1);

    const singleGoogle = normalizeAdobeFontEntry({
      name: "Poppins-SemiBold",
      googleFamily: "Poppins",
    });
    expect(singleGoogle.status).toBe("google");
  });
});
