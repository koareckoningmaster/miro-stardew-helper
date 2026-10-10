/**
 * Pip's trim vocabulary, shared by the panel (app.js) and the image-recognition worker.
 *
 * - `prompt` is what the vision model compares each photo against when auto-tagging.
 * - `words` are the synonyms a person might type, so "zigzag" finds rickrack.
 * - `phrase` is how Pip says it out loud ("a red velvet ribbon").
 *
 * Add, remove or rename entries freely. If you change prompts, bump VISION_MODEL.tag
 * so existing images get re-tagged.
 */

export const VISION_MODEL = {
  id: 'Marqo/marqo-fashionCLIP', // CLIP fine-tuned on fashion products
  dtype: 'q8', // quantized weights: ~65 MB text + ~87 MB vision, cached after first load
  tag: 'marqo-fashionclip-q8-v1', // stored with each image's tags; change to force a re-tag
};

export const TRIM_TYPES = [
  { key: 'lace', prompt: 'lace trim', phrase: 'lace trim', words: ['lace', 'guipure', 'chantilly', 'venise', 'eyelet'] },
  { key: 'crochet', prompt: 'crochet lace trim', phrase: 'crochet trim', words: ['crochet', 'crocheted', 'knit', 'knitted', 'cluny'] },
  { key: 'satin-ribbon', prompt: 'satin ribbon', phrase: 'satin ribbon', words: ['ribbon', 'satin', 'silky', 'silk'] },
  { key: 'velvet-ribbon', prompt: 'velvet ribbon', phrase: 'velvet ribbon', words: ['ribbon', 'velvet', 'velour', 'plush'] },
  { key: 'grosgrain-ribbon', prompt: 'grosgrain ribbon', phrase: 'grosgrain ribbon', words: ['ribbon', 'grosgrain', 'ribbed', 'petersham'] },
  { key: 'organza-ribbon', prompt: 'sheer organza ribbon', phrase: 'organza ribbon', words: ['ribbon', 'organza', 'sheer', 'chiffon', 'tulle'] },
  { key: 'fringe', prompt: 'fringe trim', phrase: 'fringe trim', words: ['fringe', 'fringed', 'eyelash'] },
  { key: 'tassel', prompt: 'tassel trim', phrase: 'tassel trim', words: ['tassel', 'tassels', 'tasseled', 'tasselled'] },
  { key: 'pom-pom', prompt: 'pom-pom ball trim', phrase: 'pom-pom trim', words: ['pompom', 'pompoms', 'pom', 'poms', 'bobble', 'bobbles', 'ball'] },
  { key: 'sequin', prompt: 'sequin trim', phrase: 'sequin trim', words: ['sequin', 'sequins', 'sequined', 'paillette', 'sparkly', 'glitter', 'glitzy', 'shimmer'] },
  { key: 'beaded', prompt: 'beaded trim', phrase: 'beaded trim', words: ['beaded', 'bead', 'beads', 'beading', 'bugle'] },
  { key: 'pearl', prompt: 'pearl trim', phrase: 'pearl trim', words: ['pearl', 'pearls', 'pearly'] },
  { key: 'rhinestone', prompt: 'rhinestone crystal trim', phrase: 'rhinestone trim', words: ['rhinestone', 'rhinestones', 'crystal', 'crystals', 'diamante', 'gem', 'gems', 'bling'] },
  { key: 'rickrack', prompt: 'zigzag rickrack trim', phrase: 'rickrack', words: ['rickrack', 'ricrac', 'ric', 'rac', 'zigzag', 'wavy'] },
  { key: 'braid', prompt: 'braided gimp trim', phrase: 'braid trim', words: ['braid', 'braided', 'gimp', 'soutache', 'plait', 'plaited'] },
  { key: 'piping', prompt: 'piping cord trim', phrase: 'piping', words: ['piping', 'piped', 'welt', 'lip'] },
  { key: 'cord', prompt: 'twisted rope cord', phrase: 'twisted cord', words: ['cord', 'rope', 'twisted', 'string', 'cording'] },
  { key: 'ruffle', prompt: 'ruffle trim', phrase: 'ruffle trim', words: ['ruffle', 'ruffled', 'ruffles', 'frill', 'frilly', 'ruched'] },
  { key: 'pleated', prompt: 'pleated trim', phrase: 'pleated trim', words: ['pleated', 'pleat', 'pleats'] },
  { key: 'feather', prompt: 'feather trim', phrase: 'feather trim', words: ['feather', 'feathers', 'marabou', 'ostrich', 'plume', 'boa'] },
  { key: 'faux-fur', prompt: 'faux fur trim', phrase: 'faux fur trim', words: ['fur', 'furry', 'fluffy', 'fuzzy', 'faux'] },
  { key: 'embroidered', prompt: 'embroidered trim', phrase: 'embroidered trim', words: ['embroidered', 'embroidery', 'broderie', 'stitched'] },
  { key: 'applique', prompt: 'appliqué patch', phrase: 'appliqué', words: ['applique', 'appliqué', 'patch', 'patches', 'motif'] },
  { key: 'chain', prompt: 'metal chain trim', phrase: 'chain trim', words: ['chain', 'chains', 'chainlink'] },
  { key: 'studded', prompt: 'studded trim', phrase: 'studded trim', words: ['studded', 'stud', 'studs', 'rivet', 'rivets', 'spike', 'spikes'] },
  { key: 'metallic', prompt: 'metallic lurex trim', phrase: 'metallic trim', words: ['metallic', 'lurex', 'lame', 'lamé', 'foil', 'shiny'] },
  { key: 'elastic', prompt: 'elastic band', phrase: 'elastic', words: ['elastic', 'stretch', 'elasticated', 'waistband'] },
  { key: 'bias-binding', prompt: 'bias binding tape', phrase: 'bias binding', words: ['bias', 'binding', 'tape'] },
  { key: 'scalloped', prompt: 'scalloped edge trim', phrase: 'scalloped trim', words: ['scalloped', 'scallop', 'scallops'] },
  { key: 'leather', prompt: 'leather trim', phrase: 'leather trim', words: ['leather', 'suede', 'pleather'] },
];

