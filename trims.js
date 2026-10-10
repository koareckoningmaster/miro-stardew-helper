/**
 * Squeak's vocabulary: everything he can recognize in a photo, shared by the panel (app.js) and the
 * image-recognition worker.
 *
 * - `prompt` is what the vision model compares each photo against.
 * - `words` are the synonyms people might type, so "zigzag" finds rickrack and "o-ring" finds rings.
 * - `phrase` is how Squeak says it out loud ("an orange trapezoid bead").
 * - `group` lets Squeak fall back to a broader word ("bead") when he isn't sure of the exact type.
 *
 * Add, remove or rename entries freely. If you change the vocabulary, bump TAGGER_VERSION:
 * Squeak relabels every photo from its saved fingerprint (quick) the next time he opens.
 */

export const VISION_MODEL = {
  id: 'Marqo/marqo-fashionCLIP', // CLIP fine-tuned on fashion products
  dtype: 'q8', // quantized weights: ~65 MB text + ~87 MB vision, cached after first load
  tag: 'marqo-fashionclip-q8-v1', // identifies saved image fingerprints; change only if you change the model
};

export const TAGGER_VERSION = 2; // bump when the vocabulary or labelling rules change

// How sure Squeak must be before using a specific word. Below these, he uses the broader word
// ("bead" instead of "trapezoid bead"). Raise them for fewer but safer labels.
export const TAGGING = {
  typeConfidence: 0.25, // to name the exact type ("D-ring" rather than "metal hardware")
  secondType: 0.2, // to add a runner-up type from the same family
  shapeConfidence: 0.35, // to name a shape ("trapezoid")
  metalConfidence: 0.55, // to call a warm color "gold" or a gray "silver"
};

// Each label is checked against several phrasings and the results are averaged ("prompt
// ensembling"), which makes zero-shot recognition noticeably more accurate.
export const PROMPT_TEMPLATES = [
  'a photo of {}',
  'a close-up photo of {}',
  'a product photo of {} on a plain background',
  '{} for sewing and fashion design',
];

export const GROUPS = {
  trim: { phrase: 'trim', words: ['trim', 'trims', 'trimming', 'edging', 'border'] },
  ribbon: { phrase: 'ribbon', words: ['ribbon', 'ribbons'] },
  bead: { phrase: 'bead', words: ['bead', 'beads', 'beaded'] },
  button: { phrase: 'button', words: ['button', 'buttons'] },
  hardware: { phrase: 'metal hardware', mass: true, words: ['hardware', 'metal', 'finding', 'findings', 'notion', 'notions'] },
  embellishment: { phrase: 'embellishment', words: ['embellishment', 'embellishments', 'decoration'] },
};

