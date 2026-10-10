/**
 * Squeak's eyes: image recognition that runs entirely in the browser.
 *
 * Uses Marqo FashionCLIP (a CLIP model fine-tuned on fashion products) through
 * Transformers.js. It turns trim photos and search text into vectors in the same
 * space, so "gold scalloped lace" lands near photos of gold scalloped lace.
 *
 * Runs in a Web Worker so Squeak's animations stay smooth while it thinks.
 *
 * Messages in:  { id, type: 'warm', parts: ['text'|'vision'] }
 *               { id, type: 'embedText', text }
 *               { id, type: 'analyzeImage', blob }
 * Messages out: { id, ok, ...result } | { type: 'progress', percent } | { type: 'ready', part }
 */
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
import {
  ITEM_TYPES,
  METALS,
  PROMPT_TEMPLATES,
  SHAPES,
  SHAPE_GROUPS,
  TAGGING,
  VISION_MODEL,
  nameColor,
  shapePrompt,
} from './trims.js';

env.allowLocalModels = false; // always fetch weights from the Hugging Face Hub (browser-cached)

/* ---------- math ---------- */

function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(vec, (v) => v / norm);
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

/** Splits an [n, d] tensor into n normalized Float32Arrays. */
function rows(tensor) {
  const [n, d] = tensor.dims;
  return Array.from({ length: n }, (_, i) => normalize(tensor.data.subarray(i * d, (i + 1) * d)));
}

/* ---------- model loading ---------- */

const downloads = new Map();
function reportProgress(info) {
  if (info.status !== 'progress' || !info.file) return;
  downloads.set(info.file, { loaded: info.loaded || 0, total: info.total || 0 });
  let loaded = 0;
  let total = 0;
  for (const d of downloads.values()) {
    loaded += d.loaded;
    total += d.total;
  }
  self.postMessage({ type: 'progress', percent: total ? Math.round((loaded / total) * 100) : 0 });
}

const options = { dtype: VISION_MODEL.dtype, progress_callback: reportProgress };
let textModel = null;
let visionModel = null;
let vocabulary = null;

function loadText() {
  textModel ??= (async () => {
    const tokenizer = await AutoTokenizer.from_pretrained(VISION_MODEL.id);
    const model = await CLIPTextModelWithProjection.from_pretrained(VISION_MODEL.id, options);
    self.postMessage({ type: 'ready', part: 'text' });
    return { tokenizer, model };
  })().catch((err) => {
    textModel = null; // allow a retry later
    throw err;
  });
  return textModel;
}

function loadVision() {
  visionModel ??= (async () => {
    const processor = await AutoProcessor.from_pretrained(VISION_MODEL.id);
    const model = await CLIPVisionModelWithProjection.from_pretrained(VISION_MODEL.id, options);
    self.postMessage({ type: 'ready', part: 'vision' });
    return { processor, model };
  })().catch((err) => {
    visionModel = null;
    throw err;
  });
  return visionModel;
}

async function embedTexts(texts) {
  const { tokenizer, model } = await loadText();
  const out = [];
  for (let i = 0; i < texts.length; i += 48) {
    const inputs = tokenizer(texts.slice(i, i + 48), { padding: 'max_length', truncation: true });
    const { text_embeds } = await model(inputs);
    out.push(...rows(text_embeds));
  }
  return out;
}

/** One vector per label: the average of the label written several ways ("prompt ensembling"). */
async function ensemble(prompts) {
  const texts = prompts.flatMap((p) => PROMPT_TEMPLATES.map((t) => t.replace('{}', p)));
  const vecs = await embedTexts(texts);
  const n = PROMPT_TEMPLATES.length;
  return prompts.map((_, i) => {
    const mean = new Float32Array(vecs[0].length);
    for (let j = 0; j < n; j++) {
      const v = vecs[i * n + j];
      for (let k = 0; k < v.length; k++) mean[k] += v[k];
    }
    return normalize(mean);
  });
}

/** Text vectors for every item type, shape and metal finish, computed once and reused. */
function loadVocabulary() {
  vocabulary ??= (async () => {
    const types = await ensemble(ITEM_TYPES.map((t) => t.prompt));
    const shapes = {};
    for (const group of SHAPE_GROUPS) shapes[group] = await ensemble(SHAPES.map((sh) => shapePrompt(sh, group)));
    const metals = await ensemble(METALS.map((m) => m.prompt));
    return { types, shapes, metals };
  })().catch((err) => {
    vocabulary = null;
    throw err;
  });
  return vocabulary;
}

const probabilities = (vec, labelVecs) => softmax(labelVecs.map((lv) => 100 * dot(vec, lv)));
const best = (probs) => probs.reduce((b, p, i) => (p > b.p ? { p, i } : b), { p: -1, i: -1 });

