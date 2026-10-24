import type { Point } from './geometry';

export function polygonVertices(sides: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = -Math.PI / 2 - (sides % 2 === 0 ? Math.PI / sides : 0) + i * Math.PI * 2 / sides;
    return { x: 50 + Math.cos(angle) * 44, y: 50 + Math.sin(angle) * 44 };
  });
}

export function starVertices(points: number, innerRatio: number): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const radius = i % 2 ? 42 * innerRatio : 42;
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
}
