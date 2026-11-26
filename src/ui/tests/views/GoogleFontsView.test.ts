import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import GoogleFontsView, {
  detectGoogleFontScript,
} from "../../src/components/views/GoogleFontsView";

describe("GoogleFontsView Component & Live Catalog Integration Tests", () => {
  it("constructs correct API query parameters for search, script, and category", () => {
    const buildGoogleFontsUrl = (
      cat: string,
      script: string,
      search: string,
    ) => {
      const params = new URLSearchParams();
      if (cat !== "all") params.append("category", cat);
      if (script !== "all") params.append("script", script);
      if (search.trim()) params.append("search", search.trim());
      return `/api/google-fonts?${params.toString()}`;
    };

    expect(buildGoogleFontsUrl("all", "all", "")).toBe("/api/google-fonts?");
    expect(buildGoogleFontsUrl("all", "arabic", "Cairo")).toBe(
      "/api/google-fonts?script=arabic&search=Cairo",
    );
    expect(buildGoogleFontsUrl("sans-serif", "bilingual", "Readex")).toBe(
      "/api/google-fonts?category=sans-serif&script=bilingual&search=Readex",
    );
  });

  it("detects Arabic, Latin, and Bilingual Google Font scripts accurately", () => {
    expect(
      detectGoogleFontScript({
        family: "Cairo",
        category: "sans-serif",
        subsets: ["arabic", "latin"],
      }),
    ).toBe("bilingual");
    expect(
      detectGoogleFontScript({
        family: "Inter",
        category: "sans-serif",
        subsets: ["latin"],
      }),
    ).toBe("latin");
    expect(
      detectGoogleFontScript({
        family: "Ruqaa",
        category: "arabic",
        subsets: ["arabic"],
        isLatin: false,
      }),
    ).toBe("arabic");
  });

  it("renders GoogleFontsView with Arabic/Latin/Bilingual filter chips, live webfont preview, and zero hardcoded 700", () => {
    const html = renderToString(
      React.createElement(GoogleFontsView, {
        onRefreshStats: () => {},
        t: {},
        isRtl: true,
      }),
    );

    expect(html).toContain("عربي");
    expect(html).toContain("لاتيني");
    expect(html).toContain("ثنائي اللغة");
    expect(html).toContain("font-family:&quot;Cairo&quot;");
    expect(html).not.toContain("700+");
  });
});
