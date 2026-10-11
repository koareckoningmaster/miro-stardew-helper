/**
 * Squeak, the trim finder: a pixel-art shopkeeper for Miro boards full of fashion trims.
 * He stands behind the counter of a Gothic fabric atelier in the side panel.
 *
 *   Greets  people as they arrive (online_users:update) and asks what they need.
 *   Listens when clicked: a search box opens inside his dialogue box.
 *   Looks   at every trim photo with in-browser image recognition, auto-tags it
 *           ("ivory", "scalloped", "lace") and saves the tags on the image as app metadata.
 *   Finds   matches by keyword, tag or plain description, "holds up" the best one,
 *           asks if you'd like a closer look, then flies the viewport there with zoomTo().
 */
// BUILD is stamped into every file name Squeak loads, so browsers can't keep serving an old copy
// after you publish an update. It's also shown at the bottom of the panel.
export const BUILD = '2026.10.10-a';
import { LINES } from './lines.js?v=2026.10.10-a';
import { TAGGER_VERSION, VISION_MODEL, describeTags, tagSearchText } from './trims.js?v=2026.10.10-a';

/* ═════════════════════════ Config ═════════════════════════ */

const CONFIG = {
  searchTypes: ['image', 'sticky_note', 'text', 'card', 'app_card', 'shape'],
  maxFinds: 8,
  // Storage names keep their original 'pip' prefix on purpose: renaming them would make Squeak
  // forget catalogues, taught labels and home-board settings saved before the rename.
  metaKey: 'pipTrim', // where tags + the image fingerprint are stored on each image
  writeAltText: false, // true = also fill empty image alt text with Squeak's tags (visible to everyone)
  syncEverySec: 60, // how often to check the board for photos teammates added or removed
  searchAt: 'shelves', // 'shelves' = walks back and searches the shelves; 'desk' = rummages under the counter
  shelfActions: 1, // how many complete actions he does at the shelves (at least) before walking back
  semantic: {
    // A photo counts as a visual match only if the description fits it better than the
    // plain baseline "a trim" does (minLift) and clears an absolute floor. Raise these if
    // Squeak suggests trims that don't fit; lower them if he misses ones that do.
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
// Squeak runs in preview mode: he greets and animates, but there's no board to search.
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
const squeakButton = $('squeakButton');
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
const homeSwitch = $('homeSwitch');
const homeToggle = $('homeToggle');

/* ═════════════════════════ The atelier & Squeak's animation ═════════════════════════
   The scene is a 96×96 pixel canvas, scaled 3× by CSS with hard edges. Every frame is three
   layers: the Gothic atelier (one version per time of day, for the city view in the windows),
   Squeak's portrait (one of 12 frames: eyes × mouth), then the counter in front of him. */

const ART = {
  'back-morning': `assets/atelier-morning.png?v=${BUILD}`,
  'back-day': `assets/atelier-day.png?v=${BUILD}`,
  'back-evening': `assets/atelier-evening.png?v=${BUILD}`,
  'back-night': `assets/atelier-night.png?v=${BUILD}`,
  front: `assets/counter.png?v=${BUILD}`,
  portrait: `assets/squeak-portrait.png?v=${BUILD}`, // 12 frames, 64×64 each: [open, closed, happy eyes] × [closed, o, open, grin mouth]
  walk: `assets/squeak-walk.png?v=${BUILD}`, // full-body frames for walking to the shelves and searching them
};

/* Squeak's full-body frames (assets/squeak-walk.png), converted from the reference sprite sheets
   at his portrait's pixel size and palette.
   - away_8 / toward_8: head-and-shoulders close-ups (turning away / arriving back).
   - away_s0–9 / toward_s0–9: a real walk cycle, one frame per step, shrinking with distance. The
     four beats repeat: stride, passing (body bobs up), the other leg's stride, passing.
   - shuffle_0–3: the same cycle at shelf distance, for stepping along the shelf.
   - the rest: search poses at the shelves.
   x/w/h: where each frame sits in the sheet. headX/feetX: anchor columns. handX/handY: his hand. */
const WALK_FRAMES = {
  away_s0: { x: 0, w: 31, h: 86, headX: 15.5, feetX: 15.6 },
  away_s1: { x: 32, w: 29, h: 77, headX: 13.9, feetX: 16.1 },
  away_s2: { x: 62, w: 26, h: 71, headX: 12.1, feetX: 11.9 },
  away_s3: { x: 89, w: 24, h: 63, headX: 11.4, feetX: 13.2 },
  away_s4: { x: 114, w: 22, h: 58, headX: 10.9, feetX: 11.0 },
  away_s5: { x: 137, w: 20, h: 52, headX: 9.5, feetX: 11.2 },
  away_s6: { x: 158, w: 18, h: 48, headX: 8.4, feetX: 7.8 },
  away_s7: { x: 177, w: 17, h: 44, headX: 7.9, feetX: 9.1 },
  away_s8: { x: 195, w: 15, h: 40, headX: 7.2, feetX: 7.6 },
  away_s9: { x: 211, w: 14, h: 37, headX: 6.5, feetX: 7.4 },
  toward_s0: { x: 226, w: 14, h: 38, headX: 7.0, feetX: 8.2 },
  toward_s1: { x: 241, w: 15, h: 42, headX: 7.4, feetX: 8.5 },
  toward_s2: { x: 257, w: 17, h: 45, headX: 7.4, feetX: 6.0 },
  toward_s3: { x: 275, w: 18, h: 50, headX: 8.9, feetX: 10.3 },
  toward_s4: { x: 294, w: 20, h: 54, headX: 10.4, feetX: 12.3 },
  toward_s5: { x: 315, w: 22, h: 60, headX: 11.1, feetX: 12.8 },
  toward_s6: { x: 338, w: 24, h: 65, headX: 10.5, feetX: 8.3 },
  toward_s7: { x: 363, w: 26, h: 74, headX: 13.2, feetX: 15.2 },
  toward_s8: { x: 390, w: 29, h: 80, headX: 15.4, feetX: 17.7 },
  toward_s9: { x: 420, w: 31, h: 89, headX: 15.8, feetX: 18.3 },
  shuffle_0: { x: 452, w: 14, h: 36, headX: 6.9, feetX: 6.9 },
  shuffle_1: { x: 467, w: 14, h: 36, headX: 6.5, feetX: 7.4 },
  shuffle_2: { x: 482, w: 14, h: 36, headX: 6.1, feetX: 6.1 },
  shuffle_3: { x: 497, w: 14, h: 36, headX: 6.5, feetX: 7.4 },
  away_8: { x: 512, w: 53, h: 104, headX: 24.8, feetX: 25.9 },
  toward_8: { x: 566, w: 51, h: 104, headX: 25.6, feetX: 24.7 },
  look_left: { x: 618, w: 15, h: 36, headX: 8.2, feetX: 7.1 },
  look_right: { x: 634, w: 15, h: 36, headX: 8.3, feetX: 7.1 },
  bend: { x: 650, w: 20, h: 27, headX: 12.9, feetX: 8.9, handX: 18, handY: 17 },
  think: { x: 671, w: 17, h: 36, headX: 7.7, feetX: 8.8 },
  look_up: { x: 689, w: 16, h: 36, headX: 5.5, feetX: 7.7 },
  reach_up: { x: 706, w: 17, h: 37, headX: 12.5, feetX: 8.5, handX: 13, handY: 1 },
  examine: { x: 724, w: 18, h: 35, headX: 9.6, feetX: 8.7, handX: 16, handY: 12 },
  toss: { x: 743, w: 21, h: 35, headX: 7.6, feetX: 8.1, handX: 18, handY: 10 },
  stand_back: { x: 765, w: 15, h: 36, headX: 6.8, feetX: 7.0 },
};
/** Things he does at the shelves. Each is a list of [frame, milliseconds, extra]. */
const SEARCH_ACTIONS = {
  reach: () => [['look_up', 360], ['reach_up', 640], ['examine', 620, 'hold'], ['toss', 380, 'toss']],
  bend: () => [[pick(['look_left', 'look_right']), 300], ['bend', 780], ['examine', 600, 'hold'], ['toss', 380, 'toss']],
  think: () => [['stand_back', 260], ['think', 950], [pick(['look_left', 'look_right']), 380]],
  glance: () => [['look_left', 440], ['look_right', 440], ['stand_back', 220]],
  browse: () => [['look_up', 560], ['stand_back', 320], ['reach_up', 520], ['stand_back', 200]],
  doubleTake: () => [['examine', 520, 'hold'], ['think', 600], ['toss', 380, 'toss'], ['look_right', 360]],
};

const SHELF_PATH = {
  counterX: 48, // he turns from the middle of the counter…
  shelfMin: 38, // …and searches somewhere along the center shelving
  shelfMax: 58,
  closeTop: 23, // head top for the close-ups, matching the portrait
  steps: 10, // walk-cycle frames each way
  headNear: 24, // head top on the first step (near the counter)…
  headFar: 30, // …and at the shelves (his head stays near eye level while his feet climb)
  floorY: 66, // the floor line at the base of the shelves
};

/** A full-body frame at a spot: anchored by the head (walking, close-ups) or by the feet on the floor. */
function placeFrame(frame, cx, { headTop = null, bob = 0 } = {}) {
  const f = WALK_FRAMES[frame];
  if (headTop !== null) return { frame, x: Math.round(cx - f.headX), y: headTop - bob };
  return { frame, x: Math.round(cx - f.feetX), y: SHELF_PATH.floorY - f.h - bob };
}
const SCENE_SIZE = 96;
const PORTRAIT = { x: 13, y: 18, size: 64 }; // head centered under the big arched window
const EYES = ['open', 'closed', 'happy'];
const MOUTHS = ['closed', 'o', 'open', 'grin'];

const shopCtx = shopCanvas.getContext('2d');
// 3 screen pixels per art pixel, times the display's pixel density (2 on retina), capped at 2.
const RES = Math.round(3 * Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
shopCanvas.width = shopCanvas.height = SCENE_SIZE * RES;
const images = {};
const pose = { eyes: 'open', mouth: 'closed', breath: 0, lift: 0, dx: 0, card: null, cardItemId: null, shake: 0, away: null, handItem: null, cardLift: 0 };
let paintQueued = false;

function loadArt() {
  return Promise.all(
    Object.entries(ART).map(
      ([key, src]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve((images[key] = img));
          img.onerror = () => {
            console.warn(`[Squeak] Missing art: ${src}`);
            resolve(null);
          };
          img.src = src;
        })
    )
  ).then(paint);
}

/** Draws one frame: room, Squeak, (card behind counter), tossed trims, counter, (card in front), sparkles. */
function draw() {
  const ctx = shopCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, shopCanvas.width, shopCanvas.height);
  ctx.setTransform(RES, 0, 0, RES, 0, 0); // draw in art pixels; each one becomes a crisp RES×RES block
  ctx.imageSmoothingEnabled = false;
  const back = images[`back-${scene.dataset.time}`] || images['back-day'];
  if (back) ctx.drawImage(back, 0, 0);
  const px = PORTRAIT.x + pose.dx;
  const py = PORTRAIT.y + pose.breath + pose.lift;
  if (pose.away && images.walk) {
    drawAway(ctx);
  } else if (images.portrait) {
    placeEmote(null);
    const frame = EYES.indexOf(pose.eyes) * MOUTHS.length + MOUTHS.indexOf(pose.mouth);
    const { size } = PORTRAIT;
    ctx.drawImage(images.portrait, frame * size, 0, size, size, px, py, size, size);
  }
  // While the frame is below the counter it's behind it; once it's up, he holds it out in front.
  const holding = pose.card && !pose.away;
  const cardInFront = holding && pose.lift <= 4 && pose.cardLift <= 4;
  if (holding && !cardInFront) drawHeld(ctx, px, py);
  drawParticles(ctx, true);
  if (images.front) ctx.drawImage(images.front, 0, 0);
  if (cardInFront) drawHeld(ctx, px, py);
  drawParticles(ctx, false);
}

/** Repaints on the next animation frame (coalesces many pose changes into one draw). */
function paint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    draw();
  });
}