export const TRIM_COLORS = [
  { key: 'red', words: ['red', 'scarlet', 'crimson', 'cherry'] },
  { key: 'burgundy', words: ['burgundy', 'maroon', 'wine', 'oxblood'] },
  { key: 'pink', words: ['pink', 'rose', 'blush', 'fuchsia', 'magenta'] },
  { key: 'orange', words: ['orange', 'coral', 'peach', 'rust'] },
  { key: 'yellow', words: ['yellow', 'mustard', 'lemon'] },
  { key: 'gold', words: ['gold', 'golden'] },
  { key: 'green', words: ['green', 'olive', 'mint', 'emerald', 'sage', 'lime'] },
  { key: 'teal', words: ['teal', 'turquoise', 'aqua'] },
  { key: 'blue', words: ['blue', 'cobalt', 'royal', 'sky'] },
  { key: 'navy', words: ['navy'] },
  { key: 'purple', words: ['purple', 'lilac', 'lavender', 'violet', 'plum'] },
  { key: 'brown', words: ['brown', 'tan', 'chocolate', 'camel', 'cognac'] },
  { key: 'beige', words: ['beige', 'nude', 'sand', 'khaki', 'taupe'] },
  { key: 'ivory', words: ['ivory', 'cream', 'ecru'] },
  { key: 'white', words: ['white'] },
  { key: 'gray', words: ['gray', 'grey', 'charcoal'] },
  { key: 'silver', words: ['silver'] },
  { key: 'black', words: ['black', 'jet'] },
  { key: 'multicolor', phrase: 'multicolored', words: ['multicolor', 'multicolored', 'multi', 'rainbow', 'colorful'] },
];

export const colorPrompt = (color) => `${color.phrase || color.key} trim`;

const TYPE_BY_KEY = new Map(TRIM_TYPES.map((t) => [t.key, t]));
const COLOR_BY_KEY = new Map(TRIM_COLORS.map((c) => [c.key, c]));

/** Everything a person might type for these tags, used for keyword matching. */
export function tagSearchText(tags = []) {
  return tags
    .flatMap((key) => {
      const entry = TYPE_BY_KEY.get(key) || COLOR_BY_KEY.get(key);
      return entry ? [entry.phrase || entry.key, ...entry.words] : [key];
    })
    .join(' ');
}

/** How Pip says it: "a white lace trim", "an ivory braid trim", "a pom-pom trim" (top color + top type). */
export function describeTags(tags = [], { article = true } = {}) {
  const color = tags.map((t) => COLOR_BY_KEY.get(t)).find(Boolean);
  const type = tags.map((t) => TYPE_BY_KEY.get(t)).find(Boolean);
  const words = [color ? color.phrase || color.key : '', type ? type.phrase : 'trim'].filter(Boolean).join(' ');
  if (!article) return words;
  return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`;
}
