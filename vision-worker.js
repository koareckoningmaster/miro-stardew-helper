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
  FINISHES,
  ITEM_TYPES,
  MATERIALS,
  METALS,
  PATTERNS,
  SHAPE_PRIORS,
  PROMPT_TEMPLATES,
  SHAPES,
  SHAPE_GROUPS,
  TAGGING,
  VISION_MODEL,
  nameColor,
  shapePrompt,
} from './trims.js?v=2026.10.11-d';

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
    const materials = await ensemble(MATERIALS.map((m) => m.prompt));
    const patterns = await ensemble(PATTERNS.map((m) => m.prompt));
    const finishes = await ensemble(FINISHES.map((m) => m.prompt));
    return { types, shapes, metals, materials, patterns, finishes };
  })().catch((err) => {
    vocabulary = null;
    throw err;
  });
  return vocabulary;
}

const probabilities = (vec, labelVecs) => softmax(labelVecs.map((lv) => 100 * dot(vec, lv)));
const best = (probs) => probs.reduce((b, p, i) => (p > b.p ? { p, i } : b), { p: -1, i: -1 });

/** Labels from the photo's fingerprint (type, family, shape, metal) plus colors measured from its pixels. */
function tagFrom(embedding, colors, vocab, shape = null) {
  const tags = [];
  let probs = probabilities(embedding, vocab.types);
  const nudges = shapeNudges(shape);
  if (nudges) {
    // ring-like types get a boost when the item has a hole in the middle
    probs = probs.map((p, i) => p * (nudges.types[ITEM_TYPES[i].key] ?? 1));
    const sum = probs.reduce((a, b) => a + b, 0);
    probs = probs.map((p) => p / sum);
  }

  // 1. The family, scored by its three best candidates: that copes with near-synonyms splitting the
  //    vote, without favouring families just because they have more words in the vocabulary.
  //    The item's shape then nudges the families (a strip, a compact object, several pieces).
  const byFamily = {};
  probs.forEach((p, i) => (byFamily[ITEM_TYPES[i].group] ||= []).push(p));
  const familyOdds = {};
  const familyScore = {};
  for (const [group, ps] of Object.entries(byFamily)) {
    familyOdds[group] = ps.reduce((a, b) => a + b, 0);
    const top3 = [...ps].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    familyScore[group] = top3 * (nudges?.family[group] ?? 1);
  }
  const family = Object.entries(familyScore).sort((a, b) => b[1] - a[1])[0][0];

  // 2. The exact type within that family, only when it's confident or clearly ahead.
  const inFamily = probs
    .map((p, i) => [p / familyOdds[family], i])
    .filter(([, i]) => ITEM_TYPES[i].group === family)
    .sort((a, b) => b[0] - a[0]);
  const [s1, i1] = inFamily[0];
  const [s2, i2] = inFamily[1] || [0, -1];
  const clearLead = s1 >= TAGGING.typeFloor && s1 >= TAGGING.typeLead * s2;
  // Variations on the same thing (sequin trim / sequin fringe / sequin mesh) share their odds:
  // if together they're confident, name the most general of them rather than guessing a variant.
  const words = (i) => ITEM_TYPES[i].key.split('-').filter((t) => t.length > 3);
  const headWords = words(i1);
  const cluster = inFamily.filter(([, i]) => words(i).some((t) => headWords.includes(t)));
  const clusterShare = cluster.reduce((sum, [s]) => sum + s, 0);
  if (s1 >= TAGGING.typeConfidence || clearLead) {
    tags.push(ITEM_TYPES[i1].key);
    if (i2 >= 0 && s2 >= TAGGING.secondType) tags.push(ITEM_TYPES[i2].key);
  } else if (clusterShare >= TAGGING.typeConfidence) {
    // the most general member; if several are equally general and none stands out, just the family
    const size = (i) => ITEM_TYPES[i].key.split('-').length;
    const fewest = Math.min(...cluster.map(([, i]) => size(i)));
    const general = cluster.filter(([, i]) => size(i) === fewest).sort((a, b) => b[0] - a[0]);
    const standsOut = general.length === 1 || general[0][0] >= TAGGING.typeLead * general[1][0];
    tags.push(standsOut ? ITEM_TYPES[general[0][1]].key : family);
  } else {
    tags.push(family); // not sure of the exact type: say the family ("bead", "metal hardware")
  }

  if (SHAPE_GROUPS.includes(family)) {
    const shape = best(probabilities(embedding, vocab.shapes[family]));
    if (shape.p >= TAGGING.shapeConfidence) tags.push(SHAPES[shape.i].key);
  }

  // Material, pattern and finish, each only when Squeak is fairly sure.
  for (const [list, vecs, min] of [
    [MATERIALS, vocab.materials, TAGGING.materialConfidence],
    [PATTERNS, vocab.patterns, TAGGING.patternConfidence],
    [FINISHES, vocab.finishes, TAGGING.finishConfidence],
  ]) {
    const pickd = best(probabilities(embedding, vecs));
    if (pickd.p >= min) tags.push(list[pickd.i].key);
  }

  // A shiny warm color is gold, a shiny gray is silver.
  const metal = probabilities(embedding, vocab.metals);
  const named = [...colors];
  if (named.length) {
    if (metal[0] >= TAGGING.metalConfidence && ['yellow', 'orange', 'brown', 'beige', 'ivory'].includes(named[0])) named[0] = 'gold';
    else if (metal[1] >= TAGGING.metalConfidence && ['gray', 'white', 'black'].includes(named[0])) named[0] = 'silver';
  }
  if (shape && !shape.fillsFrame && shape.count >= 2) tags.push('n:several');
  return [...tags, ...new Set(named)];
}

