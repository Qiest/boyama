import { regionIdAt } from "./regionMap.js";

/**
 * Stamps a soft round brush dab directly into a color-layer ImageData,
 * but only writes pixels whose region id (from the precomputed region
 * map) matches `regionId`. That's the "sweet resistance": inside the
 * region the brush behaves like a normal soft brush, but it physically
 * cannot bleed past a line.
 */
export function stampBrush(colorImageData, regionInfo, cx, cy, radius, regionId, rgba, opacity) {
  const { width, height, data } = colorImageData;
  const [r, g, b] = rgba;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const rSq = radius * radius;
  const softStart = radius * 0.6; // feathered edge starts at 60% of radius

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx, dy = y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq > rSq) continue;
      if (regionIdAt(regionInfo, x, y) !== regionId) continue;

      const dist = Math.sqrt(distSq);
      let falloff = 1;
      if (dist > softStart) {
        falloff = 1 - (dist - softStart) / (radius - softStart);
      }
      const a = Math.max(0, Math.min(1, opacity * falloff));
      if (a <= 0) continue;

      const idx = (y * width + x) * 4;
      // alpha-composite new color over existing color layer pixel
      const srcA = a;
      const dstA = data[idx + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      data[idx] = (r * srcA + data[idx] * dstA * (1 - srcA)) / outA;
      data[idx + 1] = (g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA;
      data[idx + 2] = (b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA;
      data[idx + 3] = outA * 255;
    }
  }
}

/** Stamps repeatedly along a segment so fast strokes stay continuous. */
export function stampSegment(colorImageData, regionInfo, x0, y0, x1, y1, radius, regionId, rgba, opacity, spacing = 0.25) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = Math.max(1, radius * spacing);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampBrush(colorImageData, regionInfo, x0 + dx * t, y0 + dy * t, radius, regionId, rgba, opacity);
  }
}

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
