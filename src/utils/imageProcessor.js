/**
 * imageProcessor.js
 *
 * Kullanıcının dışarıdan yüklediği KEYFİ bir fotoğrafı şu ikisine çevirir:
 *   1) En baskın ~10 rengi içeren bir palet (kullanıcı arayüzündeki
 *      renk paletine eklenmek üzere).
 *   2) Şeffaf arka planlı bir "boyama şablonu": beyaz/parlak alanlar
 *      tamamen şeffaf (alpha 0), kenarlar (Sobel edge detection ile
 *      bulunan) opak koyu çizgi olur.
 *
 * Bu modül socket/stroke mantığına dokunmaz; sadece CanvasBoard'un zaten
 * bildiği <img> kaynağını (bir PNG data URL) hazırlar. Üretilen şablon,
 * mevcut buildRegionMap() / stampBrush() akışına aynen elle çizilmiş bir
 * line-art gibi verilir.
 */

const MAX_PROCESS_DIM = 1600; // Sobel geçişi bu boyutu aşmasın (performans)
const PALETTE_SAMPLE_DIM = 200; // palet çıkarımı için küçük bir örnekleme boyutu

/** Bir File/Blob'u (ya da hazır bir img src'ini) HTMLImageElement'e yükler. */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const isBlob = source instanceof Blob;
    const url = isBlob ? URL.createObjectURL(source) : source;
    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function drawToCanvas(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

/* ------------------------------------------------------------------ */
/* 1. Baskın renk çıkarımı                                             */
/* ------------------------------------------------------------------ */

/**
 * Görselden basit bir k-means geçişiyle en fazla `count` baskın rengi
 * çıkarır. Neredeyse-beyaz / neredeyse-siyah / şeffaf pikseller dahil
 * edilmez, böylece palet kağıt zeminini veya çizgi sanatını değil,
 * gerçek "boyanabilir" içeriği yansıtır.
 */
export function extractPaletteColors(img, count = 10) {
  const { ctx, width, height } = drawToCanvas(img, PALETTE_SAMPLE_DIM);
  const { data } = ctx.getImageData(0, 0, width, height);

  const samples = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // şeffaf
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 245 || lum < 12) continue; // neredeyse beyaz / siyah -> "renk" sayılmaz
    samples.push([r, g, b]);
  }

  if (samples.length === 0) return [];

  const k = Math.min(count, samples.length);
  const centroids = kMeans(samples, k);

  // En çok temsil edilen renkler önce gelsin
  return centroids
    .sort((a, b) => b.weight - a.weight)
    .map((c) => rgbToHex(c.r, c.g, c.b));
}

function kMeans(samples, k, iterations = 8) {
  // Rastgelelik yerine eşit aralıklı örneklerle başlat (deterministik sonuç)
  const step = Math.max(1, Math.floor(samples.length / k));
  let centroids = Array.from({ length: k }, (_, i) => {
    const [r, g, b] = samples[Math.min(i * step, samples.length - 1)];
    return { r, g, b, weight: 0 };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const [r, g, b] of samples) {
      let best = 0, bestDist = Infinity;
      for (let ci = 0; ci < centroids.length; ci++) {
        const c = centroids[ci];
        const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
        if (d < bestDist) { bestDist = d; best = ci; }
      }
      sums[best].r += r; sums[best].g += g; sums[best].b += b; sums[best].n += 1;
    }
    centroids = centroids.map((c, i) => {
      const s = sums[i];
      if (s.n === 0) return c; // noktalarını kaybeden merkez olduğu yerde kalsın
      return { r: Math.round(s.r / s.n), g: Math.round(s.g / s.n), b: Math.round(s.b / s.n), weight: s.n };
    });
  }
  return centroids.filter((c) => c.weight > 0);
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* 2. Boyama şablonu çıkarımı (beyaz->şeffaf, kenar->çizgi)             */
/* ------------------------------------------------------------------ */

/**
 * Bir fotoğrafı line-art boyama şablonuna çevirir:
 *  - parlak / düşük-kontrastlı alanlar tamamen şeffaf olur (alttaki
 *    renk katmanı olduğu gibi görünsün diye)
 *  - koyu kenarlar (Sobel edge magnitude) opak koyu çizgi olarak kalır
 *  - kenar sınırında yumuşak bir alpha geçişi kullanılır (zoom'da
 *    çizgiler pikselli görünmesin diye)
 */
export function buildColoringTemplate(img, opts = {}) {
  const {
    edgeThreshold = 60,      // bu Sobel büyüklüğünün üstü "çizgi" sayılır
    softEdgeBand = 25,       // kenarı yumuşatmak için geçiş bandı
    lineColor = [20, 20, 20],
  } = opts;

  const { canvas, ctx, width, height } = drawToCanvas(img, MAX_PROCESS_DIM);
  const src = ctx.getImageData(0, 0, width, height);
  const gray = toGrayscale(src);
  const mag = sobelMagnitude(gray, width, height);

  const out = ctx.createImageData(width, height);
  const [lr, lg, lb] = lineColor;
  for (let i = 0, p = 0; i < mag.length; i++, p += 4) {
    const m = mag[i];
    let alpha;
    if (m <= edgeThreshold) {
      alpha = 0;
    } else if (m >= edgeThreshold + softEdgeBand) {
      alpha = 255;
    } else {
      alpha = Math.round(((m - edgeThreshold) / softEdgeBand) * 255);
    }
    out.data[p] = lr;
    out.data[p + 1] = lg;
    out.data[p + 2] = lb;
    out.data[p + 3] = alpha;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function toGrayscale({ data }) {
  const gray = new Float32Array(data.length / 4);
  for (let i = 0, p = 0; p < data.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return gray;
}

function sobelMagnitude(gray, width, height) {
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const mag = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++, k++) {
          const v = gray[(y + ky) * width + (x + kx)];
          sx += v * gx[k];
          sy += v * gy[k];
        }
      }
      mag[y * width + x] = Math.min(255, Math.sqrt(sx * sx + sy * sy));
    }
  }
  return mag;
}

/* ------------------------------------------------------------------ */
/* 3. CanvasBoard'un çağıracağı tek fonksiyonluk pipeline               */
/* ------------------------------------------------------------------ */

/**
 * Tüm "keyfi fotoğraf yükleme" akışını çalıştırır:
 *   -> { templateDataUrl, paletteColors, width, height }
 *
 * templateDataUrl, CanvasBoard'un imageSrc için zaten beklediği formattadır
 * (PNG data URL) — yani region-map / brush pipeline'ında hiçbir ek
 * değişikliğe gerek kalmaz.
 */
export async function processUploadedImage(fileOrUrl, opts = {}) {
  const img = await loadImage(fileOrUrl);
  const paletteColors = extractPaletteColors(img, opts.paletteSize ?? 10);
  const templateCanvas = buildColoringTemplate(img, opts.template);
  const templateDataUrl = templateCanvas.toDataURL("image/png");
  return {
    templateDataUrl,
    paletteColors,
    width: templateCanvas.width,
    height: templateCanvas.height,
  };
}