/* ---------- the item's shape, measured from the pixels ---------- */

/** Finds the item against its background and measures it: where it is (for cropping), how
    elongated it is (independent of rotation), how many separate pieces, and whether it has a hole. */
function itemShape(bitmap) {
  const N = 160; // fine enough that small items (sequins, seed beads) aren't lost as specks
  const scale = N / Math.max(bitmap.width, bitmap.height);
  const W = Math.max(8, Math.round(bitmap.width * scale));
  const H = Math.max(8, Math.round(bitmap.height * scale));
  const ctx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const at = (x, y) => (y * W + x) * 4;

  // background: the photo's border, with its own spread so busy backgrounds need a bigger difference
  const border = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) border.push(at(x, y));
  const med = (k) => border.map((i) => data[i + k]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [med(0), med(1), med(2)];
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  // how much the background itself varies (ignoring the quarter of the border the item may run off into)
  const spread = border.map(dist).sort((a, b) => a - b)[Math.floor(border.length * 0.75)];
  const thr = Math.max(40, spread * 1.6);
  const fg = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fg[y * W + x] = dist(at(x, y)) > thr ? 1 : 0;

  const share = fg.reduce((a, b) => a + b, 0) / (W * H);
  const whole = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  if (share > 0.82 || share < 0.004) return { fillsFrame: true, box: whole };

  // separate pieces (4-connected), ignoring specks
  const label = new Int32Array(W * H);
  const pieces = [];
  for (let start = 0; start < W * H; start++) {
    if (!fg[start] || label[start]) continue;
    const id = pieces.length + 1;
    const stack = [start];
    label[start] = id;
    const px = [];
    while (stack.length) {
      const i = stack.pop();
      px.push(i);
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && fg[j] && !label[j]) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    pieces.push(px);
  }
  const minArea = Math.max(5, W * H * 0.0006); // anything smaller is dust or noise
  const real = pieces.filter((p) => p.length >= minArea).sort((a, b) => b.length - a.length);
  if (!real.length) return { fillsFrame: true, box: whole };

  // Trim photos often show several of the same item. Pieces about as big as the largest are one item
  // repeated: measure the shape from them. Only lots of tiny pieces suggest loose beads or sequins.
  const group = real.filter((p) => p.length >= real[0].length * 0.25);
  const tiny = real.filter((p) => p.length < W * H * 0.012);
  const scatter = tiny.length >= SHAPE_PRIORS.minTiny && tiny.length >= real.length * 0.6;

  const boxOf = (list) => {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const p of list) for (const i of p) {
      const x = i % W;
      const y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.08) + 1;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    return { x: x0 / scale, y: y0 / scale, w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale };
  };
  const box = boxOf(real); // everything that's item (the whole group)
  const pieceBox = boxOf([group[0]]); // one piece, for a close look

  // elongation of a piece: ratio of its principal axes (works at any angle); the group's typical value
  const elongationOf = (piece) => {
    let mx = 0, my = 0;
    for (const i of piece) { mx += i % W; my += (i / W) | 0; }
    mx /= piece.length; my /= piece.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of piece) {
      const dx = (i % W) - mx;
      const dy = ((i / W) | 0) - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const tr = (sxx + syy) / piece.length;
    const det = (sxx * syy - sxy * sxy) / (piece.length * piece.length);
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    return { e: Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc)), mx, my };
  };
  const sample = group.slice(0, 6);
  const shapes = sample.map(elongationOf);
  const elongation = shapes.map((s) => s.e).sort((a, b) => a - b)[shapes.length >> 1];

  // a hole: background enclosed by a piece, near its middle (checked for each piece in the group)
  const hasHole = (piece, { mx, my }) => {
    const mine = new Uint8Array(W * H);
    for (const i of piece) mine[i] = 1;
    const outside = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const i = stack.pop();
      if (outside[i] || mine[i]) continue;
      outside[i] = 1;
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
    }
    let area = 0, hx = 0, hy = 0;
    for (let i = 0; i < W * H; i++) {
      if (!outside[i] && !mine[i]) { area++; hx += i % W; hy += (i / W) | 0; }
    }
    if (area < piece.length * 0.12) return false;
    hx /= area; hy /= area;
    return Math.hypot(hx - mx, hy - my) < Math.sqrt(piece.length / Math.PI) * 0.6;
  };
  const holes = sample.filter((piece, k) => hasHole(piece, shapes[k])).length;
  const hole = holes > sample.length / 2;

  return { fillsFrame: false, box, pieceBox, elongation, count: group.length, scatter, hole };
}