function setPose(changes) {
  Object.assign(pose, changes);
  paint();
}

/* ═════════════════════════ Props: what Squeak digs up, and the frame he holds up ═════════════════════════
   His arms, the frame and the tossed trims are pixel grids drawn at the same pixel scale as his
   portrait. The arms are traced from the reference art (fists gripping the frame's sides, sleeves
   wrapping the forearms) and use his portrait's own skin and shirt colors. The photo inside the frame is
   drawn at full screen resolution, so you see the real trim in high definition. */

const PROP_PALETTE = {
  O: '#3b2a20', w: '#c99a62', Y: '#e0b13a', y: '#b8862a', R: '#c4453a', Q: '#8e2c2a',
  B: '#4f7dc0', b: '#2d4f86', W: '#f6efe0', l: '#cdbf9f', P: '#e98aa8', p: '#c45d82',
  G: '#f6dd8c', g: '#d9b04f', D: '#ece6da',
};
// Squeak's own colors, sampled from his portrait, so the arms match his face and shirt exactly.
const ARM_PALETTE = {
  S: '#fab786', s: '#f99a65', t: '#e88152', u: '#cc6049', R: '#a03c35', r: '#6c1f2f', // skin + maroon outline
  L: '#4d4d57', N: '#35353d', n: '#2d2d34', m: '#26262c', j: '#20202a', k: '#19181a', // black shirt + outline
};
// Traced from the reference art: fist gripping the frame (fingers wrapping over its front), wrist,
// and the sleeve wrapping the forearm, scaled to Squeak's pixel size and snapped to his palette.
const ARM_L = [
  '.........rrrrrrrrr..',
  '........rRutsssstur.',
  '........rSSSSSSSSSur',
  '........rSsstuRRtsur',
  '........rssuRRRRRRr.',
  '.......rsSSSSSSSstr.',
  '.......rSSSSSSttstur',
  '.......rtssurrrrRtRr',
  '.......rRsSSSSSStRr.',
  '.......jRSSSSsssstr.',
  '......kjRsssuRRRutr.',
  '.....knnruSsssssRr..',
  '.....jNnjuSSSSsstr..',
  '....kjnNnRsSStRrrr..',
  '....knLNrruttrr.....',
  '...knLnruSRuttr.....',
  '..kjnjruSSSutur.....',
  '..jNjnRsSSsttRr.....',
  '.kLNNrSSSSstttr.....',
  '.jNnLrSSSsttttu.....',
  '.nNnLrSSsststtu.....',
  '.nNnLrusssstttr.....',
  '.jnjNnrtsssttRk.....',
  '.kNnnLnrtsttRrj.....',
  '.kjNnNLnruurkjj.....',
  '..knnnNNnjjjnjk.....',
  '..kjnnjnNnnnjjk.....',
  '...kjNnjjjnnjk......',
  '....kknnnnnjk.......',
  '......kjjjkk........',
];
const ARM_R = ARM_L.map((row) => [...row].reverse().join(''));
const TOSSABLES = [
  ['OOOOO', 'OwwwO', '.YYY.', '.YyY.', '.YYY.', 'OwwwO', 'OOOOO'], // spool of gold thread
  ['.RR....', 'R.QR..R', '....RR.'], // curl of ribbon
  ['.BB.', 'BbbB', 'BbbB', '.BB.'], // button
  ['WWWWWW', 'WlWWlW', '.W..W.'], // scrap of lace
  ['.P.', 'PpP', '.P.'], // pom-pom
  ['OOOOO', 'ORRRO', 'ORQRO', 'ORRRO', 'OOOOO'], // swatch
];
const SPARKLE = ['..G..', '.GgG.', 'GgGgG', '.GgG.', '..G..'];
const PUFF = ['.DD.', 'DDDD', '.DD.'];

function pixelSprite(rows, palette = PROP_PALETTE) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!palette[ch]) return;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x, y, 1, 1);
    })
  );
  return canvas;
}

// The frame: square (trim photos are 1:1), dark brown with rounded corners and a lighter inner edge.
const FRAME = { size: 36, border: 3, dx: 17, dy: 41 }; // dx/dy: offset from Squeak's portrait
function frameSprite() {
  const n = FRAME.size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const fill = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  fill('#1c0f0d', 1, 0, n - 2, n); // outline, with the corners knocked off
  fill('#1c0f0d', 0, 1, n, n - 2);
  fill('#3a2420', 1, 1, n - 2, n - 2); // frame body
  fill('#5a3c33', 2, 2, n - 4, n - 4); // lighter inner edge
  ctx.clearRect(FRAME.border, FRAME.border, n - FRAME.border * 2, n - FRAME.border * 2); // the window
  return canvas;
}

