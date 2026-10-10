/**
 * Pip's eyes: image recognition that runs entirely in the browser.
 *
 * Uses Marqo FashionCLIP (a CLIP model fine-tuned on fashion products) through
 * Transformers.js. It turns trim photos and search text into vectors in the same
 * space, so "gold scalloped lace" lands near photos of gold scalloped lace.
 *
 * Runs in a Web Worker so Pip's animations stay smooth while it thinks.
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
import { TRIM_COLORS, TRIM_TYPES, VISION_MODEL, colorPrompt } from './trims.js';

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
  const inputs = tokenizer(texts, { padding: 'max_length', truncation: true });
  const { text_embeds } = await model(inputs);
  return rows(text_embeds);
}

/** Text vectors for every trim type and color, computed once and reused for tagging. */
function loadVocabulary() {
  vocabulary ??= (async () => {
    const typeVecs = await embedTexts(TRIM_TYPES.map((t) => t.prompt));
    const colorVecs = await embedTexts(TRIM_COLORS.map(colorPrompt));
    return {
      types: TRIM_TYPES.map((t, i) => ({ key: t.key, vec: typeVecs[i] })),
      colors: TRIM_COLORS.map((c, i) => ({ key: c.key, vec: colorVecs[i] })),
    };
  })().catch((err) => {
    vocabulary = null;
    throw err;
  });
  return vocabulary;
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

function topLabels(vec, labels, { max, minProb }) {
  const probs = softmax(labels.map((l) => 100 * dot(vec, l.vec)));
  const ranked = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const picked = [labels[ranked[0][1]].key];
  for (let k = 1; k < max; k++) {
    if (ranked[k][0] >= minProb) picked.push(labels[ranked[k][1]].key);
  }
  return picked;
}

async function analyzeImage(blob) {
  const [{ processor, model }, vocab] = await Promise.all([loadVision(), loadVocabulary()]);
  const bitmap = await createImageBitmap(blob);
  const aspect = bitmap.width / bitmap.height;

  // Long, skinny trim photos get two looks: the whole strip plus a close-up.
  const views = [letterboxed(bitmap)];
  if (aspect > 1.6 || aspect < 1 / 1.6) views.push(closeUp(bitmap));
  bitmap.close();

  const inputs = await processor(views);
  const { image_embeds } = await model(inputs);
  const vecs = rows(image_embeds);
  const mean = new Float32Array(vecs[0].length);
  for (const v of vecs) for (let i = 0; i < v.length; i++) mean[i] += v[i] / vecs.length;
  const embedding = normalize(mean);

  const tags = [
    ...topLabels(embedding, vocab.types, { max: 2, minProb: 0.2 }),
    ...topLabels(embedding, vocab.colors, { max: 2, minProb: 0.25 }),
  ];
  return { embedding, tags };
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
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({ id, ok: true, ...result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