/** How the shape nudges each family (and ring-like types). Null = no nudge. */
function shapeNudges(shape) {
  if (!shape || shape.fillsFrame) return null;
  const S = SHAPE_PRIORS;
  const family = shape.scatter ? S.scatter
    : shape.elongation >= S.stripElongation ? S.strip
    : shape.elongation < S.compactElongation ? S.compact
    : null;
  const types = shape.hole ? Object.fromEntries(S.holeTypes.map((k) => [k, S.holeBoost])) : {};
  return family || Object.keys(types).length ? { family: family || {}, types } : null;
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
  const shape = itemShape(bitmap);
  const colors = pixelColors(bitmap);

  // Look at the item itself (cropped from its background), the whole photo for context, and for
  // long strips a texture close-up. The item counts most.
  const views = [];
  const weights = [];
  const crop = ({ x, y, w, h }) => createImageBitmap(bitmap, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  let item = bitmap;
  if (!shape.fillsFrame) {
    item = await crop(shape.box);
    if (shape.count > 1) {
      // several of the same item: one piece up close, plus the group
      const piece = await crop(shape.pieceBox);
      views.push(letterboxed(piece));
      weights.push(0.35);
      views.push(letterboxed(item));
      weights.push(0.3);
      item.close();
      item = piece;
    } else {
      views.push(letterboxed(item));
      weights.push(0.55);
    }
  }
  views.push(letterboxed(bitmap));
  weights.push(shape.fillsFrame ? 0.7 : 0.15);
  const aspect = item.width / item.height;
  if (aspect > 1.6 || aspect < 1 / 1.6 || (shape.elongation || 0) >= SHAPE_PRIORS.stripElongation) {
    views.push(closeUp(item));
    weights.push(0.2);
  }
  if (item !== bitmap) item.close();
  bitmap.close();

  const inputs = await processor(views);
  const { image_embeds } = await model(inputs);
  const vecs = rows(image_embeds);
  const total = weights.slice(0, vecs.length).reduce((a, b) => a + b, 0);
  const mean = new Float32Array(vecs[0].length);
  vecs.forEach((v, k) => {
    for (let i = 0; i < v.length; i++) mean[i] += (v[i] * weights[k]) / total;
  });
  const embedding = normalize(mean);

  return { embedding, tags: tagFrom(embedding, colors, vocab, shape) };
}

/** Relabel an already-catalogued photo from its saved fingerprint and a small preview (no vision model needed). */
async function retag(blob, embedding) {
  const vocab = await loadVocabulary();
  const bitmap = await createImageBitmap(blob);
  const colors = pixelColors(bitmap);
  const shape = itemShape(bitmap);
  bitmap.close();
  return { tags: tagFrom(normalize(Float32Array.from(embedding)), colors, vocab, shape) };
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
    } else if (type === 'embedQuery') {
      // a search, phrased several ways and averaged, like the labels it's compared with
      const [embedding] = await serial(() => ensemble([data.text]));
      result = { embedding: Array.from(embedding) };
    } else if (type === 'inspect') {
      const bitmap = await createImageBitmap(data.blob);
      result = { shape: itemShape(bitmap), colors: pixelColors(bitmap) };
      bitmap.close();
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