const sprites = {
  armL: pixelSprite(ARM_L, ARM_PALETTE),
  armR: pixelSprite(ARM_R, ARM_PALETTE),
  frame: frameSprite(),
  tossables: TOSSABLES.map((rows) => pixelSprite(rows)),
  sparkle: pixelSprite(SPARKLE),
  smallTrims: [
    ['.BB.', 'BbbB', '.BB.'], // button
    ['.P.', 'PpP', '.P.'], // pom-pom
    ['RRQ', 'QRR'], // ribbon snip
    ['YYY', 'yYy'], // little spool
    ['WlW', '.W.'], // lace scrap
  ].map((rows) => pixelSprite(rows)),
  puff: pixelSprite(PUFF),
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* High-definition photos: the original upload (HEIC converted if needed), cropped to a centered
   square and kept at 320×320, which is sharper than the frame shows even on retina screens. */
const HIDEF_SIZE = 320;
const hiDefCache = new Map();
const hiDefUrls = new Map();

function hiDefPhoto(item) {
  if (!hiDefCache.has(item.id)) {
    const job = (async () => {
      const full = await createImageBitmap(await readableImage(item));
      const side = Math.min(full.width, full.height);
      const square = await createImageBitmap(full, (full.width - side) / 2, (full.height - side) / 2, side, side, {
        resizeWidth: HIDEF_SIZE,
        resizeHeight: HIDEF_SIZE,
        resizeQuality: 'high',
      });
      full.close();
      return square;
    })().catch((err) => {
      console.info(`[Squeak] No high-definition copy for ${item.id}:`, err?.message || err);
      return null;
    });
    hiDefCache.set(item.id, job);
    if (hiDefCache.size > 16) hiDefCache.delete(hiDefCache.keys().next().value); // keep memory in check
  }
  return hiDefCache.get(item.id);
}

/** The same high-definition square as an image URL, for the photo in the dialogue box. */
function hiDefUrl(item) {
  if (!hiDefUrls.has(item.id)) {
    hiDefUrls.set(
      item.id,
      hiDefPhoto(item).then(
        (bitmap) =>
          bitmap &&
          new Promise((resolve) => {
            const c = document.createElement('canvas');
            c.width = c.height = bitmap.width;
            c.getContext('2d').drawImage(bitmap, 0, 0);
            c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.92);
          })
      )
    );
  }
  return hiDefUrls.get(item.id);
}

/** What Squeak is holding: shows Miro's quick preview first, then swaps in the high-definition photo. */
function makeHeld(item) {
  const held = { itemId: item?.id ?? null, type: item?.type, photo: null, hiDef: false };
  let markReady;
  held.ready = new Promise((resolve) => (markReady = resolve));
  if (item?.type === 'image') {
    thumbnail(item)
      .then((url) => url && loadImage(url))
      .then((img) => {
        if (img && !held.hiDef) {
          held.photo = img;
          paint();
        }
        markReady();
      });
    hiDefPhoto(item).then((bitmap) => {
      if (!bitmap) return;
      held.photo = bitmap;
      held.hiDef = true;
      paint();
      markReady();
    });
  } else {
    markReady();
  }
  return held;
}

/** Draws `img` into a square, cropping the middle if it isn't square. */
function drawCover(ctx, img, x, y, size) {
  const w = img.width;
  const h = img.height;
  const side = Math.min(w, h);
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, x, y, size, size);
}

/* ═════════════════════════ Animation loop ═════════════════════════ */

const particles = []; // things tossed up from behind the counter, and sparkles
let looping = false;

function toss(count = 1) {
  if (reduceMotion) return;
  for (let i = 0; i < count; i++) {
    particles.push({
      sprite: pick(sprites.tossables),
      x: 26 + Math.random() * 44,
      y: 80,
      vx: (Math.random() - 0.5) * 1.3,
      vy: -1.8 - Math.random() * 1.1,
      g: 0.11,
      behind: true, // falls back down behind the counter
    });
  }
  startLoop();
}

/** A trim he decided against, tossed from his hand onto the floor by the shelves. */
function tossFromHand() {
  if (reduceMotion || !pose.away) return;
  const a = pose.away;
  const f = WALK_FRAMES[a.frame];
  if (f.handX === undefined) return;
  particles.push({
    sprite: pick(sprites.smallTrims),
    x: a.x + f.handX,
    y: a.y + f.handY,
    vx: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35),
    vy: -0.9 - Math.random() * 0.5,
    g: 0.08,
    floor: SHELF_PATH.floorY + 1 + Math.round(Math.random() * 3),
    behind: true,
  });
  startLoop();
}

function sparkle(x, y) {
  if (reduceMotion) return;
  particles.push({ sprite: sprites.sparkle, x, y, vx: 0, vy: -0.15, g: 0, life: 28, behind: false });
  startLoop();
}

function puff() {
  if (reduceMotion) return;
  for (const dx of [-14, 0, 14]) {
    particles.push({ sprite: sprites.puff, x: 46 + dx, y: 78, vx: dx / 40, vy: -0.35, g: 0, life: 22, fade: true, behind: true });
  }
  startLoop();
}

function startLoop() {
  if (looping) return;
  looping = true;
  const step = () => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      if (p.floor && p.y >= p.floor) {
        // landed by the shelves: settle, then fade
        p.y = p.floor;
        p.vx = p.vy = p.g = 0;
        p.floor = 0;
        p.life = 40;
        p.fade = true;
      }
      if (p.life !== undefined) p.life--;
      if (p.y > 100 || p.life <= 0) particles.splice(i, 1);
    }
    draw();
    if (particles.length || body.digging) requestAnimationFrame(step);
    else looping = false;
  };
  requestAnimationFrame(step);
}

function drawParticles(ctx, behind) {
  for (const p of particles) {
    if (p.behind !== behind) continue;
    ctx.globalAlpha = p.fade ? Math.max(0, Math.min(1, p.life / 22)) : 1;
    ctx.drawImage(p.sprite, Math.round(p.x - p.sprite.width / 2), Math.round(p.y - p.sprite.height / 2));
  }
  ctx.globalAlpha = 1;
}

/** Keeps the "!" / "?" bubble beside his head wherever he is (scene pixels → % of the scene). */
let emoteSpot = '';
function placeEmote(x, y) {
  const spot = x === null ? '' : `${(x / SCENE_SIZE) * 100}%|${(Math.max(0, y - 9) / SCENE_SIZE) * 100}%`;
  if (spot === emoteSpot) return;
  emoteSpot = spot;
  const [left, top] = spot ? spot.split('|') : ['', ''];
  emoteEl.style.left = left; // empty = back to its spot beside the portrait (set in the CSS)
  emoteEl.style.top = top;
}

/** Squeak away from the counter: a full-body frame, a soft floor shadow, and whatever he's holding. */
function drawAway(ctx) {
  const a = pose.away;
  const f = WALK_FRAMES[a.frame];
  const foot = a.y + f.h - 1;
  if (!a.frame.endsWith('_8') && foot < 80) {
    const cx = Math.round(a.x + f.feetX);
    const half = Math.max(3, Math.round(f.w * 0.35));
    ctx.fillStyle = 'rgba(30, 20, 10, 0.28)';
    ctx.fillRect(cx - half + 1, foot, half * 2 - 2, 1);
    ctx.fillRect(cx - half, foot + 1, half * 2, 1);
  }
  ctx.drawImage(images.walk, f.x, 0, f.w, f.h, a.x, a.y, f.w, f.h);
  placeEmote(a.x + f.w - 2, a.y);
  if (pose.handItem && f.handX !== undefined) {
    const item = pose.handItem;
    ctx.drawImage(item, a.x + f.handX - (item.width >> 1), a.y + f.handY - item.height + 1);
  }
}

function drawHeld(ctx, px, py) {
  const held = pose.card;
  const fx = px + FRAME.dx + pose.shake;
  const fy = py + FRAME.dy + pose.cardLift;
  const win = FRAME.size - FRAME.border * 2;
  const wx = fx + FRAME.border;
  const wy = fy + FRAME.border;

  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(wx, wy, win, win);
  if (held.photo) {
    // The photo is drawn smoothly at full screen resolution; everything else stays crisp pixel art.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, held.photo, wx, wy, win);
    ctx.imageSmoothingEnabled = false;
  } else if (held.type === 'sticky_note') {
    ctx.fillStyle = '#f6d55c';
    ctx.fillRect(wx + 4, wy + 4, win - 8, win - 8);
    ctx.fillStyle = '#a8862a';
    for (let i = 0; i < 4; i++) ctx.fillRect(wx + 7, wy + 9 + i * 4, win - 14 - (i % 2) * 4, 1);
  } else {
    ctx.fillStyle = '#6b5f58';
    for (let i = 0; i < 5; i++) ctx.fillRect(wx + 4, wy + 6 + i * 4, win - 8 - (i % 2) * 6, 1);
  }
  ctx.drawImage(sprites.frame, fx, fy);
  // Fists wrap the frame's sides like the reference: column 16 of the left arm sits on the frame's edge.
  ctx.drawImage(sprites.armL, fx - 16, fy + 5);
  ctx.drawImage(sprites.armR, fx + FRAME.size - 4, fy + 5);
}

