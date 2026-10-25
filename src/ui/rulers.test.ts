import { describe, expect, it } from 'vitest';
import { rulerTicks, unitPixels } from './rulers';

describe('rulerTicks', () => {
  it('converts preference units to image pixels', () => {
    expect(unitPixels('px', 96)).toBe(1);
    expect(unitPixels('in', 300)).toBe(300);
    expect(unitPixels('cm', 254)).toBeCloseTo(100);
    expect(unitPixels('mm', 254)).toBeCloseTo(10);
  });

  it('labels major ticks in image units from the image origin', () => {
    // 100 image px visible at scale 1, image origin at screen x 20.
    const ticks = rulerTicks({ start: 0, length: 400, offset: 20, scale: 1, unitPixels: 1 });
    const majors = ticks.filter((tick) => tick.label !== null);
    expect(majors[0]).toEqual({ position: 20, major: true, label: '0' });
    const spacing = majors[1].position - majors[0].position;
    expect(spacing).toBeGreaterThanOrEqual(50);
    expect(majors.every((tick, index) => Number(tick.label) === index * spacing)).toBe(true);
  });

  it('keeps major ticks readable at any zoom and labels physical units', () => {
    for (const scale of [0.05, 0.5, 1, 4, 32]) {
      const majors = rulerTicks({ start: 0, length: 800, offset: 0, scale, unitPixels: 1 }).filter((tick) => tick.major);
      const spacing = majors[1].position - majors[0].position;
      expect(spacing).toBeGreaterThanOrEqual(50);
      expect(spacing).toBeLessThan(260);
    }
    const inches = rulerTicks({ start: 0, length: 600, offset: 0, scale: 1, unitPixels: 96 }).filter((tick) => tick.major);
    expect(inches.slice(0, 3).map((tick) => tick.label)).toEqual(['0', '1', '2']);
    expect(inches[1].position).toBeCloseTo(96);
  });

  it('labels negative positions left of or above the image', () => {
    const ticks = rulerTicks({ start: 0, length: 300, offset: 200, scale: 1, unitPixels: 1 }).filter((tick) => tick.major);
    expect(ticks[0].label?.startsWith('-')).toBe(true);
  });
});
