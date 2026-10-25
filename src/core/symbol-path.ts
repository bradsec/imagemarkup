/** Convert trusted Lucide SVG children into path data for Canvas Path2D. */
export function symbolPathData(markup: string): string {
  const paths: string[] = [];
  for (const match of markup.matchAll(
    /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)\/?\s*>/g,
  )) {
    const tag = match[1];
    const attributes = Object.fromEntries(
      [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((part) => [part[1], part[2]]),
    );
    const n = (key: string) => Number(attributes[key] ?? 0);
    if (tag === "path") paths.push(attributes.d ?? "");
    if (tag === "line") paths.push(`M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`);
    if (tag === "circle" || tag === "ellipse") {
      const cx = n("cx"),
        cy = n("cy"),
        rx = tag === "circle" ? n("r") : n("rx"),
        ry = tag === "circle" ? n("r") : n("ry");
      paths.push(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`);
    }
    if (tag === "rect") {
      const x = n("x"),
        y = n("y"),
        w = n("width"),
        h = n("height");
      const rx = Math.min(n("rx") || n("ry"), w / 2),
        ry = Math.min(n("ry") || n("rx"), h / 2);
      paths.push(
        rx && ry
          ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
          : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
      );
    }
    if (tag === "polyline" || tag === "polygon") {
      const points = (attributes.points ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      paths.push(
        points
          .reduce(
            (data, value, index) =>
              data + (index % 2 ? `${value} ` : `${index ? "L" : "M"}${value} `),
            "",
          )
          .trim() + (tag === "polygon" ? "Z" : ""),
      );
    }
  }
  return paths.join(" ");
}
