/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { icon, type IconName } from "./icons";

const lucideNames = {
  select: "mouse-pointer-2",
  pan: "hand",
  rect: "square",
  ellipse: "circle",
  line: "slash",
  arrow: "move-up-right",
  pen: "pen-line",
  highlighter: "highlighter",
  text: "type",
  counter: "circle-dot",
  redaction: "eye-off",
  crop: "crop",
  image: "image",
  symbol: "shapes",
  undo: "undo-2",
  redo: "redo-2",
  "zoom-in": "zoom-in",
  "zoom-out": "zoom-out",
  fit: "maximize",
  "actual-size": "square-dashed",
  download: "download",
  save: "save",
  "folder-open": "folder-open",
  copy: "copy",
  trash: "trash-2",
  transform: "move",
  frame: "frame",
  eyedropper: "pipette",
  "layer-front": "bring-to-front",
  "layer-back": "send-to-back",
  upload: "upload",
  plus: "plus",
  close: "x",
  "image-plus": "image-plus",
  lock: "lock",
  "lock-open": "lock-open",
  link: "link",
  unlink: "unlink",
  eye: "eye",
  "eye-off": "eye-off",
  "chevron-up": "chevron-up",
  "chevron-down": "chevron-down",
} satisfies Record<IconName, string>;

const normalize = (markup: string) => markup.replace(/\s+/g, " ").trim();

describe("interface icons", () => {
  it.each(Object.entries(lucideNames) as [IconName, string][])(
    "bundles the exact Lucide children for %s",
    (name, lucideName) => {
      const source = readFileSync(
        new URL(`../../node_modules/lucide-static/icons/${lucideName}.svg`, import.meta.url),
        "utf8",
      );
      const sourceChildren = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
      expect(sourceChildren).toBeDefined();
      const rendered = icon(name);
      const renderedChildren = rendered.slice(
        rendered.indexOf(">") + 1,
        rendered.lastIndexOf("</svg>"),
      );
      expect(normalize(renderedChildren)).toBe(normalize(sourceChildren!));
      expect(rendered).toContain('viewBox="0 0 24 24"');
      expect(rendered).toContain('stroke-width="2"');
    },
  );
});
