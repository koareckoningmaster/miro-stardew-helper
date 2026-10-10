/**
 * Pip, the trim finder: a pixel-art shopkeeper for Miro boards full of fashion trims.
 * He stands behind the counter of a Gothic fabric atelier in the side panel.
 *
 *   Greets  people as they arrive (online_users:update) and asks what they need.
 *   Listens when clicked: a search box opens inside his dialogue box.
 *   Looks   at every trim photo with in-browser image recognition, auto-tags it
 *           ("ivory", "scalloped", "lace") and saves the tags on the image as app metadata.
 *   Finds   matches by keyword, tag or plain description, "holds up" the best one,
 *           asks if you'd like a closer look, then flies the viewport there with zoomTo().
 */
import { LINES } from './lines.js';
import { VISION_MODEL, describeTags, tagSearchText } from './trims.js';

/* ═════════════════════════ Config ═════════════════════════ */

const CONFIG = {
  searchTypes: ['image', 'sticky_note', 'text', 'card', 'app_card', 'shape'],
  maxFinds: 8,
  metaKey: 'pipTrim', // where tags + the image fingerprint are stored on each image
  writeAltText: false, // true = also fill empty image alt text with Pip's tags (visible to everyone)
  semantic: {
    // A photo counts as a visual match only if the description fits it better than the
    // plain baseline "a trim" does (minLift) and clears an absolute floor. Raise these if
    // Pip suggests trims that don't fit; lower them if he misses ones that do.
    minLift: 0.015,
    floor: 0.18,
    weight: 22, // how much a confident visual match is worth versus a keyword match
  },
};

const TYPE_NAMES = {
  image: 'trim',
  sticky_note: 'sticky note',
  text: 'text box',
  card: 'card',
  app_card: 'card',
  shape: 'shape',
};

const STOP_WORDS = new Set(
  ('a an and any are about at be can could do does find for from get have i im in is it ' +
    'like look looking me my need of on one or our please show some that the there this to ' +
    'trim trims trimming edge edging border want was we where which with you').split(' ')
);

/* ═════════════════════════ Helpers ═════════════════════════ */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// Miro always runs the panel inside an iframe. Opened on its own (e.g. http://localhost:3000/app.html)
// Pip runs in preview mode: he greets and animates, but there's no board to search.
const PREVIEW = window.self === window.top || !window.miro?.board;

