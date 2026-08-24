/**
 * Region map: labels every non-line pixel of a line-art image with the id
 * of the enclosed region it belongs to. This is what makes the brush
 * "refuse" to cross a drawn line - painting is clipped to pixels whose
 * region id matches the region under the brush.
 *
 * BOUNDARY_ID (-1) marks line pixels (dark + opaque). Everything else gets
 * a positive region id via iterative (queue based, no recursion) 4-way
 * flood fill, which is fast enough on the main thread for a ~1200x1200
 * image (a few hundred ms) and avoids the complexity of a Web Worker.
 */

export const BOUNDARY_ID = -1;
export const UNSET_ID = 0;

/**
 * @param {ImageData} imageData - line art rendered onto an offscreen canvas
 * @param {number} darkThreshold - luminance below this counts as "ink" (0-255)
 * @param {number} alphaThreshold - alpha above this counts as "opaque" (0-255)
 * @returns {{ regionMap: Int32Array, width: number, height: number, regionCount: number }}
 */
export function buildRegionMap(imageData, darkThreshold = 200, alphaThreshold = 40) {
  const { width, height, data } = imageData;
  const regionMap = new Int32Array(width * height).fill(UNSET_ID);

  // 1. Mark boundary (ink) pixels
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (a >= alphaThreshold && luminance <= darkThreshold) {
      regionMap[p] = BOUNDARY_ID;
    }
  }

  // 2. Flood-fill every remaining unset pixel with a fresh region id
  let nextId = 1;
  const queue = new Int32Array(width * height);

  for (let start = 0; start < regionMap.length; start++) {
    if (regionMap[start] !== UNSET_ID) continue;

    const id = nextId++;
    let qHead = 0, qTail = 0;
    queue[qTail++] = start;
    regionMap[start] = id;

    while (qHead < qTail) {
      const p = queue[qHead++];
      const x = p % width;
      const y = (p / width) | 0;

      // 4-connectivity keeps thin (>=2px) lines watertight
      if (x > 0) {
        const n = p - 1;
        if (regionMap[n] === UNSET_ID) { regionMap[n] = id; queue[qTail++] = n; }
      }
      if (x < width - 1) {
        const n = p + 1;
        if (regionMap[n] === UNSET_ID) { regionMap[n] = id; queue[qTail++] = n; }
      }
      if (y > 0) {
        const n = p - width;
        if (regionMap[n] === UNSET_ID) { regionMap[n] = id; queue[qTail++] = n; }
      }
      if (y < height - 1) {
        const n = p + width;
        if (regionMap[n] === UNSET_ID) { regionMap[n] = id; queue[qTail++] = n; }
      }
    }
  }

  return { regionMap, width, height, regionCount: nextId - 1 };
}

export function regionIdAt(regionInfo, x, y) {
  const { regionMap, width, height } = regionInfo;
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return BOUNDARY_ID;
  return regionMap[yi * width + xi];
}