export const ITEM_TYPES = [
  // ── trims ──
  { key: 'lace', group: 'trim', prompt: 'lace trim', phrase: 'lace trim', words: ['lace', 'guipure', 'chantilly', 'venise', 'eyelet'] },
  { key: 'crochet', group: 'trim', prompt: 'crochet lace trim', phrase: 'crochet trim', words: ['crochet', 'crocheted', 'knit', 'knitted', 'cluny'] },
  { key: 'fringe', group: 'trim', prompt: 'fringe trim', phrase: 'fringe trim', words: ['fringe', 'fringed', 'eyelash'] },
  { key: 'tassel', group: 'trim', prompt: 'tassels', phrase: 'tassel trim', words: ['tassel', 'tassels', 'tasseled'] },
  { key: 'pom-pom', group: 'trim', prompt: 'pom-pom ball fringe trim with fluffy yarn balls', phrase: 'pom-pom trim', words: ['pompom', 'pompoms', 'pom', 'poms', 'bobble', 'bobbles', 'ball'] },
  { key: 'sequin', group: 'trim', prompt: 'sequin trim', phrase: 'sequin trim', words: ['sequin', 'sequins', 'sequined', 'paillette', 'sparkly', 'glitter', 'glitzy', 'shimmer'] },
  { key: 'beaded', group: 'trim', prompt: 'beaded trim with beads sewn onto a band', phrase: 'beaded trim', words: ['beaded', 'beading', 'bead', 'beads'] },
  { key: 'pearl', group: 'trim', prompt: 'pearl trim', phrase: 'pearl trim', words: ['pearl', 'pearls', 'pearly'] },
  { key: 'rhinestone', group: 'trim', prompt: 'rhinestone crystal trim', phrase: 'rhinestone trim', words: ['rhinestone', 'rhinestones', 'crystal', 'crystals', 'diamante', 'gem', 'gems', 'bling'] },
  { key: 'rickrack', group: 'trim', prompt: 'zigzag rickrack trim, a flat wavy braid', phrase: 'rickrack', words: ['rickrack', 'ricrac', 'ric', 'rac', 'zigzag', 'wavy'] },
  { key: 'braid', group: 'trim', prompt: 'braided gimp trim', phrase: 'braid trim', words: ['braid', 'braided', 'gimp', 'soutache', 'plait', 'plaited'] },
  { key: 'piping', group: 'trim', prompt: 'piping cord trim', phrase: 'piping', words: ['piping', 'piped', 'welt', 'lip'] },
  { key: 'cord', group: 'trim', prompt: 'twisted rope cord', phrase: 'twisted cord', words: ['cord', 'rope', 'twisted', 'string', 'cording'] },
  { key: 'ruffle', group: 'trim', prompt: 'ruffle trim', phrase: 'ruffle trim', words: ['ruffle', 'ruffled', 'ruffles', 'frill', 'frilly', 'ruched'] },
  { key: 'pleated', group: 'trim', prompt: 'pleated trim', phrase: 'pleated trim', words: ['pleated', 'pleat', 'pleats'] },
  { key: 'feather', group: 'trim', prompt: 'feather trim', phrase: 'feather trim', words: ['feather', 'feathers', 'marabou', 'ostrich', 'plume', 'boa'] },
  { key: 'faux-fur', group: 'trim', prompt: 'faux fur trim', phrase: 'faux fur trim', words: ['fur', 'furry', 'fluffy', 'fuzzy', 'faux'] },
  { key: 'embroidered', group: 'trim', prompt: 'embroidered trim', phrase: 'embroidered trim', words: ['embroidered', 'embroidery', 'broderie', 'stitched'] },
  { key: 'chain-trim', group: 'trim', prompt: 'metal chain trim', phrase: 'chain trim', words: ['chain', 'chains', 'chainlink'] },
  { key: 'studded', group: 'trim', prompt: 'studded trim with metal studs', phrase: 'studded trim', words: ['studded', 'stud', 'studs', 'spike', 'spikes'] },
  { key: 'metallic', group: 'trim', prompt: 'metallic lurex trim', phrase: 'metallic trim', words: ['metallic', 'lurex', 'lame', 'lamé', 'foil', 'shiny'] },
  { key: 'elastic', group: 'trim', prompt: 'flat stretchy elastic band', phrase: 'elastic', words: ['elastic', 'stretch', 'elasticated', 'waistband'] },
  { key: 'bias-binding', group: 'trim', prompt: 'bias binding tape', phrase: 'bias binding', words: ['bias', 'binding', 'tape'] },
  { key: 'scalloped', group: 'trim', prompt: 'scalloped edge trim', phrase: 'scalloped trim', words: ['scalloped', 'scallop', 'scallops'] },
  { key: 'leather', group: 'trim', prompt: 'leather trim', phrase: 'leather trim', words: ['leather', 'suede', 'pleather'] },
  // ── ribbons ──
  { key: 'satin-ribbon', group: 'ribbon', prompt: 'satin ribbon', phrase: 'satin ribbon', words: ['ribbon', 'satin', 'silky', 'silk'] },
  { key: 'velvet-ribbon', group: 'ribbon', prompt: 'velvet ribbon', phrase: 'velvet ribbon', words: ['ribbon', 'velvet', 'velour', 'plush'] },
  { key: 'grosgrain-ribbon', group: 'ribbon', prompt: 'grosgrain ribbon', phrase: 'grosgrain ribbon', words: ['ribbon', 'grosgrain', 'ribbed', 'petersham'] },
  { key: 'organza-ribbon', group: 'ribbon', prompt: 'sheer organza ribbon', phrase: 'organza ribbon', words: ['ribbon', 'organza', 'sheer', 'chiffon', 'tulle'] },
  // ── beads ──
  { key: 'seed-beads', group: 'bead', prompt: 'tiny round seed beads', phrase: 'seed bead', words: ['seed', 'beads', 'bead', 'tiny'] },
  { key: 'bugle-beads', group: 'bead', prompt: 'bugle beads, thin glass tube beads', phrase: 'bugle bead', words: ['bugle', 'tube', 'beads', 'bead'] },
  { key: 'round-beads', group: 'bead', prompt: 'loose round beads', phrase: 'round bead', words: ['round', 'ball', 'beads', 'bead'] },
  { key: 'faceted-beads', group: 'bead', prompt: 'faceted crystal glass beads', phrase: 'faceted bead', words: ['faceted', 'crystal', 'cut', 'beads', 'bead'] },
  { key: 'shaped-beads', group: 'bead', prompt: 'geometric shaped beads', phrase: 'shaped bead', words: ['shaped', 'geometric', 'beads', 'bead'] },
  { key: 'pearl-beads', group: 'bead', prompt: 'loose pearl beads', phrase: 'pearl bead', words: ['pearl', 'pearls', 'beads', 'bead'] },
  { key: 'wood-beads', group: 'bead', prompt: 'wooden beads', phrase: 'wooden bead', words: ['wood', 'wooden', 'beads', 'bead'] },
  // ── buttons ──
  { key: 'button', group: 'button', prompt: 'a sew-through button with holes', phrase: 'button', words: ['button', 'buttons'] },
  { key: 'shank-button', group: 'button', prompt: 'a shank button', phrase: 'shank button', words: ['shank', 'button', 'buttons'] },
  { key: 'covered-button', group: 'button', prompt: 'a fabric covered button', phrase: 'covered button', words: ['covered', 'fabric', 'button', 'buttons'] },
  { key: 'toggle', group: 'button', prompt: 'a toggle button', phrase: 'toggle', words: ['toggle', 'toggles', 'horn'] },
  // ── metal hardware & findings ──
  { key: 'o-ring', group: 'hardware', prompt: 'a round metal o-ring', phrase: 'metal ring', words: ['ring', 'rings', 'o-ring', 'oring', 'loop', 'hoop', 'circle'] },
  { key: 'd-ring', group: 'hardware', prompt: 'a metal d-ring', phrase: 'D-ring', words: ['d-ring', 'dring', 'ring', 'rings', 'loop'] },
  { key: 'buckle', group: 'hardware', prompt: 'a belt buckle', phrase: 'buckle', words: ['buckle', 'buckles'] },
  { key: 'grommet', group: 'hardware', prompt: 'metal grommets and eyelets', phrase: 'grommet', words: ['grommet', 'grommets', 'eyelet', 'eyelets'] },
  { key: 'snap', group: 'hardware', prompt: 'metal snap fasteners', phrase: 'snap fastener', words: ['snap', 'snaps', 'popper', 'press'] },
  { key: 'hook-eye', group: 'hardware', prompt: 'hook and eye closures', phrase: 'hook and eye', words: ['hook', 'eye', 'hooks', 'closure'] },
  { key: 'clasp', group: 'hardware', prompt: 'a lobster clasp', phrase: 'clasp', words: ['clasp', 'clasps', 'lobster', 'clip'] },
  { key: 'zipper', group: 'hardware', prompt: 'a zipper', phrase: 'zipper', words: ['zipper', 'zip', 'zippers'] },
  { key: 'zipper-pull', group: 'hardware', prompt: 'a zipper pull', phrase: 'zipper pull', words: ['zipper', 'zip', 'pull', 'puller', 'slider'] },
  { key: 'chain', group: 'hardware', prompt: 'a loose metal chain', phrase: 'chain', words: ['chain', 'chains', 'links'] },
  { key: 'rivet', group: 'hardware', prompt: 'metal rivets and studs', phrase: 'rivet', words: ['rivet', 'rivets', 'stud', 'studs'] },
  { key: 'cord-end', group: 'hardware', prompt: 'cord stoppers and cord ends', phrase: 'cord end', words: ['cord', 'stopper', 'toggle', 'end', 'tip', 'aglet'] },
  // ── embellishments ──
  { key: 'charm', group: 'embellishment', prompt: 'a small metal charm pendant', phrase: 'charm', words: ['charm', 'charms', 'pendant', 'pendants'] },
  { key: 'applique', group: 'embellishment', prompt: 'an embroidered appliqué patch', phrase: 'appliqué', words: ['applique', 'appliqué', 'patch', 'patches', 'motif'] },
  { key: 'bow', group: 'embellishment', prompt: 'a ribbon bow', phrase: 'bow', words: ['bow', 'bows'] },
  { key: 'flower', group: 'embellishment', prompt: 'a fabric flower rosette', phrase: 'fabric flower', words: ['flower', 'flowers', 'rosette', 'rose', 'floral'] },
  { key: 'brooch', group: 'embellishment', prompt: 'a jeweled brooch', phrase: 'brooch', words: ['brooch', 'pin', 'jewel', 'jeweled'] },
  { key: 'loose-sequins', group: 'embellishment', prompt: 'loose sequins and paillettes', phrase: 'loose sequins', mass: true, words: ['sequins', 'sequin', 'paillettes'] },
  { key: 'loose-rhinestones', group: 'embellishment', prompt: 'loose rhinestones and crystals', phrase: 'loose rhinestones', mass: true, words: ['rhinestones', 'crystals', 'gems', 'stones'] },
];