function firstName(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (/^(the|a|an)$/i.test(words[0])) return words.slice(0, 3).join(' '); // nicknames like "The Koala": keep them whole
  if (/^(mr|mrs|ms|mx|dr|prof)\.?$/i.test(words[0]) && words[1]) return words[1]; // skip titles
  return words[0];
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const lastLine = new Map();
/** A random line from LINES[key] (never the same one twice in a row), with {placeholders} filled. */
function line(key, vars = {}) {
  const options = LINES[key] || [''];
  let text = pick(options);
  if (options.length > 1) {
    while (text === lastLine.get(key)) text = pick(options);
  }
  lastLine.set(key, text);
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
}

function joinNames(names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] || 'friend';
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} and ${unique.at(-1)}`;
}

async function mapLimit(list, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  });
  await Promise.all(workers);
}

/* ═════════════════════════ DOM ═════════════════════════ */

const scene = $('scene');
const pipButton = $('pipButton');
const shopCanvas = $('shop');
const emoteEl = $('emote');
const dialogEl = $('dialog');
const arrivalEl = $('arrival');
const textEl = $('dialogText');
const liveEl = $('live');
const revealEl = $('reveal');
const revealImg = $('revealImg');
const choicesEl = $('choices');
const askForm = $('askForm');
const input = $('query');
const hintEl = $('hint');
const signEl = $('sign');
const signText = $('signText');
const signFill = $('signFill');
const findsEl = $('finds');
const findsTitle = $('findsTitle');
const findsList = $('findsList');

/* ═════════════════════════ The atelier & Pip's animation ═════════════════════════
   The scene is a 96×96 pixel canvas, scaled 3× by CSS with hard edges. Every frame is three
   layers: the Gothic atelier (one version per time of day, for the city view in the windows),
   Pip's portrait (one of 12 frames: eyes × mouth), then the counter in front of him. */

const ART = {
  'back-morning': 'assets/atelier-morning.png',
  'back-day': 'assets/atelier-day.png',
  'back-evening': 'assets/atelier-evening.png',
  'back-night': 'assets/atelier-night.png',
  front: 'assets/counter.png',
  portrait: 'assets/pip-portrait.png', // 12 frames, 64×64 each: [open, closed, happy eyes] × [closed, o, open, grin mouth]
};
const SCENE_SIZE = 96;
const PORTRAIT = { x: 13, y: 18, size: 64 }; // head centered under the big arched window
const EYES = ['open', 'closed', 'happy'];
const MOUTHS = ['closed', 'o', 'open', 'grin'];

const shopCtx = shopCanvas.getContext('2d');
const images = {};
const pose = { eyes: 'open', mouth: 'closed', breath: 0, lift: 0 };
let paintQueued = false;

function loadArt() {
  return Promise.all(
    Object.entries(ART).map(
      ([key, src]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve((images[key] = img));
          img.onerror = () => {
            console.warn(`[Pip] Missing art: ${src}`);
            resolve(null);
          };
          img.src = src;
        })
    )
  ).then(paint);
}

/** Repaints on the next animation frame (coalesces many pose changes into one draw). */
function paint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const ctx = shopCtx;
    ctx.clearRect(0, 0, SCENE_SIZE, SCENE_SIZE);
    const back = images[`back-${scene.dataset.time}`] || images['back-day'];
    if (back) ctx.drawImage(back, 0, 0);
    if (images.portrait) {
      const frame = EYES.indexOf(pose.eyes) * MOUTHS.length + MOUTHS.indexOf(pose.mouth);
      const { x, y, size } = PORTRAIT;
      ctx.drawImage(images.portrait, frame * size, 0, size, size, x, y + pose.breath + pose.lift, size, size);
    }
    if (images.front) ctx.drawImage(images.front, 0, 0);
  });
}

function setPose(changes) {
  Object.assign(pose, changes);
  paint();
}

const body = {
  restMouth: 'closed',
  restEyes: 'open',
  talkTimer: null,
  moveTimers: [],

  /** Idle life: breathing (a 1-pixel rise and fall behind the counter) and blinking. */
  liveForever() {
    if (reduceMotion) return;
    const breathe = () => {
      setPose({ breath: pose.breath ? 0 : 1 });
      setTimeout(breathe, scene.classList.contains('is-searching') ? 260 : 1300);
    };
    setTimeout(breathe, 1300);
    const blink = () => {
      setTimeout(() => {
        if (pose.eyes === 'open') {
          setPose({ eyes: 'closed' });
          setTimeout(() => pose.eyes === 'closed' && setPose({ eyes: this.restEyes }), 130);
        }
        blink();
      }, 2200 + Math.random() * 3000);
    };
    blink();
  },

  talk(on) {
    clearInterval(this.talkTimer);
    this.talkTimer = null;
    if (!on || reduceMotion) {
      setPose({ mouth: this.restMouth });
      return;
    }
    const shapes = ['o', 'open', 'closed', 'open', 'o'];
    this.talkTimer = setInterval(() => setPose({ mouth: pick(shapes) }), 105);
  },

  pauseMouth() {
    setPose({ mouth: 'closed' });
  },

  /** 'happy' = grin at rest and a moment of happy, squinting eyes. */
  mood(kind) {
    this.restMouth = kind === 'happy' ? 'grin' : 'closed';
    if (!this.talkTimer) setPose({ mouth: this.restMouth });
    if (kind === 'happy' && !reduceMotion) {
      setPose({ eyes: 'happy' });
      setTimeout(() => pose.eyes === 'happy' && setPose({ eyes: 'open' }), 1400);
    }
  },

  /** A sequence of vertical offsets (in art pixels), one step every `ms`. */
  move(offsets, ms) {
    this.moveTimers.forEach(clearTimeout);
    if (reduceMotion) return;
    this.moveTimers = offsets.map((lift, i) => setTimeout(() => setPose({ lift }), i * ms));
  },

  hop() {
    this.move([-2, -3, -1, 0], 70);
  },

  /** A friendly greeting bounce, the shopkeeper's version of a wave. */
  nod(times = 2) {
    this.move(Array.from({ length: times }, () => [-1, -2, -1, 0]).flat(), 90);
  },
};

let emoteTimer = null;
function popEmote(symbol) {
  emoteEl.textContent = symbol;
  emoteEl.classList.remove('is-on');
  void emoteEl.offsetWidth;
  emoteEl.classList.add('is-on');
  clearTimeout(emoteTimer);
  emoteTimer = setTimeout(() => emoteEl.classList.remove('is-on'), 2200);
}

function setTimeOfDay() {
  const h = new Date().getHours();
  scene.dataset.time = h < 5 ? 'night' : h < 10 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'evening' : 'night';
  paint(); // the atelier windows show the city at this time of day
}

/* ═════════════════════════ Dialogue box ═════════════════════════ */

let lineId = 0;
let skipTyping = false;
let pendingChoice = null;

/** Types a line RPG-style. Resolves true if it finished, false if a newer line interrupted. */
async function say(text, { arrivals = [], reveal = null } = {}) {
  const id = ++lineId;
  skipTyping = false;
  closeChoices();
  hintEl.hidden = true;

  const tag = arrivals.length ? `${joinNames(arrivals)} just arrived` : '';
  arrivalEl.hidden = !tag;
  arrivalEl.textContent = tag;
  showReveal(reveal);
  liveEl.textContent = tag ? `${tag}. ${text}` : text;

  if (reduceMotion) {
    textEl.textContent = text;
    return true;
  }

  dialogEl.classList.add('is-typing');
  body.talk(true);
  for (let i = 1; i <= text.length; i++) {
    if (id !== lineId) return false;
    if (skipTyping) i = text.length;
    textEl.textContent = text.slice(0, i);
    const ch = text[i - 1];
    if (/[.!?…]/.test(ch)) {
      body.pauseMouth();
      await sleep(190);
    } else {
      await sleep(/[,;:]/.test(ch) ? 90 : 24);
    }
  }
  if (id !== lineId) return false;
  body.talk(false);
  dialogEl.classList.remove('is-typing');
  return true;
}

/** The trim Pip "holds up" in the dialogue box, like an RPG item reveal. */
function showReveal(item) {
  if (!item || item.type !== 'image') {
    revealEl.hidden = true;
    revealImg.removeAttribute('src');
    return;
  }
  revealEl.hidden = false;
  revealImg.removeAttribute('src');
  const wanted = item.id;
  revealEl.dataset.id = wanted;
  thumbnail(item).then((url) => {
    if (url && revealEl.dataset.id === wanted) revealImg.src = url;
  });
}

function ask(options, { escapeValue = null } = {}) {
  return new Promise((resolve) => {
    const buttons = options.map(({ label, value }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      button.textContent = label;
      button.addEventListener('click', () => finish(value));
      return button;
    });

    const onKey = (event) => {
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length].focus();
      } else if (event.key === 'Escape' && escapeValue !== null) {
        event.preventDefault();
        finish(escapeValue);
      }
    };

    function finish(value) {
      choicesEl.removeEventListener('keydown', onKey);
      pendingChoice = null;
      closeChoices();
      resolve(value);
    }

    choicesEl.replaceChildren(...buttons);
    choicesEl.hidden = false;
    choicesEl.addEventListener('keydown', onKey);
    pendingChoice = { cancel: () => finish(null) };
    buttons[0].focus({ preventScroll: true });
  });
}

function closeChoices() {
  choicesEl.hidden = true;
  choicesEl.replaceChildren();
}

function showAsk() {
  askForm.hidden = false;
  hintEl.hidden = true;
  input.focus({ preventScroll: true });
  input.select();
}

function hideAsk() {
  askForm.hidden = true;
}

function showHint() {
  if (askForm.hidden && choicesEl.hidden) hintEl.hidden = false;
}

/* ═════════════════════════ Status sign ═════════════════════════ */

let signHideTimer = null;
function setSign(text, fraction = null) {
  clearTimeout(signHideTimer);
  signEl.hidden = false;
  signText.textContent = text;
  signEl.classList.toggle('has-bar', fraction !== null);
  if (fraction !== null) signFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}
function hideSign(afterMs = 0) {
  clearTimeout(signHideTimer);
  signHideTimer = setTimeout(() => (signEl.hidden = true), afterMs);
}

/* ═════════════════════════ Pip's eyes (vision worker) ═════════════════════════ */

function createVision() {
  const state = { textReady: false, visionReady: false, failed: false, loading: false, percent: 0 };
  let worker;
  try {
    worker = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('[Pip] Image recognition unavailable:', err);
    return { state: { ...state, failed: true } };
  }

  const pending = new Map();
  let seq = 0;

  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      state.percent = data.percent;
      state.loading = true;
      if (!catalog.running || !state.visionReady) setSign(`Loading image recognition: ${data.percent}%`, data.percent / 100);
      return;
    }
    if (data.type === 'ready') {
      state[`${data.part}Ready`] = true;
      state.loading = false;
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    data.ok ? job.resolve(data) : job.reject(new Error(data.error));
  };

  worker.onerror = (event) => {
    console.warn('[Pip] Image recognition failed to start:', event.message || event);
    state.failed = true;
    for (const job of pending.values()) job.reject(new Error('Vision worker crashed'));
    pending.clear();
  };

  const call = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });

  return {
    state,
    warm: (parts) => call('warm', { parts }),
    embedText: (text) => call('embedText', { text }).then((r) => Float32Array.from(r.embedding)),
    analyzeImage: (blob) =>
      call('analyzeImage', { blob }).then((r) => ({ embedding: Float32Array.from(r.embedding), tags: r.tags })),
  };
}

let vision = { state: { failed: true } };
const visionUsable = () => !vision.state.failed && typeof vision.embedText === 'function';

/* ═════════════════════════ Catalog: auto-tagging every trim photo ═════════════════════════
   Each image is looked at once per board. Its tags and a compact fingerprint (a 512-number
   vector squeezed into ~700 characters) are saved in the image's app metadata, so everyone
   who opens Pip afterwards gets instant, recognition-powered search. */

const index = new Map(); // image id -> { tags: string[], embedding: Float32Array }
const catalog = { queue: [], running: false, paused: false, readOnly: false, done: 0, total: 0 };

function packEmbedding(vec) {
  let max = 0;
  for (const v of vec) max = Math.max(max, Math.abs(v));
  const scale = max || 1;
  const bytes = Int8Array.from(vec, (v) => Math.round((v / scale) * 127));
  let binary = '';
  for (const b of new Uint8Array(bytes.buffer)) binary += String.fromCharCode(b);
  return { e: btoa(binary), s: scale };
}

function unpackEmbedding(e, s) {
  const raw = atob(e);
  const bytes = new Int8Array(Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer);
  const vec = Float32Array.from(bytes, (b) => (b / 127) * s);
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

function readMeta(meta) {
  if (!meta || meta.v !== 1 || meta.model !== VISION_MODEL.tag || typeof meta.e !== 'string') return null;
  try {
    return { tags: Array.isArray(meta.tags) ? meta.tags : [], embedding: unpackEmbedding(meta.e, meta.s) };
  } catch {
    return null;
  }
}

function writeMeta(entry) {
  return { v: 1, model: VISION_MODEL.tag, tags: entry.tags, ...packEmbedding(entry.embedding) };
}

function renderCatalogSign() {
  if (catalog.running && vision.state.visionReady) {
    setSign(`Cataloguing trims: ${catalog.done} of ${catalog.total}`, catalog.total ? catalog.done / catalog.total : 0);
  } else if (!catalog.running && catalog.total && !catalog.queue.length) {
    setSign(`${index.size} trims catalogued`);
    hideSign(2500);
  }
}

async function scanBoard() {
  let images;
  try {
    images = await miro.board.get({ type: 'image' });
  } catch (err) {
    console.warn('[Pip] Could not list images:', err);
    return;
  }
  catalog.total = images.length;
  catalog.done = 0;
  catalog.queue = [];
  await mapLimit(images, 6, async (image) => {
    const entry = readMeta(await image.getMetadata(CONFIG.metaKey).catch(() => undefined));
    if (entry) {
      index.set(image.id, entry);
      catalog.done++;
    } else {
      catalog.queue.push(image);
    }
  });
  if (catalog.queue.length) runCatalog();
}

async function imageBlob(image) {
  try {
    return await image.getFile('original');
  } catch {
    return image.getFile('preview');
  }
}

async function runCatalog() {
  if (catalog.running || !catalog.queue.length || !visionUsable()) return;
  catalog.running = true;
  try {
    await vision.warm(['vision']);
  } catch (err) {
    console.warn('[Pip] Image recognition could not load:', err);
    vision.state.failed = true;
    catalog.running = false;
    hideSign();
    ambient(line('catalogFailed'));
    return;
  }

  renderCatalogSign();
  while (catalog.queue.length) {
    while (catalog.paused) await sleep(250);
    const image = catalog.queue.shift();
    try {
      const entry = await vision.analyzeImage(await imageBlob(image));
      index.set(image.id, entry);
      if (!catalog.readOnly) {
        await image.setMetadata(CONFIG.metaKey, writeMeta(entry)).catch((err) => {
          catalog.readOnly = true; // e.g. view-only access: keep tags in memory for this session
          console.info('[Pip] Tags kept in memory only (no write access):', err?.message || err);
        });
      }
      if (CONFIG.writeAltText && !catalog.readOnly && !image.alt) {
        image.alt = cap(describeTags(entry.tags, { article: false }));
        await image.sync().catch(() => {});
      }
    } catch (err) {
      console.warn(`[Pip] Couldn't catalogue image ${image.id}:`, err);
    }
    catalog.done++;
    renderCatalogSign();
  }
  catalog.running = false;
  renderCatalogSign();
  if (index.size) ambient(line('catalogDone', { count: index.size }));
}