/** Labels from the photo's fingerprint (type, family, shape, metal) plus colors measured from its pixels. */
function tagFrom(embedding, colors, vocab) {
  const tags = [];
  const probs = probabilities(embedding, vocab.types);
  const ranked = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const [p1, i1] = ranked[0];
  const top = ITEM_TYPES[i1];
  const familyOdds = {};
  probs.forEach((p, i) => (familyOdds[ITEM_TYPES[i].group] = (familyOdds[ITEM_TYPES[i].group] || 0) + p));

  let family = top.group;
  if (p1 >= TAGGING.typeConfidence) {
    tags.push(top.key);
    const [p2, i2] = ranked[1];
    if (p2 >= TAGGING.secondType && ITEM_TYPES[i2].group === family) tags.push(ITEM_TYPES[i2].key);
  } else {
    // Not sure of the exact type: say the family instead ("bead", "metal hardware").
    family = Object.entries(familyOdds).sort((a, b) => b[1] - a[1])[0][0];
    tags.push(family);
  }

  if (SHAPE_GROUPS.includes(family)) {
    const shape = best(probabilities(embedding, vocab.shapes[family]));
    if (shape.p >= TAGGING.shapeConfidence) tags.push(SHAPES[shape.i].key);
  }

  // A shiny warm color is gold, a shiny gray is silver.
  const metal = probabilities(embedding, vocab.metals);
  const named = [...colors];
  if (named.length) {
    if (metal[0] >= TAGGING.metalConfidence && ['yellow', 'orange', 'brown', 'beige', 'ivory'].includes(named[0])) named[0] = 'gold';
    else if (metal[1] >= TAGGING.metalConfidence && ['gray', 'white', 'black'].includes(named[0])) named[0] = 'silver';
  }
  return [...tags, ...new Set(named)];
}

/* ---------- color, measured from the pixels ---------- */

/** The item's main colors, ignoring the photo's background (estimated from its border). */
function pixelColors(bitmap) {
  const N = 48;
  const canvas = new OffscreenCanvas(N, N);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  const all = [];
  const border = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const px = [data[i], data[i + 1], data[i + 2]];
      all.push({ px, x, y });
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) border.push(px);
    }
  }
  const median = (k) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [median(0), median(1), median(2)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let fg = all.filter((p) => dist(p.px, bg) > 45).map((p) => p.px);
  if (fg.length < N * N * 0.05) {
    // The item fills the frame (or matches its background): use the middle of the photo.
    fg = all.filter((p) => p.x >= N / 4 && p.x < (3 * N) / 4 && p.y >= N / 4 && p.y < (3 * N) / 4).map((p) => p.px);
  }

  // k-means into 3 color clusters
  const lum = (p) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
  const sorted = [...fg].sort((a, b) => lum(a) - lum(b));
  let centers = [0.2, 0.5, 0.8].map((q) => [...sorted[Math.floor(q * (sorted.length - 1))]]);
  let counts = [0, 0, 0];
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = [0, 0, 0];
    for (const p of fg) {
      let k = 0;
      for (let j = 1; j < centers.length; j++) if (dist(p, centers[j]) < dist(p, centers[k])) k = j;
      sums[k][0] += p[0];
      sums[k][1] += p[1];
      sums[k][2] += p[2];
      counts[k]++;
    }
    centers = centers.map((c, k) => (counts[k] ? sums[k].map((v) => v / counts[k]) : c));
  }

  const shares = {};
  centers.forEach((c, k) => {
    if (!counts[k]) return;
    const name = nameColor(c[0], c[1], c[2]);
    shares[name] = (shares[name] || 0) + counts[k] / fg.length;
  });
  const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  const colors = [ranked[0][0]];
  if (ranked[1] && ranked[1][1] >= 0.25) colors.push(ranked[1][0]);
  if (ranked.length >= 3 && ranked.every(([, share]) => share >= 0.18)) colors.push('multicolor');
  return colors;
}

/* ---------- image analysis ---------- */

/** The whole photo, padded to a square with its own corner color so long trims aren't cropped away. */
function letterboxed(bitmap, size = 320) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, size, size);
  const scale = size / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return new RawImage(ctx.getImageData(0, 0, size, size).data, size, size, 4).rgb();
}

/** A downscaled copy; the processor center-crops it, giving a close-up of the trim's texture. */
function closeUp(bitmap, shortSide = 256) {
  const scale = shortSide / Math.min(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new RawImage(ctx.getImageData(0, 0, w, h).data, w, h, 4).rgb();
}

async function analyzeImage(blob) {
  const [{ processor, model }, vocab] = await Promise.all([loadVision(), loadVocabulary()]);
  const bitmap = await createImageBitmap(blob);
  const aspect = bitmap.width / bitmap.height;

  // Long, skinny trim photos get two looks: the whole strip plus a close-up.
  const views = [letterboxed(bitmap)];
  if (aspect > 1.6 || aspect < 1 / 1.6) views.push(closeUp(bitmap));
  const colors = pixelColors(bitmap);
  bitmap.close();

  const inputs = await processor(views);
  const { image_embeds } = await model(inputs);
  const vecs = rows(image_embeds);
  const mean = new Float32Array(vecs[0].length);
  for (const v of vecs) for (let i = 0; i < v.length; i++) mean[i] += v[i] / vecs.length;
  const embedding = normalize(mean);

  return { embedding, tags: tagFrom(embedding, colors, vocab) };
}

/** Relabel an already-catalogued photo from its saved fingerprint and a small preview (no vision model needed). */
async function retag(blob, embedding) {
  const vocab = await loadVocabulary();
  const bitmap = await createImageBitmap(blob);
  const colors = pixelColors(bitmap);
  bitmap.close();
  return { tags: tagFrom(normalize(Float32Array.from(embedding)), colors, vocab) };
}

/* ---------- message loop ---------- */

// One inference at a time keeps memory predictable on modest laptops.
let queue = Promise.resolve();
const serial = (job) => {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
};

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    let result = {};
    if (type === 'warm') {
      if (data.parts.includes('text')) await loadText();
      if (data.parts.includes('vision')) await Promise.all([loadVision(), loadVocabulary()]);
    } else if (type === 'embedText') {
      const [embedding] = await serial(() => embedTexts([data.text]));
      result = { embedding };
    } else if (type === 'analyzeImage') {
      result = await serial(() => analyzeImage(data.blob));
    } else if (type === 'retag') {
      result = await serial(() => retag(data.blob, data.embedding));
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({ id, ok: true, ...result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