// Shapes Squeak names for small objects (beads, buttons, charms).
export const SHAPE_GROUPS = ['bead', 'button', 'embellishment'];
export const SHAPES = [
  { key: 'round', words: ['round', 'circle', 'circular', 'ball'] },
  { key: 'oval', words: ['oval', 'egg'] },
  { key: 'square', words: ['square', 'squared'] },
  { key: 'rectangular', words: ['rectangle', 'rectangular', 'bar'] },
  { key: 'trapezoid', words: ['trapezoid', 'trapezoidal', 'wedge', 'tapered'] },
  { key: 'triangle', words: ['triangle', 'triangular'] },
  { key: 'teardrop', words: ['teardrop', 'drop', 'tear'] },
  { key: 'heart', words: ['heart', 'hearts'] },
  { key: 'star', words: ['star', 'stars'] },
  { key: 'flower-shaped', phrase: 'flower-shaped', words: ['flower', 'floral'] },
  { key: 'cube', words: ['cube', 'cubes', 'cubic'] },
  { key: 'tube', words: ['tube', 'tubular', 'cylinder'] },
];
export const shapePrompt = (shape, group) => `a ${shape.phrase || shape.key} ${GROUPS[group].phrase}`;

// Metallic finishes come from the vision model; plain colors are measured from the pixels.
export const METALS = [
  { key: 'gold', prompt: 'shiny gold metal' },
  { key: 'silver', prompt: 'shiny silver metal' },
  { key: 'none', prompt: 'fabric, plastic, wood or glass, not metal' },
];