const body = {
  restMouth: 'closed',
  restEyes: 'open',
  talkTimer: null,
  moveTimers: [],
  motionId: 0, // every new move cancels the one before it
  atShelves: false,
  digging: false,
  digTimer: null,

  /** Idle life: breathing (a 1-pixel rise and fall behind the counter) and blinking. */
  liveForever() {
    if (reduceMotion) return;
    const breathe = () => {
      setPose({ breath: pose.breath ? 0 : 1 });
      setTimeout(breathe, 1300);
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
    this.motionId++;
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

  /** Steps through vertical offsets (bigger = lower behind the counter). Returns false if interrupted. */
  async glide(lifts, ms, id) {
    this.moveTimers.forEach(clearTimeout);
    for (const lift of lifts) {
      if (id !== this.motionId) return false;
      setPose({ lift });
      await sleep(ms);
    }
    return id === this.motionId;
  },

  /** Duck behind the counter and rummage, tossing trims over the edge, until dig(false). */
  async dig(on) {
    clearInterval(this.digTimer);
    if (!on) {
      this.digging = false;
      setPose({ dx: 0 });
      return;
    }
    if (reduceMotion) return;
    const id = ++this.motionId;
    this.digging = true;
    startLoop();
    if (pose.card) {
      if (!(await this.glide([10, 22, 34], 55, id))) return; // put the last card back first
      setPose({ card: null, cardItemId: null });
    }
    if (!(await this.glide([12, 26, 38, 44], 55, id))) return;
    puff();
    let tick = 0;
    this.digTimer = setInterval(() => {
      if (id !== this.motionId) return clearInterval(this.digTimer);
      tick++;
      setPose({ lift: 41 + Math.floor(Math.random() * 5), dx: pick([-1, 0, 0, 1]) });
      if (tick % 2 === 0) toss(Math.random() < 0.3 ? 2 : 1);
    }, 150);
  },

  /** One frame of the shelf trip. Returns false if a newer move took over. */
  async showFrame(id, away, ms, handItem = null) {
    if (id !== this.motionId) return false;
    setPose({ away, handItem });
    await sleep(ms);
    return id === this.motionId;
  },

  spotX: 48,

  /** Turn around, walk back to a spot on the shelves, and search them until called back. */
  async goToShelves() {
    if (reduceMotion || !images.walk) return this.dig(true);
    clearInterval(this.digTimer);
    this.digging = false;
    const id = ++this.motionId;
    this.atShelves = true;
    const { counterX, shelfMin, shelfMax, steps, headNear, headFar, closeTop } = SHELF_PATH;
    this.spotX = shelfMin + 4 + Math.random() * (shelfMax - shelfMin - 8);
    setPose({ card: null, cardItemId: null, lift: 0, dx: 0, cardLift: 0 });
    if (!(await this.showFrame(id, placeFrame('away_8', counterX, { headTop: closeTop }), 220))) return;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const cx = counterX + (this.spotX - counterX) * t;
      const headTop = Math.round(headNear + (headFar - headNear) * t);
      // passing beats (odd frames) lift the body a pixel: that bob is what makes it read as walking
      if (!(await this.showFrame(id, placeFrame(`away_s${i}`, cx, { headTop, bob: i % 2 }), 135))) return;
    }
    await this.searchShelves(id);
  },

  /** A random series of things to do at the shelves, stepping along to a new spot between them. */
  async searchShelves(id) {
    this.actionsDone = 0;
    while (id === this.motionId && this.atShelves) {
      const action = this.nextAction();
      this.inAction = true;
      for (const [frame, ms, extra] of SEARCH_ACTIONS[action]()) {
        if (id !== this.motionId || !this.atShelves) return void (this.inAction = false);
        setPose({ away: placeFrame(frame, this.spotX), handItem: extra === 'hold' ? pick(sprites.smallTrims) : null });
        if (extra === 'toss') tossFromHand();
        await sleep(ms * (0.85 + Math.random() * 0.3));
      }
      this.inAction = false;
      this.actionsDone++;
      if (id !== this.motionId || !this.atShelves) return;
      const { shelfMin, shelfMax } = SHELF_PATH;
      const dir = this.spotX < shelfMin + 5 ? 1 : this.spotX > shelfMax - 5 ? -1 : Math.random() < 0.5 ? -1 : 1;
      await this.stepAlong(id, Math.min(shelfMax, Math.max(shelfMin, this.spotX + dir * (4 + Math.random() * 6))));
    }
  },

  /** Actions come from a shuffled deck that carries over between searches, so every search plays
      out differently and never opens with the same move as the last one. */
  actionDeck: [],
  lastAction: null,
  nextAction() {
    if (!this.actionDeck.length) {
      const deck = Object.keys(SEARCH_ACTIONS).sort(() => Math.random() - 0.5);
      if (deck[deck.length - 1] === this.lastAction) deck.unshift(deck.pop());
      this.actionDeck = deck;
    }
    this.lastAction = this.actionDeck.pop();
    console.debug(`[Squeak] at the shelves: ${this.lastAction}`);
    return this.lastAction;
  },

  /** A few walking steps sideways along the shelf. */
  async stepAlong(id, toX) {
    const from = this.spotX;
    for (let i = 1; i <= 4; i++) {
      this.spotX = from + (toX - from) * (i / 4);
      if (!(await this.showFrame(id, placeFrame(`shuffle_${(i - 1) % 4}`, this.spotX, { bob: (i - 1) % 2 }), 135))) return false;
    }
    return true;
  },

  /** Walk back from the shelves; with an item, raise it over the counter in the frame. */
  async returnFromShelves(item) {
    // finish the current action, and do at least a couple, before walking back (up to ~5 s)
    const until = performance.now() + 5000;
    while (this.atShelves && (this.inAction || this.actionsDone < CONFIG.shelfActions) && performance.now() < until) await sleep(80);
    const id = ++this.motionId;
    this.atShelves = false;
    const held = item ? makeHeld(item) : null;
    const { counterX, steps, headNear, headFar, closeTop } = SHELF_PATH;
    if (item) {
      // the "aha" moment: hold it up to the light
      if (!(await this.showFrame(id, placeFrame('examine', this.spotX), 520, sprites.sparkle))) return;
    } else if (!(await this.showFrame(id, placeFrame('look_right', this.spotX), 320))) return;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const cx = this.spotX + (counterX - this.spotX) * t;
      const headTop = Math.round(headFar + (headNear - headFar) * t);
      if (!(await this.showFrame(id, placeFrame(`toward_s${i}`, cx, { headTop, bob: i % 2 }), 135))) return;
    }
    if (!(await this.showFrame(id, placeFrame('toward_8', counterX, { headTop: closeTop }), 200))) return;
    if (!item) {
      setPose({ away: null, handItem: null, lift: 0 });
      return;
    }
    await Promise.race([held.ready, sleep(1200)]);
    if (id !== this.motionId) return;
    setPose({ away: null, handItem: null, lift: 0, card: held, cardItemId: item.id, cardLift: 34 });
    for (const cardLift of [24, 14, 6, 1, -1, 0]) {
      if (id !== this.motionId) return;
      setPose({ cardLift });
      await sleep(55);
    }
    sparkle(PORTRAIT.x + FRAME.dx + FRAME.size - 2, PORTRAIT.y + FRAME.dy + 1);
    for (const shake of [1, -1, 1, 0]) {
      if (id !== this.motionId) return;
      setPose({ shake });
      await sleep(70);
    }
  },

  comeBack(item = null) {
    if (pose.away) return this.returnFromShelves(item);
    return item ? this.presentItem(item) : this.riseEmpty();
  },

  /** Skip straight back to the counter (e.g. clicked mid-search). */
  comeBackNow() {
    this.motionId++;
    this.atShelves = false;
    setPose({ away: null, handItem: null, lift: 0, cardLift: 0 });
  },

  /** Reach under the counter (if not already down there) and come up holding a card of `item`. */
  async presentItem(item) {
    if (pose.away) this.comeBackNow();
    const held = makeHeld(item);
    clearInterval(this.digTimer);
    this.digging = false;
    const id = ++this.motionId;
    if (reduceMotion) {
      await Promise.race([held.ready, sleep(1200)]);
      setPose({ card: held, cardItemId: item?.id ?? null, lift: 0, dx: 0 });
      return;
    }
    if (pose.lift < 30) {
      if (!(await this.glide(pose.card ? [10, 22, 34, 42] : [12, 26, 38, 44], 55, id))) return;
      setPose({ card: null, cardItemId: null, dx: 0 });
      toss(1);
      await sleep(280);
    }
    await Promise.race([held.ready, sleep(1200)]); // have at least the quick preview in hand
    if (id !== this.motionId) return;
    setPose({ card: held, cardItemId: item?.id ?? null, dx: 0 });
    if (!(await this.glide([34, 22, 10, 2, -2, 0], 55, id))) return;
    sparkle(PORTRAIT.x + FRAME.dx + FRAME.size - 2, PORTRAIT.y + FRAME.dy + 1);
    for (const shake of [1, -1, 1, 0]) {
      if (id !== this.motionId) return;
      setPose({ shake });
      await sleep(70);
    }
  },

  /** Pop back up empty-handed (nothing found, or something went wrong). */
  async riseEmpty() {
    clearInterval(this.digTimer);
    this.digging = false;
    const id = ++this.motionId;
    setPose({ card: null, cardItemId: null, dx: 0 });
    if (pose.lift > 0) await this.glide([30, 16, 6, 0], 55, id);
  },

  /** Tuck the card back under the counter. */
  async putAway() {
    if (!pose.card) return;
    const id = ++this.motionId;
    if (reduceMotion) return setPose({ card: null, cardItemId: null });
    if (!(await this.glide([8, 18, 28], 55, id))) return;
    setPose({ card: null, cardItemId: null });
    await this.glide([18, 8, 2, 0], 55, id);
  },

  putAwayLater(ms) {
    const id = this.motionId;
    setTimeout(() => id === this.motionId && this.putAway(), ms);
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

/** The trim Squeak "holds up" in the dialogue box, like an RPG item reveal. */
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
  let sharp = false;
  thumbnail(item).then((url) => {
    if (url && !sharp && revealEl.dataset.id === wanted) revealImg.src = url;
  });
  hiDefUrl(item).then((url) => {
    if (!url || revealEl.dataset.id !== wanted) return;
    sharp = true;
    revealImg.src = url;
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

/* ═════════════════════════ Squeak's eyes (vision worker) ═════════════════════════ */

function createVision() {
  const state = { textReady: false, visionReady: false, failed: false, loading: false, percent: 0 };
  let worker;
  try {
    worker = new Worker(new URL(`./vision-worker.js?v=${BUILD}`, import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('[Squeak] Image recognition unavailable:', err);
    return { state: { ...state, failed: true } };
  }

  const pending = new Map();
  let seq = 0;

  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      state.percent = data.percent;
      state.loading = true;
      state.loadStart ??= performance.now();
      // Reloading from the browser's cache takes a moment; only show the sign for a real download.
      const slow = performance.now() - state.loadStart > 1500;
      if (slow && (!catalog.running || !state.visionReady)) setSign(`Loading image recognition: ${data.percent}%`, data.percent / 100);
      return;
    }
    if (data.type === 'ready') {
      state[`${data.part}Ready`] = true;
      state.loading = false;
      state.loadStart = null;
      if (!catalog.running && signText.textContent.startsWith('Loading')) hideSign(600);
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    data.ok ? job.resolve(data) : job.reject(new Error(data.error));
  };

  worker.onerror = (event) => {
    console.warn('[Squeak] Image recognition failed to start:', event.message || event);
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
      call('analyzeImage', { blob }).then((r) => ({ embedding: Float32Array.from(r.embedding), tags: r.tags, tv: TAGGER_VERSION })),
    retag: (blob, embedding) => call('retag', { blob, embedding: Array.from(embedding) }).then((r) => r.tags),
  };
}

let vision = { state: { failed: true } };
const visionUsable = () => !vision.state.failed && typeof vision.embedText === 'function';

/* ═════════════════════════ Catalog: auto-tagging every trim photo ═════════════════════════
   Each image is looked at once per board. Its tags and a compact fingerprint (a 512-number
   vector squeezed into ~700 characters) are saved in the image's app metadata, so everyone
   who opens Squeak afterwards gets instant, recognition-powered search. */

const index = new Map(); // image id -> { tags: string[], embedding: Float32Array }
const catalog = { queue: [], running: false, paused: false, done: 0, total: 0, failed: 0, skipped: 0, analyzed: 0, relabel: [], relabelling: false, relabelled: 0 };

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
  if (!meta || meta.v !== 1 || meta.model !== VISION_MODEL.tag) return null;
  try {
    return {
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      embedding: typeof meta.e === 'string' ? unpackEmbedding(meta.e, meta.s) : null,
      tv: meta.tv || 1,
      label: typeof meta.label === 'string' ? meta.label : '',
    };
  } catch {
    return null;
  }
}

function writeMeta(entry) {
  return {
    v: 1,
    model: VISION_MODEL.tag,
    tags: entry.tags,
    tv: entry.tv || 1,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.embedding ? packEmbedding(entry.embedding) : {}),
  };
}

/* ═════════════════════════ Saving the catalogue ═════════════════════════
   Squeak saves what he learns in three places, so reloading never means cataloguing again:
   1. The board's own storage (a Miro "storage collection"), shared by everyone on the board.
      The whole catalogue loads in a few calls instead of one call per photo.
   2. Each photo's app metadata, which travels with the photo if the board is duplicated.
   3. This browser (IndexedDB): instant, and it still works for people who can't edit the board. */

const STORE = { collection: 'pip-catalog', chunks: 32, flushMs: 2000 };
let boardId = 'unknown';
const savedCatalog = new Map(); // photo id -> { t: tags, e: fingerprint, s: scale }
const save = { dirty: new Set(), removed: new Set(), timer: null, storageFailures: 0, storageOk: true, metaFailures: 0, metaOk: true, lastError: '' };

const packEntry = (entry) => ({
  t: entry.tags,
  g: entry.tv || 1,
  ...(entry.label ? { u: entry.label } : {}),
  ...(entry.embedding ? packEmbedding(entry.embedding) : {}),
});
function unpackEntry(packed) {
  try {
    return {
      tags: Array.isArray(packed.t) ? packed.t : [],
      embedding: typeof packed.e === 'string' ? unpackEmbedding(packed.e, packed.s) : null,
      tv: packed.g || 1,
      label: typeof packed.u === 'string' ? packed.u : '',
    };
  } catch {
    return null;
  }
}

/** Which storage key a photo lives under (spreads ~2,000 photos across 32 keys of up to 64 KB each). */
function chunkOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % STORE.chunks;
}

const boardStorage = () => (miro.board.storage?.collection ? miro.board.storage.collection(STORE.collection) : null);

const localStore = {
  db: null,
  open() {
    this.db ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open('pip-trim-finder', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('catalog');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  },
  async read() {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      const req = db.transaction('catalog').objectStore('catalog').get(boardId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },
  async write(value) {
    const db = await this.open();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction('catalog', 'readwrite');
      tx.objectStore('catalog').put(value, boardId);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  },
};

/** Everything saved so far, from this browser and the board's storage, in one quick batch. */
async function loadSavedCatalog() {
  const coll = boardStorage();
  const [local, chunks] = await Promise.all([
    localStore.read().catch(() => null),
    coll ? Promise.all(Array.from({ length: STORE.chunks }, (_, i) => coll.get(`chunk-${i}`).catch(() => undefined))) : [],
  ]);
  for (const source of [local, ...chunks]) {
    if (source?.m !== VISION_MODEL.tag || !source.items) continue;
    for (const [id, packed] of Object.entries(source.items)) savedCatalog.set(id, packed);
  }
  return savedCatalog;
}

/** Remember a catalogued photo everywhere (board storage and this browser in batches, the photo right away). */
function persist(image, entry, { onPhoto = true } = {}) {
  savedCatalog.set(image.id, packEntry(entry));
  save.dirty.add(chunkOf(image.id));
  clearTimeout(save.timer);
  save.timer = setTimeout(flushSaves, STORE.flushMs);
  if (onPhoto) saveOnPhoto(image, entry);
}

async function flushSaves() {
  clearTimeout(save.timer);
  save.timer = null;
  const tag = VISION_MODEL.tag;
  localStore.write({ m: tag, items: Object.fromEntries(savedCatalog) }).catch(() => {});

  const coll = boardStorage();
  const dirty = [...save.dirty];
  save.dirty.clear();
  if (!coll || !save.storageOk) return;
  const removedNow = new Set(save.removed);
  for (const i of dirty) {
    const key = `chunk-${i}`;
    try {
      // Merge with whatever teammates saved in the meantime, then write it back.
      const current = await coll.get(key);
      const items = current?.m === tag && current.items ? current.items : {};
      for (const [id, packed] of savedCatalog) if (chunkOf(id) === i) items[id] = packed;
      for (const id of save.removed) if (chunkOf(id) === i) delete items[id]; // photos deleted from the board
      await coll.set(key, { m: tag, items });
      save.storageFailures = 0;
      for (const id of removedNow) if (chunkOf(id) === i) save.removed.delete(id);
    } catch (err) {
      save.lastError = err?.message || String(err);
      console.warn('[Squeak] Could not save to the board storage:', save.lastError);
      if (++save.storageFailures >= 3) save.storageOk = false; // stop retrying this session
    }
  }
}

/** Tags on the photo itself, retried a couple of times, so one hiccup doesn't stop all saving. */
async function saveOnPhoto(image, entry) {
  if (!save.metaOk) return;
  for (const wait of [0, 1500, 4000]) {
    if (wait) await sleep(wait);
    try {
      await image.setMetadata(CONFIG.metaKey, writeMeta(entry));
      save.metaFailures = 0;
      return;
    } catch (err) {
      save.lastError = err?.message || String(err);
    }
  }
  console.info(`[Squeak] Could not save tags on photo ${image.id}:`, save.lastError);
  if (++save.metaFailures >= 3) save.metaOk = false; // e.g. view-only access
}

function renderCatalogSign() {
  if (catalog.running && vision.state.visionReady) {
    setSign(`Cataloguing trims: ${catalog.done} of ${catalog.total}`, catalog.total ? catalog.done / catalog.total : 0);
  } else if (!catalog.running && catalog.total && !catalog.queue.length) {
    const notes = [];
    if (catalog.failed) notes.push(`${catalog.failed} couldn't be read`);
    if (catalog.skipped) notes.push(`${catalog.skipped} underneath other photos skipped`);
    if (catalog.analyzed && save.storageFailures && save.lastError) notes.push('saved on this computer only');
    const verb = catalog.analyzed ? 'catalogued' : 'ready';
    setSign(`${index.size} trims ${verb}${notes.length ? ` (${notes.join(', ')})` : ''}`);
    hideSign(notes.length ? 9000 : 2500);
  }
}

async function scanBoard() {
  let images;
  let frames;
  try {
    [images, frames] = await Promise.all([
      miro.board.get({ type: 'image' }),
      miro.board.get({ type: 'frame' }).catch(() => []),
    ]);
  } catch (err) {
    console.warn('[Squeak] Could not list images:', err);
    return;
  }
  rememberFrames(frames);
  for (const image of images) known.add(image.id);
  const top = await topLayerIds(images, frames);
  const onTop = images.filter((image) => top.has(image.id));
  catalog.skipped = images.length - onTop.length;
  catalog.total = onTop.length;
  catalog.done = 0;
  catalog.failed = 0;
  catalog.queue = [];

  const saved = await loadSavedCatalog();
  const unknown = [];
  catalog.relabel = [];
  for (const image of onTop) {
    const entry = saved.has(image.id) ? unpackEntry(saved.get(image.id)) : null;
    if (entry?.embedding) {
      index.set(image.id, entry);
      catalog.done++;
      if (entry.tv !== TAGGER_VERSION) catalog.relabel.push(image); // labelled by an older version
    } else {
      unknown.push(image);
    }
  }
  // Photos the saved catalogue doesn't know (e.g. on a duplicated board) may carry tags themselves.
  await mapLimit(unknown, 6, async (image) => {
    const entry = readMeta(await image.getMetadata(CONFIG.metaKey).catch(() => undefined));
    if (entry?.embedding) {
      index.set(image.id, entry);
      catalog.done++;
      if (entry.tv !== TAGGER_VERSION) catalog.relabel.push(image);
      persist(image, entry, { onPhoto: false }); // add it to the saved catalogue for next time
    } else {
      catalog.queue.push(image);
    }
  });
  forgetMissing(new Set(images.map((image) => image.id)));
  console.info(`[Squeak] ${catalog.done} of ${catalog.total} trims already catalogued; ${catalog.queue.length} new.`);
  if (catalog.queue.length) runCatalog();
  else if (catalog.relabel.length) runRelabel();
  else renderCatalogSign();
}

/** Re-runs the labelling on photos catalogued by an older version: uses each photo's saved
    fingerprint and Miro's small preview (for colors), so it's quick and needs no re-scan. */
async function runRelabel() {
  if (catalog.relabelling || !catalog.relabel.length || !visionUsable()) return;
  catalog.relabelling = true;
  const total = catalog.relabel.length;
  let done = 0;
  setSign(`Updating trim labels: 0 of ${total}`, 0);
  while (catalog.relabel.length) {
    while (catalog.paused) await sleep(250);
    const image = catalog.relabel.shift();
    const entry = index.get(image.id);
    try {
      const preview = await image.getFile('preview').catch(() => readableImage(image));
      entry.tags = await vision.retag(preview, entry.embedding);
      entry.tv = TAGGER_VERSION;
      persist(image, entry);
      catalog.relabelled++;
    } catch (err) {
      console.warn(`[Squeak] Couldn't relabel image ${image.id}:`, err?.message || err);
    }
    done++;
    setSign(`Updating trim labels: ${done} of ${total}`, done / total);
  }
  catalog.relabelling = false;
  await flushSaves();
  setSign(`${catalog.relabelled} trim labels updated`);
  hideSign(4000);
}

/* ═════════════════════════ Reading photos (HEIC-safe) ═════════════════════════
   Miro keeps the original file that was uploaded. iPhone photos are often HEIC, which Chrome and
   Edge can't open, so Squeak converts those to JPEG first. If that fails too, he uses Miro's own
   preview copy (smaller, but always a normal JPEG/PNG), so every photo gets catalogued. */

const HEIC_CONVERTER = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4'; // MIT licensed; loaded only if a HEIC turns up
let heicConverter = null;

function loadHeicConverter() {
  heicConverter ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HEIC_CONVERTER;
    script.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('HEIC converter missing')));
    script.onerror = () => reject(new Error('Could not load the HEIC converter'));
    document.head.append(script);
  }).catch((err) => {
    heicConverter = null; // allow a retry later
    throw err;
  });
  return heicConverter;
}

