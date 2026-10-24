import { expect, it } from 'vitest';
import { polygonVertices, starVertices } from './symbol-geometry';

it('makes requested polygon and star vertex counts', () => {
  expect(polygonVertices(8)).toHaveLength(8);
  expect(starVertices(8, 0.43)).toHaveLength(16);
});
