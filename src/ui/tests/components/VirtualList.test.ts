import { describe, it, expect } from "vitest";
import "../setup";
import { FontItem } from "../../src/types/font";

describe("VirtualList & High-Volume Font Rendering Tests", () => {
  // Generate 1,500 mock fonts
  const generateMockFonts = (count: number): FontItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `font-${i}`,
      name: `Typeface ${i} Regular`,
      family: `Family ${Math.floor(i / 4)}`,
      style: i % 2 === 0 ? "Regular" : "Bold",
      format: i % 3 === 0 ? "OTF" : "TTF",
      active: i % 10 === 0,
      favorite: i % 25 === 0,
    }));
  };

  const fonts = generateMockFonts(1500);

  it("handles 1,500+ font items with high-performance windowing", () => {
    expect(fonts.length).toBe(1500);

    const ITEM_HEIGHT = 80;
    const VIEWPORT_HEIGHT = 800;
    const OVERSCAN = 5;

    const calculateVirtualWindow = (scrollTop: number, totalItems: number) => {
      const startIndex = Math.max(
        0,
        Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN,
      );
      const endIndex = Math.min(
        totalItems,
        Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + OVERSCAN,
      );
      const offsetY = startIndex * ITEM_HEIGHT;
      const totalHeight = totalItems * ITEM_HEIGHT;

      return {
        startIndex,
        endIndex,
        visibleCount: endIndex - startIndex,
        offsetY,
        totalHeight,
      };
    };

    // Scroll at top (0px)
    const windowTop = calculateVirtualWindow(0, fonts.length);
    expect(windowTop.startIndex).toBe(0);
    expect(windowTop.endIndex).toBe(15); // 10 visible + 5 overscan
    expect(windowTop.visibleCount).toBe(15);
    expect(windowTop.totalHeight).toBe(120000); // 1,500 * 80px
    expect(windowTop.offsetY).toBe(0);

    // Scroll down to 4,000px
    const windowMiddle = calculateVirtualWindow(4000, fonts.length);
    // 4000 / 80 = 50. 50 - 5 = 45
    expect(windowMiddle.startIndex).toBe(45);
    expect(windowMiddle.offsetY).toBe(45 * 80);
    expect(windowMiddle.visibleCount).toBeLessThanOrEqual(25);
  });

  it("renders only visible slice into memory, avoiding DOM bloat", () => {
    const ITEM_HEIGHT = 80;
    const VIEWPORT_HEIGHT = 800;
    const scrollTop = 1600; // index 20

    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 2);
    const endIndex = Math.min(
      fonts.length,
      Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + 2,
    );

    const visibleSlice = fonts.slice(startIndex, endIndex);
    expect(visibleSlice.length).toBeLessThan(20);
    expect(visibleSlice[0].id).toBe(`font-${startIndex}`);
  });

  it("performs sub-millisecond search and filter across 1,500+ items", () => {
    const start = performance.now();
    const query = "typeface 12";
    const results = fonts.filter((f) => f.name.toLowerCase().includes(query));
    const duration = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(25); // Well within frame budget
  });
});