async function browserCanRead(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/** A version of the photo the browser can decode: the original, a JPEG converted from HEIC, or Miro's preview. */
async function readableImage(image) {
  let original = null;
  try {
    original = await image.getFile('original');
  } catch {}
  if (original && (await browserCanRead(original))) return original;

  if (original) {
    try {
      const heic2any = await loadHeicConverter();
      const converted = await heic2any({ blob: original, toType: 'image/jpeg', quality: 0.92 });
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      if (jpeg && (await browserCanRead(jpeg))) return jpeg;
    } catch (err) {
      console.info(`[Squeak] Couldn't convert image ${image.id}, using Miro's preview instead:`, err?.message || err);
    }
  }
  return image.getFile('preview');
}

/* ═════════════════════════ Top layer only ═════════════════════════
   Squeak ignores any photo that has another photo sitting on top of it: backdrops behind frames,
   older photos stacked under newer ones, and so on. A small label or sticky note on a photo
   doesn't count, because only photos are checked, and only when at least half of the upper
   photo overlaps the one beneath. */

const COVER_SHARE = 0.5;
let frameTitles = new Map(); // frame id -> title, so a frame's name can be searched too

function rememberFrames(frames = []) {
  frameTitles = new Map(frames.map((f) => [f.id, plainText(f.title)]));
}

/** An item's box in board coordinates (items inside frames are stored relative to the frame's corner). */
function boardBox(item, byId, depth = 0) {
  if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;
  let cx = item.x;
  let cy = item.y;
  if (item.parentId && item.relativeTo === 'parent_top_left') {
    const parent = byId.get(item.parentId);
    const p = parent && depth < 6 ? boardBox(parent, byId, depth + 1) : null;
    if (!p) return null;
    cx = p.left + item.x;
    cy = p.top + item.y;
  }
  const w = item.width || 0;
  const h = item.height || 0;
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, area: w * h };
}

