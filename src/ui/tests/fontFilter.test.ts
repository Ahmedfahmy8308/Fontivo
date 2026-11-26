import { describe, it, expect } from "vitest";
import { filterFonts, sortFonts, sortFamilies } from "../src/utils/fontFilter";
import { FontItem, FontFamily } from "../src/types/font";

describe("Font Filtering & Sorting Utilities", () => {
  const mockFonts: FontItem[] = [
    {
      id: "1",
      name: "Amiri Regular",
      family: "Amiri",
      category: "Arabic",
      isActive: true,
      isFavorite: true,
    },
    {
      id: "2",
      name: "Amiri Bold",
      family: "Amiri",
      category: "Arabic",
      isActive: false,
      isFavorite: false,
    },
    {
      id: "3",
      name: "Inter Medium",
      family: "Inter",
      category: "English",
      provider: "google",
      isActive: true,
      isFavorite: false,
    },
    {
      id: "4",
      name: "Roboto Regular",
      family: "Roboto",
      category: "English",
      provider: "google",
      isActive: false,
      isFavorite: true,
    },
    {
      id: "5",
      name: "FontAwesome Symbols",
      family: "FontAwesome",
      category: "Symbols",
      isActive: false,
      isFavorite: false,
    },
  ];

  const mockFamilies: FontFamily[] = [
    { family: "Roboto", count: 12, fonts: [] },
    { family: "Amiri", count: 4, fonts: [] },
    { family: "Inter", count: 18, fonts: [] },
  ];

  it("filters fonts by search query matching name or family", () => {
    const results = filterFonts(mockFonts, { search: "amiri" });
    expect(results.length).toBe(2);
    expect(results.every((f) => f.family === "Amiri")).toBe(true);

    const robotoResult = filterFonts(mockFonts, { search: "roboto" });
    expect(robotoResult.length).toBe(1);
    expect(robotoResult[0].name).toBe("Roboto Regular");
  });

  it("filters active and inactive fonts", () => {
    const activeFonts = filterFonts(mockFonts, { filterType: "active" });
    expect(activeFonts.length).toBe(2);
    expect(activeFonts.map((f) => f.id)).toEqual(["1", "3"]);

    const inactiveFonts = filterFonts(mockFonts, { filterType: "inactive" });
    expect(inactiveFonts.length).toBe(3);
    expect(inactiveFonts.map((f) => f.id)).toEqual(["2", "4", "5"]);
  });

  it("filters favorite fonts", () => {
    const favorites = filterFonts(mockFonts, { filterType: "favorites" });
    expect(favorites.length).toBe(2);
    expect(favorites.map((f) => f.id)).toEqual(["1", "4"]);
  });

  it("filters by linguistic categories", () => {
    const arabicFonts = filterFonts(mockFonts, { filterType: "arabic" });
    expect(arabicFonts.length).toBe(2);
    expect(arabicFonts.every((f) => f.category === "Arabic")).toBe(true);

    const englishFonts = filterFonts(mockFonts, { filterType: "english" });
    expect(englishFonts.length).toBe(2);
    expect(englishFonts.every((f) => f.category === "English")).toBe(true);

    const symbolsFonts = filterFonts(mockFonts, { filterType: "symbols" });
    expect(symbolsFonts.length).toBe(1);
    expect(symbolsFonts[0].category).toBe("Symbols");
  });

  it("filters by collection membership", () => {
    const collectionResults = filterFonts(mockFonts, {
      filterType: "collection",
      filterValue: "Branding",
      collectionIds: ["1", "3"],
    });
    expect(collectionResults.length).toBe(2);
    expect(collectionResults.map((f) => f.id)).toEqual(["1", "3"]);
  });

  it("sorts fonts alphabetically ascending and descending", () => {
    const sortedAsc = sortFonts(mockFonts, "name-asc");
    expect(sortedAsc[0].family).toBe("Amiri");
    expect(sortedAsc[sortedAsc.length - 1].family).toBe("Roboto");

    const sortedDesc = sortFonts(mockFonts, "name-desc");
    expect(sortedDesc[0].family).toBe("Roboto");
    expect(sortedDesc[sortedDesc.length - 1].family).toBe("Amiri");
  });

  it("sorts font families by style count and name", () => {
    const sortedByStyles = sortFamilies(mockFamilies, "styles-desc");
    expect(sortedByStyles[0].family).toBe("Inter");
    expect(sortedByStyles[0].count).toBe(18);
    expect(sortedByStyles[1].family).toBe("Roboto");
    expect(sortedByStyles[2].family).toBe("Amiri");

    const sortedByName = sortFamilies(mockFamilies, "name-asc");
    expect(sortedByName[0].family).toBe("Amiri");
    expect(sortedByName[1].family).toBe("Inter");
    expect(sortedByName[2].family).toBe("Roboto");
  });
});