function onItemsCreated({ items = [] }) {
  const fresh = items.filter((item) => item.type === 'image' && !index.has(item.id));
  if (!fresh.length) return;
  catalog.queue.push(...fresh);
  catalog.total += fresh.length;
  runCatalog();
}

function onItemsDeleted({ items = [] }) {
  for (const item of items) index.delete(item.id);
}

/* ═════════════════════════ Matching ═════════════════════════ */

const parser = new DOMParser();
const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const fold = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function plainText(value) {
  if (!value) return '';
  const spaced = String(value).replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, ' $&');
  return (parser.parseFromString(spaced, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Camera-roll names like "IMG_2231.jpg" say nothing about the trim. */
const meaningfulTitle = (title) => {
  const stem = (title || '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
  return stem.replace(/[^a-z]/gi, '').length >= 3 && !/^(img|dsc|dscn|pxl|image|photo|screenshot|untitled|scan)[\W_]*\d/i.test(stem)
    ? stem
    : '';
};

function fieldsOf(item) {
  switch (item.type) {
    case 'sticky_note':
    case 'text':
    case 'shape':
      return [{ key: 'content', text: plainText(item.content), weight: 1 }];
    case 'card':
    case 'app_card':
      return [
        { key: 'title', text: plainText(item.title), weight: 1.4 },
        { key: 'description', text: plainText(item.description), weight: 1 },
      ];
    case 'image': {
      const tags = index.get(item.id)?.tags || [];
      return [
        { key: 'title', text: item.title || '', weight: 1.4 },
        { key: 'alt', text: item.alt || '', weight: 1.2 },
        { key: 'tags', text: tagSearchText(tags), weight: 1.3 },
      ];
    }
    default:
      return [];
  }
}

function tokenize(query) {
  const words = fold(query).split(WORD_SPLIT).filter(Boolean);
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  return meaningful.length ? meaningful : words;
}

function keywordScore(item, phrase, tokens) {
  const hits = new Set();
  let total = 0;
  let best = { score: 0, key: '', text: '' };
  for (const field of fieldsOf(item)) {
    if (!field.text) continue;
    const hay = fold(field.text);
    const words = hay.split(WORD_SPLIT);
    let score = 0;
    if (phrase.length > 1 && hay.includes(phrase)) score += hay === phrase ? 14 : 8;
    for (const token of tokens) {
      if (words.includes(token)) {
        score += 4;
        hits.add(token);
      } else if (words.some((w) => w.startsWith(token))) {
        score += 3;
        hits.add(token);
      } else if (token.length > 2 && hay.includes(token)) {
        score += 1.5;
        hits.add(token);
      }
    }
    score *= field.weight;
    if (score > best.score) best = { score, key: field.key, text: field.text };
    total += score;
  }
  return { total, coverage: tokens.length ? hits.size / tokens.length : 0, best };
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * How well each catalogued photo fits the description.
 *   sim:  similarity between the description and the photo
 *   lift: how much better it fits than the neutral baseline "a trim" (filters out nonsense queries)
 *   p:    share of the board's total match (softmax), so one clear winner scores high
 */
function visualScores(queryVec, baseVec) {
  const scores = new Map();
  if (!queryVec || !index.size) return scores;
  const rows = [...index].map(([id, { embedding }]) => {
    const sim = dot(queryVec, embedding);
    return { id, sim, lift: baseVec ? sim - dot(baseVec, embedding) : 0 };
  });
  const max = Math.max(...rows.map((r) => r.sim));
  const exps = rows.map((r) => Math.exp(100 * (r.sim - max)));
  const total = exps.reduce((a, b) => a + b, 0);
  rows.forEach((r, i) => scores.set(r.id, { ...r, p: exps[i] / total }));
  return scores;
}

let baselineVec = null;
async function baselineVector() {
  if (!baselineVec && visionUsable()) baselineVec = await vision.embedText('a trim').catch(() => null);
  return baselineVec;
}

function rankItems(items, query, queryVec, baseVec) {
  const phrase = fold(query).replace(/\s+/g, ' ').trim();
  const tokens = tokenize(query);
  const visual = visualScores(queryVec, baseVec);
  const { floor, minLift, weight } = CONFIG.semantic;

  let finds = items
    .map((item) => {
      const kw = keywordScore(item, phrase, tokens);
      const v = visual.get(item.id);
      const looksRight = v && v.sim >= floor && v.lift >= minLift;
      const visualPoints = looksRight ? v.p * weight : 0;
      const score = kw.total + kw.coverage * 6 + visualPoints;
      if (kw.total === 0 && visualPoints < 1) return null;
      return { item, score, coverage: kw.coverage, keyword: kw.total > 0, visualP: looksRight ? v.p : 0, field: kw.best.key, text: kw.best.text };
    })
    .filter(Boolean);

  // When something matches every word, drop stragglers unless they look right.
  if (finds.some((f) => f.coverage === 1)) finds = finds.filter((f) => f.coverage >= 0.5 || f.visualP >= 0.25);
  return finds.sort((a, b) => b.score - a.score);
}

function snippet(text, query, max = 60) {
  if (text.length <= max) return text;
  const lower = text.toLowerCase();
  const positions = tokenize(query).map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const at = positions.length ? Math.min(...positions) : 0;
  let start = Math.max(0, Math.min(at - 16, text.length - max));
  let end = start + max;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space > -1 && space < at) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start) end = space;
  }
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

/** How Pip names a find out loud: "a white lace trim called "Bridal edge"". */
function describe(find, query) {
  const { item } = find;
  if (item.type === 'image') {
    const tags = index.get(item.id)?.tags || [];
    const title = meaningfulTitle(item.title);
    const base = tags.length ? describeTags(tags) : 'a trim photo';
    if (title) return `${base} called "${snippet(title, query, 40)}"`;
    if (!tags.length && item.alt) return `a photo of "${snippet(item.alt, query, 40)}"`;
    return base;
  }
  const quote = `"${snippet(find.text || '', query, 44)}"`;
  switch (item.type) {
    case 'sticky_note':
      return `a sticky note that says ${quote}`;
    case 'text':
      return `a note that reads ${quote}`;
    case 'shape':
      return `a label that says ${quote}`;
    default:
      return find.field === 'description' ? `a card that mentions ${quote}` : `a card titled ${quote}`;
  }
}

/** Short label for the results list. */
function listLabel(find, query) {
  const { item } = find;
  if (item.type !== 'image') return snippet(find.text || '', query);
  const tags = index.get(item.id)?.tags || [];
  const title = meaningfulTitle(item.title);
  const desc = tags.length ? cap(describeTags(tags, { article: false })) : 'Trim photo';
  return title ? `${title} (${desc.toLowerCase()})` : desc;
}

/* ═════════════════════════ Thumbnails ═════════════════════════ */

const thumbs = new Map();
function thumbnail(item) {
  if (!thumbs.has(item.id)) {
    thumbs.set(item.id, item.getDataUrl('preview').catch(() => null));
  }
  return thumbs.get(item.id);
}

/* ═════════════════════════ Results list ═════════════════════════ */

let currentFinds = [];
let currentQuery = '';

function renderFinds(finds, total, query) {
  currentFinds = finds;
  currentQuery = query;
  findsList.replaceChildren();
  findsEl.hidden = !finds.length;
  if (!finds.length) return;
  findsTitle.textContent = total > finds.length ? `Top ${finds.length} of ${total} matches` : total === 1 ? '1 match' : `${total} matches`;

  finds.forEach((find, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'find frame';

    const slot = document.createElement('span');
    slot.className = 'find__slot';
    if (find.item.type === 'image') {
      const img = document.createElement('img');
      img.alt = '';
      thumbnail(find.item).then((url) => url && (img.src = url));
      slot.append(img);
    } else {
      slot.classList.add(`find__slot--${find.item.type}`);
    }

    const label = document.createElement('span');
    label.className = 'find__text';
    label.textContent = listLabel(find, query); // textContent only: board content is never parsed as HTML

    const kind = document.createElement('span');
    kind.className = 'find__kind';
    kind.textContent = cap(TYPE_NAMES[find.item.type] || 'item');

    const text = document.createElement('span');
    text.className = 'find__body';
    text.append(kind, label);

    button.append(slot, text);
    button.title = 'Go to it';
    button.addEventListener('click', () => travelFromList(i));
    const li = document.createElement('li');
    li.append(button);
    findsList.append(li);
  });
}

function markActive(index) {
  findsList.querySelectorAll('.find').forEach((button, i) => {
    button.classList.toggle('is-active', i === index);
    button.toggleAttribute('aria-current', i === index);
  });
}

/* ═════════════════════════ Conversations ═════════════════════════ */

let flowId = 0;
let busy = false;
let queuedArrivals = [];

function startFlow() {
  pendingChoice?.cancel();
  busy = true;
  return ++flowId;
}

function endFlow(id) {
  if (id !== flowId) return;
  busy = false;
  if (queuedArrivals.length) setTimeout(flushArrivals, 1800);
  else showHint();
}

function canInterrupt() {
  const typing = document.activeElement === input && input.value.trim();
  return !busy && !typing;
}

let greeted = false;
/** Small talk about Pip's own work (cataloguing), only when nobody is mid-conversation. */
function ambient(text) {
  if (greeted && canInterrupt() && askForm.hidden && choicesEl.hidden) say(text).then(showHint);
}

function onPipClick() {
  body.hop();
  if (!askForm.hidden && !busy) {
    say(line('poke'));
    input.focus({ preventScroll: true });
    return;
  }
  const flow = startFlow();
  body.mood('neutral');
  showAsk();
  if (!PREVIEW && visionUsable()) vision.warm(['text']).catch(() => {}); // get ready while they type
  say(line('prompt')).then(() => endFlow(flow));
}

function promptFor(query) {
  return /\b(trim|ribbon|lace|braid|cord|fringe|tape|binding|piping|elastic|tassel)/i.test(query) ? query : `${query} trim`;
}

/** The query as a vector, if the text model is ready within `waitMs`. Keeps loading in the background otherwise. */
async function queryVector(query, waitMs) {
  if (!visionUsable()) return null;
  const job = vision.embedText(promptFor(query)).catch(() => null);
  if (vision.state.textReady) return job;
  return Promise.race([job, sleep(waitMs).then(() => null)]);
}

async function runSearch(raw) {
  const query = raw.trim();
  const flow = startFlow();
  if (PREVIEW && query) {
    hideAsk();
    popEmote('?');
    await say(line('preview', { query }));
    showAsk();
    return endFlow(flow);
  }
  if (!query) {
    await say(line('emptyQuery'));
    showAsk();
    return endFlow(flow);
  }

  hideAsk();
  body.mood('neutral');
  popEmote('?');
  scene.classList.add('is-searching'); // quick fidgety breathing while he looks
  catalog.paused = true;
  say(line('searching', { query }));

  let items;
  let queryVec;
  try {
    [items, queryVec] = await Promise.all([
      miro.board.get({ type: CONFIG.searchTypes }),
      queryVector(query, 1500),
      sleep(reduceMotion ? 0 : 700),
    ]);
  } catch (err) {
    console.error('[Pip] Search failed:', err);
    finishSearching();
    if (flow === flowId) await say(line('boardError'));
    return endFlow(flow);
  }
  if (flow !== flowId) return finishSearching();

  let ranked = rankItems(items, query, queryVec, queryVec && (await baselineVector()));

  // Nothing by name? If Pip's eyes are still loading, wait for them and look again.
  if (!ranked.length && !queryVec && visionUsable() && index.size) {
    await say(line('glasses'));
    queryVec = await queryVector(query, 120000);
    if (flow !== flowId) return finishSearching();
    ranked = rankItems(items, query, queryVec, queryVec && (await baselineVector()));
  }
  finishSearching();

  const finds = ranked.slice(0, CONFIG.maxFinds);
  renderFinds(finds, ranked.length, query);

  if (!finds.length) {
    const left = catalog.queue.length + (catalog.running ? 1 : 0);
    await say(left ? line('noneYet', { query, left }) : line('none', { query }));
    showAsk();
    return endFlow(flow);
  }

  await offer(finds, ranked.length, flow);
  endFlow(flow);
}

function finishSearching() {
  scene.classList.remove('is-searching');
  catalog.paused = false;
}

async function offer(finds, total, flow) {
  let i = 0;
  let wrapped = false;
  // "Sure" = the words or tags matched; otherwise Pip is going by how the photos look.
  const sure = finds[0].keyword && finds[0].coverage === 1;
  body.mood('happy');
  popEmote('!');
  body.hop();

  while (flow === flowId) {
    const find = finds[i];
    markActive(i);
    const thing = describe(find, currentQuery);
    let intro;
    if (i > 0) intro = line('next', { thing });
    else if (wrapped) intro = line('wrap', { thing });
    else if (sure) intro = line(total === 1 ? 'foundOne' : 'foundMany', { thing, count: total });
    else intro = line(total === 1 ? 'guessOne' : 'guessMany', { thing, count: total });

    const finished = await say(`${intro} ${line('askCloser')}`, { reveal: find.item });
    if (!finished || flow !== flowId) return;

    const options = [{ label: 'Yes, take me there', value: 'go' }];
    if (finds.length > 1) {
      options.push({ label: i < finds.length - 1 ? 'Show me the next one' : 'Back to the first one', value: 'next' });
    }
    options.push({ label: 'No thanks', value: 'no' });

    const choice = await ask(options, { escapeValue: 'no' });
    if (choice === null || flow !== flowId) return;
    if (choice === 'go') return travelTo(find, flow);
    if (choice === 'next') {
      i = (i + 1) % finds.length;
      wrapped ||= i === 0;
      continue;
    }
    body.mood('neutral');
    await say(line('declined'));
    return;
  }
}

async function travelFromList(i) {
  const flow = startFlow();
  hideAsk();
  markActive(i);
  await travelTo(currentFinds[i], flow);
  endFlow(flow);
}

async function travelTo(find, flow) {
  body.hop();
  say(line('going'), { reveal: find.item });
  try {
    await miro.board.viewport.zoomTo(find.item);
  } catch (err) {
    console.warn('[Pip] zoomTo failed:', err);
    body.mood('neutral');
    if (flow === flowId) await say(line('missing'));
    return;
  }
  try {
    await miro.board.deselect();
    await miro.board.select({ id: find.item.id });
  } catch (err) {
    console.warn('[Pip] select failed:', err);
  }
  if (flow !== flowId) return;
  body.mood('happy');
  body.nod(2);
  await sleep(reduceMotion ? 0 : 350);
  await say(line('arrived', { kind: TYPE_NAMES[find.item.type] || 'item' }), { reveal: find.item });
}

/* ═════════════════════════ Greetings ═════════════════════════ */

let me = { id: null, name: '' };
let knownUserIds = null;

async function whoAmI() {
  try {
    const info = await miro.board.getUserInfo();
    if (info?.name) return { id: info.id, name: firstName(info.name) };
    const online = await miro.board.getOnlineUsers();
    const self = online.find((u) => u.id === info?.id);
    return { id: info?.id ?? null, name: firstName(self?.name) };
  } catch {
    return { id: null, name: '' };
  }
}

function greetArrivals(names) {
  popEmote('!');
  body.mood('happy');
  body.nod(3);
  hideAsk();
  const key = names.length > 1 ? 'arrivalMany' : 'arrival';
  say(line(key, { name: names[0], names: joinNames(names) }), { arrivals: names }).then(showHint);
}

function flushArrivals() {
  if (!queuedArrivals.length) return;
  if (!canInterrupt()) return setTimeout(flushArrivals, 2000);
  greetArrivals(queuedArrivals.splice(0));
}

function onOnlineUsersUpdate({ users = [] }) {
  const ids = new Set(users.map((u) => u.id));
  if (!knownUserIds) {
    knownUserIds = ids;
    return;
  }
  const arrivals = users.filter((u) => !knownUserIds.has(u.id) && u.id !== me.id);
  knownUserIds = ids;
  if (!arrivals.length) return;
  const names = arrivals.map((u) => firstName(u.name) || 'friend');
  if (canInterrupt()) greetArrivals(names);
  else queuedArrivals.push(...names);
}

/* ═════════════════════════ Boot ═════════════════════════ */

async function boot() {
  setTimeOfDay();
  setInterval(setTimeOfDay, 5 * 60 * 1000);
  await loadArt();
  body.liveForever();

  pipButton.addEventListener('click', onPipClick);
  dialogEl.addEventListener('click', (event) => {
    if (!event.target.closest('button, input')) skipTyping = true;
  });
  askForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(input.value);
  });

  if (PREVIEW) {
    body.mood('happy');
    body.nod(3);
    say(line('greet')).then(() => {
      greeted = true;
      body.mood('neutral');
      hintEl.textContent = 'Preview mode: click Pip to try him out. Open him inside Miro to search a real board.';
      showHint();
    });
    return;
  }

  const [panelData, user, online] = await Promise.all([
    miro.board.ui.getPanelData().catch(() => undefined),
    whoAmI(),
    miro.board.getOnlineUsers().catch(() => []),
  ]);
  me = user;
  knownUserIds ??= new Set(online.map((u) => u.id));

  // Greeting: wave, then ask what they need. Clicking Pip opens the search box.
  body.mood('happy');
  body.nod(3);
  const greeting =
    panelData?.reason === 'icon' ? line('greetReturn') : me.name ? line('greetNamed', { name: me.name }) : line('greet');
  say(greeting).then(() => {
    greeted = true;
    body.mood('neutral');
    showHint();
  });

  miro.board.ui.on('online_users:update', onOnlineUsersUpdate);
  miro.board.ui.on('items:create', onItemsCreated);
  miro.board.ui.on('items:delete', onItemsDeleted);

  vision = createVision();
  scanBoard();
}

boot();