function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Ids of the photos that no other photo sits on top of. */
async function topLayerIds(images, frames = []) {
  const byId = new Map([...frames, ...images].map((item) => [item.id, item]));
  const boxes = new Map(images.map((image) => [image.id, boardBox(image, byId)]));

  // Candidate pairs: photo b lies at least half inside photo a.
  const pairs = [];
  for (const a of images) {
    const A = boxes.get(a.id);
    if (!A || !A.area) continue;
    for (const b of images) {
      const B = boxes.get(b.id);
      if (a === b || !B || !B.area) continue;
      if (overlapArea(A, B) >= COVER_SHARE * B.area) pairs.push([a, b]);
    }
  }
  if (!pairs.length) return new Set(images.map((image) => image.id));

  // Ask Miro which one is in front, only for photos that actually overlap.
  const layer = new Map();
  await mapLimit([...new Set(pairs.flat())], 6, async (item) => {
    try {
      layer.set(item.id, await item.getLayerIndex());
    } catch {}
  });

  const beneath = new Set();
  for (const [a, b] of pairs) {
    const la = layer.get(a.id);
    const lb = layer.get(b.id);
    // If Miro can't say, assume the smaller photo is the one placed on top.
    const bInFront = la !== undefined && lb !== undefined ? lb > la : boxes.get(b.id).area < boxes.get(a.id).area;
    if (bInFront) beneath.add(a.id);
  }
  if (beneath.size) console.info(`[Squeak] Skipping ${beneath.size} photo(s) that sit underneath other photos.`);
  return new Set(images.filter((image) => !beneath.has(image.id)).map((image) => image.id));
}

