import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SYMBOLS, SYMBOL_PALETTE } from "./symbols";
import { symbolPathData } from "./symbol-path";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("symbol library", () => {
  it("bundles exact Lucide SVG children for every symbol", () => {
    for (const [name, symbol] of Object.entries(SYMBOLS)) {
      const svg = readFileSync(
        new URL(`../../node_modules/lucide-static/icons/${symbol.lucide}.svg`, import.meta.url),
        "utf8",
      );
      expect(normalize(symbol.markup), name).toBe(
        normalize(svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)![1]),
      );
      expect(symbolPathData(symbol.markup), name).not.toBe("");
    }
  });

  it("keeps palette and saved legacy names mapped", () => {
    for (const name of [
      ...SYMBOL_PALETTE,
      "rounded-square",
      "ring",
      "hand-stop",
      "hand-point-left",
      "hand-point-right",
    ] as const)
      expect(SYMBOLS[name]).toBeDefined();
    expect(SYMBOL_PALETTE).not.toContain("rounded-square");
    expect(SYMBOL_PALETTE).not.toContain("ring");
    expect(Object.keys(SYMBOLS)).toHaveLength(48);
  });

  it("marks only fillable outlines as closed", () => {
    expect(SYMBOLS.circle.closed).toBe(true);
    expect(SYMBOLS.heart.closed).toBe(true);
    expect(SYMBOLS.check.closed).toBe(false);
    expect(SYMBOLS["arrow-right"].closed).toBe(false);
    expect(SYMBOLS.pin.closed).toBe(false);
  });
});

describe("symbolPathData", () => {
  it("converts every supported SVG child without closing open paths", () => {
    expect(symbolPathData('<path d="M1 2L3 4" /><line x1="1" y1="2" x2="3" y2="4" />')).toBe(
      "M1 2L3 4 M1 2L3 4",
    );
    expect(
      symbolPathData('<circle cx="12" cy="12" r="10" /><ellipse cx="6" cy="7" rx="3" ry="4" />'),
    ).toContain("a10 10 0 1 0");
    expect(symbolPathData('<rect x="3" y="4" width="8" height="10" rx="2" />')).toContain("A2 2");
    expect(symbolPathData('<polyline points="1,2 3,4" /><polygon points="1,2 3,4 5,6" />')).toBe(
      "M1 2 L3 4 M1 2 L3 4 L5 6Z",
    );
  });
});