export const TRIM_COLORS = [
  { key: 'red', words: ['red', 'scarlet', 'crimson', 'cherry'] },
  { key: 'burgundy', words: ['burgundy', 'maroon', 'wine', 'oxblood'] },
  { key: 'pink', words: ['pink', 'rose', 'blush', 'fuchsia', 'magenta'] },
  { key: 'orange', words: ['orange', 'coral', 'peach', 'rust', 'amber', 'tangerine'] },
  { key: 'yellow', words: ['yellow', 'mustard', 'lemon'] },
  { key: 'gold', words: ['gold', 'golden', 'brass'] },
  { key: 'green', words: ['green', 'olive', 'mint', 'emerald', 'sage', 'lime'] },
  { key: 'teal', words: ['teal', 'turquoise', 'aqua'] },
  { key: 'blue', words: ['blue', 'cobalt', 'royal', 'sky'] },
  { key: 'navy', words: ['navy'] },
  { key: 'purple', words: ['purple', 'lilac', 'lavender', 'violet', 'plum'] },
  { key: 'brown', words: ['brown', 'tan', 'chocolate', 'camel', 'cognac', 'bronze'] },
  { key: 'beige', words: ['beige', 'nude', 'sand', 'khaki', 'taupe'] },
  { key: 'ivory', words: ['ivory', 'cream', 'ecru'] },
  { key: 'white', words: ['white'] },
  { key: 'gray', words: ['gray', 'grey', 'charcoal'] },
  { key: 'silver', words: ['silver', 'chrome', 'nickel'] },
  { key: 'black', words: ['black', 'jet'] },
  { key: 'multicolor', phrase: 'multicolored', words: ['multicolor', 'multicolored', 'multi', 'rainbow', 'colorful'] },
];