async function runCatalog() {
  if (catalog.running || !catalog.queue.length || !visionUsable()) return;
  catalog.running = true;
  const analyzedBefore = catalog.analyzed;
  try {
    await vision.warm(['vision']);
  } catch (err) {
    console.warn('[Squeak] Image recognition could not load:', err);
    vision.state.failed = true;
    catalog.running = false;
    setSign("Image recognition couldn't load, so Squeak is searching names, labels and frame titles only.");
    ambient(line('catalogFailed'));
    return;
  }

  renderCatalogSign();
  while (catalog.queue.length) {
    while (catalog.paused) await sleep(250);
    const image = catalog.queue.shift();
    try {
      const entry = await vision.analyzeImage(await readableImage(image));
      index.set(image.id, entry);
      catalog.analyzed++;
      persist(image, entry);
      if (CONFIG.writeAltText && save.metaOk && !image.alt) {
        image.alt = cap(describeTags(entry.tags, { article: false }));
        await image.sync().catch(() => {});
      }
    } catch (err) {
      catalog.failed++;
      console.warn(`[Squeak] Couldn't catalogue image ${image.id}:`, err);
    }
    catalog.done++;
    renderCatalogSign();
  }
  catalog.running = false;
  await flushSaves(); // save the last batch right away
  renderCatalogSign();
  if (catalog.relabel.length) setTimeout(runRelabel, 3000);
  const thisRun = catalog.analyzed - analyzedBefore;
  if (thisRun && thisRun <= 3) ambient(line('catalogSmall'));
  else if (index.size) ambient(line('catalogDone', { count: index.size }));
}

/* ═════════════════════════ Keeping up with the board ═════════════════════════
   Miro only tells an app about photos its own user adds or deletes. So Squeak also checks the
   board about once a minute and whenever someone searches, to pick up teammates' changes:
   new photos get catalogued, deleted ones are forgotten (in his saved catalogue too). */

const known = new Set(); // every photo id Squeak has seen on this board this session

/** Catalogue photos Squeak hasn't seen before. Copies and duplicates already carry their tags. */
async function addImages(images, { announce = false } = {}) {
  const fresh = images.filter((image) => image.type === 'image' && !known.has(image.id));
  if (!fresh.length) return 0;
  for (const image of fresh) known.add(image.id);
  let toLookAt = 0;
  await mapLimit(fresh, 4, async (image) => {
    const carried = readMeta(await image.getMetadata(CONFIG.metaKey).catch(() => undefined));
    if (carried?.embedding) {
      index.set(image.id, carried);
      persist(image, carried, { onPhoto: false });
      if (carried.tv !== TAGGER_VERSION) catalog.relabel.push(image);
    } else {
      catalog.queue.push(image);
      catalog.total++;
      toLookAt++;
    }
  });
  console.info(`[Squeak] ${fresh.length} new photo(s) on the board; ${toLookAt} to catalogue.`);
  if (announce && toLookAt) ambient(line('newTrims'));
  if (catalog.queue.length) runCatalog();
  else if (catalog.relabel.length) runRelabel();
  return fresh.length;
}

/** Forget specific photos everywhere: the live catalogue, the to-do list and the saved catalogue. */
function forgetIds(ids) {
  let removed = 0;
  for (const id of ids) {
    const wasKnown = index.delete(id) | known.delete(id);
    if (savedCatalog.delete(id)) {
      save.removed.add(id);
      save.dirty.add(chunkOf(id));
      removed++;
    } else if (wasKnown) {
      removed++;
    }
  }
  catalog.queue = catalog.queue.filter((image) => !ids.has(image.id));
  catalog.relabel = catalog.relabel.filter((image) => !ids.has(image.id));
  if (removed) {
    console.info(`[Squeak] Forgot ${removed} photo(s) that were removed from the board.`);
    clearTimeout(save.timer);
    save.timer = setTimeout(flushSaves, STORE.flushMs);
  }
  return removed;
}

/** Forget every photo Squeak knows about that is no longer on the board. */
function forgetMissing(boardIds) {
  const gone = new Set([...index.keys(), ...savedCatalog.keys(), ...known].filter((id) => !boardIds.has(id)));
  return gone.size ? forgetIds(gone) : 0;
}

/** Compare Squeak's catalogue with the board (pass the board's photos if you already have them). */
async function syncWithBoard(images) {
  if (!images) {
    try {
      images = await miro.board.get({ type: 'image' });
    } catch {
      return;
    }
  }
  forgetMissing(new Set(images.map((image) => image.id)));
  await addImages(images);
}

function onItemsCreated({ items = [] }) {
  addImages(items, { announce: true });
}

function onItemsDeleted({ items = [] }) {
  forgetIds(new Set(items.map((item) => item.id)));
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
  return stem.replace(/[^a-z]/gi, '').length >= 3 && !/^(img|dsc|dscn|pxl|image|photo|screenshot|untitled|scan)[\W_]*[a-z]?\d/i.test(stem)
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
      const entry = index.get(item.id);
      const tags = entry?.tags || [];
      return [
        { key: 'label', text: entry?.label || '', weight: 1.8 }, // what a person told Squeak it is
        { key: 'title', text: item.title || '', weight: 1.4 },
        { key: 'alt', text: item.alt || '', weight: 1.2 },
        { key: 'tags', text: tagSearchText(tags), weight: 1.3 },
        { key: 'frame', text: frameTitles.get(item.parentId) || '', weight: 0.8 },
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
function visualScores(queryVec, baseVec, allowed) {
  const scores = new Map();
  if (!queryVec || !index.size) return scores;
  const entries = [...index].filter(([id, entry]) => entry.embedding && (!allowed || allowed.has(id)));
  if (!entries.length) return scores;
  const rows = entries.map(([id, { embedding }]) => {
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
  const visual = visualScores(queryVec, baseVec, new Set(items.map((item) => item.id)));
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

/** How Squeak names a find out loud: "a white lace trim called "Bridal edge"". */
/** "gold O-ring" -> "a gold O-ring"; leaves "the…", "some…" and plurals alone. */
function withArticle(text) {
  const t = text.trim();
  if (/^(a|an|the|some)\s/i.test(t) || /s$/i.test(t.split(/\s+/).pop())) return t;
  return `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`;
}

function describe(find, query) {
  const { item } = find;
  if (item.type === 'image') {
    const entry = index.get(item.id);
    const tags = entry?.tags || [];
    const title = meaningfulTitle(item.title);
    const base = entry?.label ? withArticle(entry.label) : tags.length ? describeTags(tags) : 'a trim photo';
    const frame = frameTitles.get(item.parentId);
    const where = frame ? ` on the "${snippet(frame, query, 30)}" frame` : '';
    if (title) return `${base} called "${snippet(title, query, 40)}"${where}`;
    if (!tags.length && item.alt) return `a photo of "${snippet(item.alt, query, 40)}"${where}`;
    return `${base}${where}`;
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
  const entry = index.get(item.id);
  const tags = entry?.tags || [];
  const title = meaningfulTitle(item.title);
  const desc = entry?.label ? cap(entry.label) : tags.length ? cap(describeTags(tags, { article: false })) : 'Trim photo';
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
/** Small talk about Squeak's own work (cataloguing), only when nobody is mid-conversation. */
function ambient(text) {
  if (greeted && canInterrupt() && askForm.hidden && choicesEl.hidden) say(text).then(showHint);
}

/* ═════════════════════════ Fixing a label ═════════════════════════
   When Squeak gets a photo wrong, you tell him what it really is. He saves it with the photo (in the
   board's storage and on the photo itself), uses it for searching, and says it from then on. */

let labelling = null; // the find being relabelled, while the search box is asking "what is it?"
const SEARCH_PLACEHOLDER = input.placeholder;

function askForLabel(find) {
  labelling = find;
  input.value = '';
  input.placeholder = 'e.g. gold O-ring';
  askForm.querySelector('.ask__go').textContent = 'Save';
  showAsk();
  say(line('fixPrompt', { thing: describe(find, '') }), { reveal: find.item });
}

function stopLabelling() {
  labelling = null;
  input.placeholder = SEARCH_PLACEHOLDER;
  askForm.querySelector('.ask__go').textContent = 'Find';
}

async function saveLabel(raw) {
  const find = labelling;
  const label = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!find) return;
  if (!label) {
    await say(line('fixEmpty'));
    return showAsk();
  }
  stopLabelling();
  input.value = '';
  hideAsk();
  const entry = index.get(find.item.id) || { tags: [], embedding: null, tv: TAGGER_VERSION, label: '' };
  entry.label = label;
  index.set(find.item.id, entry);
  persist(find.item, entry);
  flushSaves();
  if (currentFinds.length) renderFinds(currentFinds, currentFinds.length, currentQuery);
  body.mood('happy');
  body.nod(2);
  await say(line('fixThanks', { label: withArticle(label) }), { reveal: find.item });
  body.putAwayLater(2500);
  showHint();
}

function onSqueakClick() {
  if (labelling) stopLabelling();
  if (pose.card) body.putAway();
  else if (pose.away) body.comeBackNow();
  else if (body.digging || pose.lift > 10) body.riseEmpty();
  else body.hop();
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
    if (CONFIG.searchAt === 'shelves' && !reduceMotion) {
      say(line('searching', { query }));
      body.goToShelves();
      await sleep(2500);
      if (flow !== flowId) return;
      await body.comeBack();
      if (flow !== flowId) return;
    }
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
  if (CONFIG.searchAt === 'shelves') body.goToShelves(); // turns, walks back and searches the shelves
  else body.dig(true); // ducks behind the counter and rummages, tossing trims over the edge
  catalog.paused = true;
  say(line('searching', { query }));

  let items;
  let frames;
  let queryVec;
  try {
    [items, frames, queryVec] = await Promise.all([
      miro.board.get({ type: CONFIG.searchTypes }),
      miro.board.get({ type: 'frame' }).catch(() => []),
      queryVector(query, 1500),
      sleep(reduceMotion ? 0 : 2000), // time to see him search, even on small boards
    ]);
    rememberFrames(frames);
    syncWithBoard(items.filter((item) => item.type === 'image')); // pick up teammates' changes
    // Only photos on the top layer count; everything else on the board is searched as usual.
    const top = await topLayerIds(items.filter((item) => item.type === 'image'), frames);
    items = items.filter((item) => item.type !== 'image' || top.has(item.id));
  } catch (err) {
    console.error('[Squeak] Search failed:', err);
    finishSearching();
    body.comeBack();
    if (flow === flowId) await say(line('boardError'));
    return endFlow(flow);
  }
  if (flow !== flowId) return finishSearching();

  let ranked = rankItems(items, query, queryVec, queryVec && (await baselineVector()));

  // Nothing by name? If Squeak's eyes are still loading, wait for them and look again.
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
    body.comeBack(); // comes back empty-handed
    popEmote('?');
    const left = catalog.queue.length + (catalog.running ? 1 : 0);
    await say(left ? line('noneYet', { query, left }) : line('none', { query }));
    showAsk();
    return endFlow(flow);
  }

  await offer(finds, ranked.length, flow);
  endFlow(flow);
}

function finishSearching() {
  body.dig(false); // stops rummaging; he stays down there until he comes up with something
  catalog.paused = false;
}

async function offer(finds, total, flow) {
  let i = 0;
  let wrapped = false;
  // How Squeak phrases it: every word matched, some words matched, or going by how the photos look.
  const confidence = !finds[0].keyword ? 'guess' : finds[0].coverage === 1 ? 'sure' : 'partial';
  await body.comeBack(finds[0].item); // walks back from the shelves (or up from the desk) holding it
  if (flow !== flowId) return;
  body.mood('happy');
  popEmote('!');

  while (flow === flowId) {
    const find = finds[i];
    markActive(i);
    if (i > 0 || wrapped) {
      await body.presentItem(find.item); // puts the last one back under the desk and pulls up this one
      if (flow !== flowId) return;
    }
    const thing = describe(find, currentQuery);
    let intro;
    if (i > 0) intro = line('next', { thing });
    else if (wrapped) intro = line('wrap', { thing });
    else if (confidence === 'sure') intro = line(total === 1 ? 'foundOne' : 'foundMany', { thing, count: total });
    else if (confidence === 'partial') intro = line(total === 1 ? 'partialOne' : 'partialMany', { thing, count: total });
    else intro = line(total === 1 ? 'guessOne' : 'guessMany', { thing, count: total });

    const finished = await say(`${intro} ${line('askCloser')}`, { reveal: find.item });
    if (!finished || flow !== flowId) return;

    const options = [{ label: 'Yes, take me there', value: 'go' }];
    if (finds.length > 1) {
      options.push({ label: i < finds.length - 1 ? 'Show me the next one' : 'Back to the first one', value: 'next' });
    }
    options.push({ label: 'No thanks', value: 'no' });
    if (find.item.type === 'image') options.push({ label: 'Fix this label', value: 'fix' });

    const choice = await ask(options, { escapeValue: 'no' });
    if (choice === null || flow !== flowId) return;
    if (choice === 'go') return travelTo(find, flow);
    if (choice === 'fix') return askForLabel(find);
    if (choice === 'next') {
      i = (i + 1) % finds.length;
      wrapped ||= i === 0;
      continue;
    }
    body.mood('neutral');
    body.putAway();
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
  if (pose.cardItemId !== find.item.id) await body.presentItem(find.item);
  if (flow !== flowId) return;
  say(line('going'), { reveal: find.item });
  try {
    await miro.board.viewport.zoomTo(find.item);
  } catch (err) {
    console.warn('[Squeak] zoomTo failed:', err);
    body.mood('neutral');
    body.putAway();
    if (flow === flowId) await say(line('missing'));
    return;
  }
  try {
    await miro.board.deselect();
    await miro.board.select({ id: find.item.id });
  } catch (err) {
    console.warn('[Squeak] select failed:', err);
  }
  if (flow !== flowId) return;
  body.mood('happy');
  body.nod(2);
  await sleep(reduceMotion ? 0 : 350);
  await say(line('arrived', { kind: TYPE_NAMES[find.item.type] || 'item' }), { reveal: find.item });
  body.putAwayLater(3500);
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

/* ═════════════════════════ Home board switch ═════════════════════════
   Each board stores its own setting (Miro "app data", visible only to this app). index.html reads it:
   Squeak pops up for everyone only on boards where it's on, and stays out of the way everywhere else. */

const HOME_KEY = 'pipHome';

async function setupHomeSwitch() {
  try {
    homeToggle.checked = (await miro.board.getAppData(HOME_KEY)) === true;
  } catch (err) {
    console.warn('[Squeak] Board settings unavailable:', err);
    return; // leave the switch hidden
  }
  homeSwitch.hidden = false;
  homeToggle.addEventListener('change', async () => {
    const on = homeToggle.checked;
    homeSwitch.classList.add('is-saving');
    try {
      await miro.board.setAppData(HOME_KEY, on);
      const flow = startFlow();
      hideAsk();
      body.mood(on ? 'happy' : 'neutral');
      if (on) body.nod(2);
      await say(line(on ? 'homeOn' : 'homeOff'));
      endFlow(flow);
    } catch (err) {
      homeToggle.checked = !on;
      console.warn('[Squeak] Could not save the board setting:', err);
      say(line('homeError')).then(showHint);
    } finally {
      homeSwitch.classList.remove('is-saving');
    }
  });
}

/* ═════════════════════════ Boot ═════════════════════════ */

async function boot() {
  console.info(`[Squeak] build ${BUILD}`);
  const buildTag = document.getElementById('build');
  if (buildTag) buildTag.textContent = `Squeak build ${BUILD}`;
  setTimeOfDay();
  setInterval(setTimeOfDay, 5 * 60 * 1000);
  await loadArt();
  body.liveForever();

  squeakButton.addEventListener('click', onSqueakClick);
  dialogEl.addEventListener('click', (event) => {
    if (!event.target.closest('button, input')) skipTyping = true;
  });
  askForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (labelling) saveLabel(input.value);
    else runSearch(input.value);
  });

  if (PREVIEW) {
    body.mood('happy');
    body.nod(3);
    say(line('greet')).then(() => {
      greeted = true;
      body.mood('neutral');
      hintEl.textContent = 'Preview mode: click Squeak to try him out. Open him inside Miro to search a real board.';
      showHint();
    });
    return;
  }

  const [panelData, user, online, info] = await Promise.all([
    miro.board.ui.getPanelData().catch(() => undefined),
    whoAmI(),
    miro.board.getOnlineUsers().catch(() => []),
    Promise.resolve().then(() => miro.board.getInfo()).catch(() => ({})),
  ]);
  boardId = info?.id || 'unknown';
  me = user;
  knownUserIds ??= new Set(online.map((u) => u.id));

  // Greeting: wave, then ask what they need. Clicking Squeak opens the search box.
  body.mood('happy');
  body.nod(3);
  const greeting =
    panelData?.reason === 'icon' ? line('greetReturn') : me.name ? line('greetNamed', { name: me.name }) : line('greet');
  say(greeting).then(() => {
    greeted = true;
    body.mood('neutral');
    showHint();
  });

  setupHomeSwitch();
  miro.board.ui.on('online_users:update', onOnlineUsersUpdate);
  miro.board.ui.on('items:create', onItemsCreated);
  miro.board.ui.on('items:delete', onItemsDeleted);

  vision = createVision();
  if (visionUsable()) vision.warm(['text']).catch(() => {}); // so the first search doesn't wait
  scanBoard().then(() => {
    setInterval(() => {
      if (!catalog.paused && !catalog.running) syncWithBoard();
    }, CONFIG.syncEverySec * 1000);
  });
}

boot();