/** Names an RGB color the way a person would, using hue, saturation and lightness. */
export function nameColor(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;

  if (l < 0.12) return 'black';
  if (s < 0.14) return l > 0.86 ? 'white' : l > 0.22 ? 'gray' : 'black';
  if (l > 0.92) return h >= 30 && h < 70 ? 'ivory' : 'white';
  if (h < 12 || h >= 345) return l < 0.3 ? 'burgundy' : l > 0.72 ? 'pink' : 'red';
  if (h >= 30 && h < 66 && l > 0.82) return 'ivory'; // cream
  if (h < 40) {
    if (l < 0.32 || (s < 0.45 && l < 0.5)) return 'brown';
    if (s < 0.35 && l > 0.6) return 'beige';
    return 'orange';
  }
  if (h < 66) {
    if (l < 0.38) return 'brown';
    if (s < 0.4 && l > 0.75) return 'ivory';
    if (s < 0.45 && l > 0.45) return 'beige';
    return 'yellow';
  }
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return l < 0.28 ? 'navy' : 'blue';
  if (h < 290) return 'purple';
  return l < 0.3 ? 'burgundy' : 'pink';
}

const TYPE_BY_KEY = new Map(ITEM_TYPES.map((t) => [t.key, t]));
const COLOR_BY_KEY = new Map(TRIM_COLORS.map((c) => [c.key, c]));
const SHAPE_BY_KEY = new Map(SHAPES.map((s) => [s.key, s]));

/** Everything a person might type for these tags, used for keyword matching. */
export function tagSearchText(tags = []) {
  return tags
    .flatMap((key) => {
      const type = TYPE_BY_KEY.get(key);
      if (type) return [type.phrase, ...type.words, ...GROUPS[type.group].words];
      const group = GROUPS[key];
      if (group) return [group.phrase, ...group.words];
      const entry = COLOR_BY_KEY.get(key) || SHAPE_BY_KEY.get(key);
      return entry ? [entry.phrase || entry.key, ...entry.words] : [key];
    })
    .join(' ');
}

/** How Squeak says it: "an orange trapezoid bead", "a gold metal ring", "a white lace trim". */
export function describeTags(tags = [], { article = true } = {}) {
  const color = tags.map((t) => COLOR_BY_KEY.get(t)).find(Boolean);
  const shape = tags.map((t) => SHAPE_BY_KEY.get(t)).find(Boolean);
  const type = tags.map((t) => TYPE_BY_KEY.get(t)).find(Boolean);
  const group = !type && tags.map((t) => GROUPS[t]).find(Boolean);
  let noun = type ? type.phrase : group ? group.phrase : 'trim';
  // "shaped bead" + a shape reads better as "trapezoid bead"
  if (type?.key === 'shaped-beads' && shape) noun = 'bead';
  // don't repeat a shape the noun already says ("round bead", not "round round bead")
  const shapeWord = shape && !noun.includes(shape.key) ? shape.phrase || shape.key : '';
  const words = [color ? color.phrase || color.key : '', shapeWord, noun].filter(Boolean).join(' ');
  if (!article || type?.mass || (!type && group?.mass)) return words;
  return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`;
}
