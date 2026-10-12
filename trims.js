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

export const TAGGER_VERSION = 5; // bump when the vocabulary or labelling rules change
export const FINGERPRINT_VERSION = 3; // how photos are looked at (cropping etc.); bump to re-check every photo once

// How sure Squeak must be before using a specific word. Below these, he uses the broader word
// ("bead" instead of "trapezoid bead"). Raise them for fewer but safer labels.
export const TAGGING = {
  // Squeak first decides the family (trim, ribbon, bead, button, hardware, embellishment), then
  // names the exact type within it when it's confident, or clearly ahead of the runner-up.
  typeConfidence: 0.3, // share of the family's odds needed to name the exact type outright
  typeLead: 1.6, // …or this many times the runner-up's odds…
  typeFloor: 0.12, // …as long as it has at least this share
  secondType: 0.22, // share needed to also add a runner-up type
  shapeConfidence: 0.35, // to name a shape ("trapezoid")
  metalConfidence: 0.55, // to call a warm color "gold" or a gray "silver"
  materialConfidence: 0.3, // to name a material ("velvet", "glass")
  patternConfidence: 0.35, // to name a pattern ("floral", "striped")
  finishConfidence: 0.4, // to name a finish ("iridescent", "matte")
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
  // ── more lace ──
  { key: 'chantilly-lace', group: 'trim', prompt: 'delicate chantilly lace with fine net and floral motifs', phrase: 'chantilly lace', words: ['chantilly', 'lace', 'delicate', 'net', 'bridal'] },
  { key: 'guipure-lace', group: 'trim', prompt: 'guipure lace with raised motifs and no net background', phrase: 'guipure lace', words: ['guipure', 'lace', 'macrame', 'chemical', 'raised'] },
  { key: 'venise-lace', group: 'trim', prompt: 'venise lace with thick raised embroidered motifs', phrase: 'venise lace', words: ['venise', 'venice', 'lace', 'raised'] },
  { key: 'eyelet-lace', group: 'trim', prompt: 'broderie anglaise eyelet trim with embroidered holes', phrase: 'eyelet trim', words: ['eyelet', 'broderie', 'anglaise', 'cotton', 'holes'] },
  { key: 'tulle-lace', group: 'trim', prompt: 'embroidered tulle lace trim', phrase: 'tulle lace', words: ['tulle', 'mesh', 'net', 'lace'] },
  { key: 'tatted-lace', group: 'trim', prompt: 'tatted lace edging with small rings and picots', phrase: 'tatted lace', words: ['tatted', 'tatting', 'lace', 'picot'] },
  // ── more braid, cord and edging ──
  { key: 'soutache', group: 'trim', prompt: 'narrow soutache braid', phrase: 'soutache braid', words: ['soutache', 'braid', 'russia', 'narrow'] },
  { key: 'gimp', group: 'trim', prompt: 'decorative gimp braid trim for upholstery', phrase: 'gimp braid', words: ['gimp', 'braid', 'upholstery', 'scroll'] },
  { key: 'chevron-braid', group: 'trim', prompt: 'chevron zigzag woven braid trim', phrase: 'chevron braid', words: ['chevron', 'braid', 'zigzag', 'herringbone'] },
  { key: 'pompadour', group: 'trim', prompt: 'jacquard woven trim band with a pattern', phrase: 'jacquard trim', words: ['jacquard', 'woven', 'tape', 'band', 'tapestry'] },
  { key: 'webbing', group: 'trim', prompt: 'flat woven webbing strap', phrase: 'webbing', words: ['webbing', 'strap', 'tape', 'belting', 'nylon'] },
  { key: 'twill-tape', group: 'trim', prompt: 'cotton twill tape', phrase: 'twill tape', words: ['twill', 'tape', 'cotton', 'herringbone'] },
  { key: 'drawstring', group: 'trim', prompt: 'a drawstring cord with tipped ends', phrase: 'drawstring', words: ['drawstring', 'cord', 'string', 'lace', 'aglet'] },
  { key: 'rope-cord', group: 'trim', prompt: 'thick decorative rope cording with lip', phrase: 'rope cording', words: ['rope', 'cording', 'cord', 'lip', 'upholstery'] },
  { key: 'picot-edge', group: 'trim', prompt: 'trim with a picot loop edge', phrase: 'picot trim', words: ['picot', 'loop', 'edge', 'edging'] },
  { key: 'bobble-fringe', group: 'trim', prompt: 'bobble fringe with small fabric balls', phrase: 'bobble fringe', words: ['bobble', 'fringe', 'ball', 'pompom'] },
  { key: 'bullion-fringe', group: 'trim', prompt: 'twisted bullion fringe', phrase: 'bullion fringe', words: ['bullion', 'fringe', 'twisted', 'upholstery'] },
  { key: 'beaded-fringe', group: 'trim', prompt: 'beaded fringe with dangling strands of beads', phrase: 'beaded fringe', words: ['beaded', 'fringe', 'dangling', 'flapper', 'bead'] },
  { key: 'chain-fringe', group: 'trim', prompt: 'metal chain fringe', phrase: 'chain fringe', words: ['chain', 'fringe', 'dangling', 'metal'] },
  { key: 'feather-fringe', group: 'trim', prompt: 'feather fringe trim', phrase: 'feather fringe', words: ['feather', 'fringe', 'ostrich', 'marabou'] },
  { key: 'sequin-fringe', group: 'trim', prompt: 'sequin fringe trim with hanging paillettes', phrase: 'sequin fringe', words: ['sequin', 'fringe', 'paillette', 'dangling'] },
  { key: 'rhinestone-chain', group: 'trim', prompt: 'rhinestone cup chain', phrase: 'rhinestone cup chain', words: ['rhinestone', 'cup', 'chain', 'crystal', 'banding', 'diamante'] },
  { key: 'rhinestone-banding', group: 'trim', prompt: 'wide rhinestone banding with rows of crystals', phrase: 'rhinestone banding', words: ['rhinestone', 'banding', 'crystal', 'mesh', 'bling'] },
  { key: 'pearl-strand', group: 'trim', prompt: 'strands of pearls on a string', phrase: 'pearl strand', words: ['pearl', 'strand', 'string', 'pearls'] },
  { key: 'lame-trim', group: 'trim', prompt: 'shiny metallic lame braid', phrase: 'lamé braid', words: ['lame', 'lamé', 'metallic', 'braid'] },
  { key: 'velvet-cord', group: 'trim', prompt: 'velvet cord', phrase: 'velvet cord', words: ['velvet', 'cord', 'plush'] },
  { key: 'sequin-mesh', group: 'trim', prompt: 'stretch sequin mesh trim', phrase: 'sequin mesh', words: ['sequin', 'mesh', 'stretch', 'sparkly'] },
  { key: 'ruched-trim', group: 'trim', prompt: 'gathered ruched trim', phrase: 'ruched trim', words: ['ruched', 'gathered', 'shirred', 'ruffle'] },
  { key: 'boning', group: 'trim', prompt: 'corset boning strips', phrase: 'boning', words: ['boning', 'corset', 'rigilene', 'spiral', 'stays'] },
  { key: 'hook-loop', group: 'trim', prompt: 'hook and loop fastener tape', phrase: 'hook and loop tape', words: ['velcro', 'hook', 'loop', 'tape', 'fastener'] },
  { key: 'zipper-tape', group: 'trim', prompt: 'continuous zipper tape', phrase: 'zipper tape', words: ['zipper', 'zip', 'tape', 'coil'] },
  // ── more ribbons ──
  { key: 'jacquard-ribbon', group: 'ribbon', prompt: 'woven jacquard ribbon with a pattern', phrase: 'jacquard ribbon', words: ['ribbon', 'jacquard', 'woven', 'patterned'] },
  { key: 'picot-ribbon', group: 'ribbon', prompt: 'ribbon with picot loop edges', phrase: 'picot-edge ribbon', words: ['ribbon', 'picot', 'loop', 'edge'] },
  { key: 'wired-ribbon', group: 'ribbon', prompt: 'wired edge ribbon', phrase: 'wired ribbon', words: ['ribbon', 'wired', 'wire', 'edge'] },
  { key: 'taffeta-ribbon', group: 'ribbon', prompt: 'crisp taffeta ribbon', phrase: 'taffeta ribbon', words: ['ribbon', 'taffeta', 'crisp', 'silk'] },
  { key: 'ombre-ribbon', group: 'ribbon', prompt: 'ombre ribbon fading from one color to another', phrase: 'ombré ribbon', words: ['ribbon', 'ombre', 'ombré', 'gradient', 'fade'] },
  { key: 'metallic-ribbon', group: 'ribbon', prompt: 'shiny metallic ribbon', phrase: 'metallic ribbon', words: ['ribbon', 'metallic', 'lame', 'shiny'] },
  { key: 'double-satin-ribbon', group: 'ribbon', prompt: 'double-faced satin ribbon', phrase: 'double-faced satin ribbon', words: ['ribbon', 'satin', 'double', 'faced'] },
  { key: 'chiffon-ribbon', group: 'ribbon', prompt: 'soft silk chiffon ribbon with frayed edges', phrase: 'chiffon ribbon', words: ['ribbon', 'chiffon', 'silk', 'frayed', 'raw'] },
  { key: 'velvet-ribbon-wide', group: 'ribbon', prompt: 'wide plush velvet ribbon', phrase: 'wide velvet ribbon', words: ['ribbon', 'velvet', 'wide', 'plush'] },
  // ── more beads ──
  { key: 'crystal-beads', group: 'bead', prompt: 'bicone crystal beads', phrase: 'crystal bead', words: ['crystal', 'bicone', 'swarovski', 'beads', 'bead'] },
  { key: 'drop-beads', group: 'bead', prompt: 'teardrop shaped beads', phrase: 'drop bead', words: ['drop', 'teardrop', 'briolette', 'beads', 'bead'] },
  { key: 'cube-beads', group: 'bead', prompt: 'small cube beads', phrase: 'cube bead', words: ['cube', 'square', 'beads', 'bead'] },
  { key: 'metal-beads', group: 'bead', prompt: 'metal spacer beads', phrase: 'metal bead', words: ['metal', 'spacer', 'beads', 'bead'] },
  { key: 'acrylic-beads', group: 'bead', prompt: 'colorful acrylic plastic beads', phrase: 'acrylic bead', words: ['acrylic', 'plastic', 'beads', 'bead'] },
  { key: 'stone-beads', group: 'bead', prompt: 'natural gemstone beads', phrase: 'gemstone bead', words: ['gemstone', 'stone', 'natural', 'agate', 'beads', 'bead'] },
  { key: 'sequin-beads', group: 'bead', prompt: 'cup sequins and flat sequins', phrase: 'cup sequin', words: ['cup', 'sequin', 'sequins', 'paillette'] },
  // ── more buttons ──
  { key: 'pearl-button', group: 'button', prompt: 'a pearl or mother of pearl button', phrase: 'pearl button', words: ['pearl', 'mother', 'shell', 'button', 'buttons'] },
  { key: 'metal-button', group: 'button', prompt: 'a metal button with a crest', phrase: 'metal button', words: ['metal', 'brass', 'crest', 'blazer', 'button', 'buttons'] },
  { key: 'wood-button', group: 'button', prompt: 'a wooden button', phrase: 'wooden button', words: ['wood', 'wooden', 'button', 'buttons'] },
  { key: 'jeweled-button', group: 'button', prompt: 'a jeweled rhinestone button', phrase: 'jeweled button', words: ['jeweled', 'rhinestone', 'crystal', 'button', 'buttons'] },
  { key: 'jeans-button', group: 'button', prompt: 'a metal jeans tack button', phrase: 'jeans button', words: ['jeans', 'denim', 'tack', 'button', 'buttons'] },
  { key: 'frog-closure', group: 'button', prompt: 'a chinese frog knot closure', phrase: 'frog closure', words: ['frog', 'knot', 'chinese', 'closure', 'loop'] },
  // ── more hardware ──
  { key: 'slider', group: 'hardware', prompt: 'a strap adjuster slider', phrase: 'strap slider', words: ['slider', 'adjuster', 'strap', 'triglide', 'tri-glide'] },
  { key: 'swivel-clasp', group: 'hardware', prompt: 'a swivel snap hook clasp', phrase: 'swivel clasp', words: ['swivel', 'snap', 'hook', 'clasp', 'trigger'] },
  { key: 'magnetic-snap', group: 'hardware', prompt: 'a magnetic snap closure', phrase: 'magnetic snap', words: ['magnetic', 'magnet', 'snap', 'closure'] },
  { key: 'bra-hardware', group: 'hardware', prompt: 'lingerie bra rings and sliders', phrase: 'lingerie hardware', words: ['bra', 'lingerie', 'ring', 'slider', 'hook'] },
  { key: 'eyelet-hardware', group: 'hardware', prompt: 'small metal eyelets', phrase: 'metal eyelet', words: ['eyelet', 'eyelets', 'grommet', 'metal'] },
  { key: 'spike-stud', group: 'hardware', prompt: 'metal spike studs', phrase: 'spike stud', words: ['spike', 'stud', 'cone', 'punk', 'metal'] },
  { key: 'chain-strap', group: 'hardware', prompt: 'a chunky metal chain strap', phrase: 'chain strap', words: ['chain', 'strap', 'chunky', 'curb', 'link'] },
  { key: 'jump-ring', group: 'hardware', prompt: 'small metal jump rings', phrase: 'jump ring', words: ['jump', 'ring', 'rings', 'split', 'findings'] },
  { key: 'bell', group: 'hardware', prompt: 'small metal jingle bells', phrase: 'jingle bell', words: ['bell', 'bells', 'jingle'] },
  { key: 'safety-pin', group: 'hardware', prompt: 'safety pins', phrase: 'safety pin', words: ['safety', 'pin', 'pins'] },
  // ── more embellishments ──
  { key: 'patch', group: 'embellishment', prompt: 'an embroidered iron-on patch', phrase: 'embroidered patch', words: ['patch', 'patches', 'badge', 'iron'] },
  { key: 'collar-applique', group: 'embellishment', prompt: 'a beaded collar or neckline applique', phrase: 'neckline appliqué', words: ['collar', 'neckline', 'applique', 'appliqué', 'beaded'] },
  { key: 'lace-motif', group: 'embellishment', prompt: 'a single lace motif applique', phrase: 'lace motif', words: ['lace', 'motif', 'applique', 'appliqué', 'flower'] },
  { key: 'tassel-single', group: 'embellishment', prompt: 'a single decorative tassel', phrase: 'tassel', words: ['tassel', 'tassels', 'pendant'] },
  { key: 'pom-single', group: 'embellishment', prompt: 'a single large fluffy pompom', phrase: 'pompom', words: ['pompom', 'pom', 'fluffy', 'ball'] },
  { key: 'rosette', group: 'embellishment', prompt: 'a ribbon rosette', phrase: 'rosette', words: ['rosette', 'ribbon', 'cockade', 'flower'] },
  { key: 'hotfix', group: 'embellishment', prompt: 'hotfix rhinestone motif', phrase: 'hotfix motif', words: ['hotfix', 'iron', 'rhinestone', 'motif'] },
  { key: 'feather-pad', group: 'embellishment', prompt: 'a feather pad or feather cluster', phrase: 'feather cluster', words: ['feather', 'cluster', 'pad', 'plume'] },
  { key: 'shell', group: 'embellishment', prompt: 'natural sea shells used as embellishments', phrase: 'shell', words: ['shell', 'shells', 'cowrie', 'natural'] },
  { key: 'tag', group: 'embellishment', prompt: 'a woven garment label or tag', phrase: 'woven label', words: ['label', 'tag', 'woven', 'brand'] },
];

// The item's shape, measured from the photo, nudges which family it's likely to be. A long strip is
// probably trim or ribbon; a compact object with a hole is probably a ring; lots of tiny pieces are
// probably loose beads or sequins. Photos often show several of the same item: those are measured
// one piece at a time, so a group of rings or buttons is still judged as rings or buttons. These gently multiply the model's odds (1 = no change): they tip close
// calls, they don't override what the model clearly sees.
export const SHAPE_PRIORS = {
  strip: { trim: 1.35, ribbon: 1.35, bead: 0.65, button: 0.65, hardware: 0.8, embellishment: 0.8 }, // long and narrow
  compact: { trim: 0.8, ribbon: 0.7, bead: 1.25, button: 1.25, hardware: 1.25, embellishment: 1.2 }, // roughly as wide as tall
  scatter: { trim: 0.8, ribbon: 0.65, bead: 1.5, button: 1.0, hardware: 1.0, embellishment: 1.2 }, // lots of tiny pieces (loose beads, sequins)
  holeTypes: ['o-ring', 'd-ring', 'jump-ring', 'grommet', 'eyelet-hardware', 'bra-hardware', 'button', 'slider'],
  holeBoost: 2.0, // for those types when the item has a hole in the middle
  stripElongation: 3.2, // length ÷ width at or above this = a strip
  compactElongation: 2.0, // below this = compact
  minTiny: 8, // at least this many tiny pieces = "scatter" (several same-sized pieces are just one item, repeated)
};

// Material, pattern and finish: judged for every photo, named only when Squeak is fairly sure.
// Keys carry a prefix (m:, p:, f:) so they never clash with item types or colors.
export const MATERIALS = [
  { key: 'm:satin', phrase: 'satin', prompt: 'smooth shiny satin fabric', words: ['satin', 'silky', 'sateen'] },
  { key: 'm:velvet', phrase: 'velvet', prompt: 'soft plush velvet', words: ['velvet', 'velour', 'plush'] },
  { key: 'm:cotton', phrase: 'cotton', prompt: 'matte woven cotton', words: ['cotton', 'canvas'] },
  { key: 'm:linen', phrase: 'linen', prompt: 'textured natural linen', words: ['linen', 'flax', 'natural'] },
  { key: 'm:silk', phrase: 'silk', prompt: 'fine lustrous silk', words: ['silk', 'silky'] },
  { key: 'm:organza', phrase: 'organza', prompt: 'sheer crisp organza', words: ['organza', 'sheer'] },
  { key: 'm:tulle', phrase: 'tulle', prompt: 'fine net tulle mesh', words: ['tulle', 'net', 'mesh'] },
  { key: 'm:lace', phrase: 'lace', prompt: 'openwork lace', words: ['lace', 'lacy'] },
  { key: 'm:leather', phrase: 'leather', prompt: 'leather or suede', words: ['leather', 'suede', 'faux'] },
  { key: 'm:metal', phrase: 'metal', prompt: 'solid metal', words: ['metal', 'metallic', 'brass', 'steel', 'alloy'] },
  { key: 'm:glass', phrase: 'glass', prompt: 'transparent glass', words: ['glass', 'crystal', 'transparent'] },
  { key: 'm:plastic', phrase: 'plastic', prompt: 'molded plastic', words: ['plastic', 'acrylic', 'resin', 'nylon'] },
  { key: 'm:wood', phrase: 'wooden', prompt: 'natural wood', words: ['wood', 'wooden', 'bamboo'] },
  { key: 'm:pearl', phrase: 'pearl', prompt: 'pearl or mother of pearl', words: ['pearl', 'pearly', 'nacre'] },
  { key: 'm:yarn', phrase: 'yarn', prompt: 'fluffy knitted yarn or wool', words: ['yarn', 'wool', 'knit', 'woolen'] },
  { key: 'm:feather', phrase: 'feather', prompt: 'soft feathers', words: ['feather', 'feathers', 'plume'] },
  { key: 'm:fur', phrase: 'fur', prompt: 'fluffy fur or faux fur', words: ['fur', 'furry', 'faux'] },
  { key: 'm:raffia', phrase: 'raffia', prompt: 'woven raffia straw', words: ['raffia', 'straw', 'jute', 'natural'] },
  { key: 'm:sequin', phrase: 'sequined', prompt: 'covered in sequins', words: ['sequin', 'sequined', 'sequins'] },
  { key: 'm:rhinestone', phrase: 'rhinestone', prompt: 'covered in rhinestones', words: ['rhinestone', 'rhinestones', 'crystal'] },
];
export const PATTERNS = [
  { key: 'p:solid', phrase: 'solid', prompt: 'a single solid color with no pattern', words: ['solid', 'plain'] },
  { key: 'p:striped', phrase: 'striped', prompt: 'stripes', words: ['striped', 'stripe', 'stripes', 'stripy'] },
  { key: 'p:polka-dot', phrase: 'polka-dot', prompt: 'polka dots', words: ['polka', 'dot', 'dots', 'dotted', 'spotted'] },
  { key: 'p:floral', phrase: 'floral', prompt: 'a floral flower pattern', words: ['floral', 'flower', 'flowers', 'botanical', 'rose'] },
  { key: 'p:plaid', phrase: 'plaid', prompt: 'plaid tartan check', words: ['plaid', 'tartan', 'check', 'checked', 'gingham'] },
  { key: 'p:houndstooth', phrase: 'houndstooth', prompt: 'houndstooth check', words: ['houndstooth', 'dogtooth'] },
  { key: 'p:animal', phrase: 'animal-print', prompt: 'leopard, zebra or snake animal print', words: ['animal', 'leopard', 'zebra', 'snake', 'cheetah', 'print'] },
  { key: 'p:geometric', phrase: 'geometric', prompt: 'a geometric pattern', words: ['geometric', 'diamond', 'triangle'] },
  { key: 'p:paisley', phrase: 'paisley', prompt: 'paisley pattern', words: ['paisley', 'boteh'] },
  { key: 'p:scroll', phrase: 'scrolled', prompt: 'baroque scrollwork pattern', words: ['scroll', 'baroque', 'filigree', 'ornate'] },
  { key: 'p:greek-key', phrase: 'greek-key', prompt: 'greek key meander pattern', words: ['greek', 'key', 'meander'] },
  { key: 'p:heart', phrase: 'heart-pattern', prompt: 'a pattern of hearts', words: ['heart', 'hearts'] },
  { key: 'p:star', phrase: 'star-pattern', prompt: 'a pattern of stars', words: ['star', 'stars'] },
  { key: 'p:ombre', phrase: 'ombré', prompt: 'an ombre color gradient', words: ['ombre', 'ombré', 'gradient'] },
];
export const FINISHES = [
  { key: 'f:matte', phrase: 'matte', prompt: 'a flat matte surface', words: ['matte', 'flat'] },
  { key: 'f:glossy', phrase: 'glossy', prompt: 'a glossy shiny surface', words: ['glossy', 'shiny', 'gloss'] },
  { key: 'f:metallic', phrase: 'metallic', prompt: 'a metallic shine', words: ['metallic', 'shiny', 'foil'] },
  { key: 'f:iridescent', phrase: 'iridescent', prompt: 'an iridescent rainbow shimmer', words: ['iridescent', 'holographic', 'shimmer', 'pearlescent', 'ab'] },
  { key: 'f:sparkly', phrase: 'sparkly', prompt: 'sparkly glitter', words: ['sparkly', 'glitter', 'glittery', 'sparkle'] },
  { key: 'f:sheer', phrase: 'sheer', prompt: 'a sheer see-through finish', words: ['sheer', 'transparent', 'see-through'] },
  { key: 'f:textured', phrase: 'textured', prompt: 'a heavily textured surface', words: ['textured', 'texture', 'nubby', 'bumpy'] },
  { key: 'f:vintage', phrase: 'vintage', prompt: 'an aged vintage antique look', words: ['vintage', 'antique', 'aged', 'distressed', 'retro'] },
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
const ATTR_BY_KEY = new Map([...MATERIALS, ...PATTERNS, ...FINISHES].map((a) => [a.key, a]));

/** Everything a person might type for these tags, used for keyword matching. */
export function tagSearchText(tags = []) {
  return tags
    .flatMap((key) => {
      const type = TYPE_BY_KEY.get(key);
      if (type) return [type.phrase, ...type.words, ...GROUPS[type.group].words];
      const group = GROUPS[key];
      if (group) return [group.phrase, ...group.words];
      if (key === 'n:several') return ['several', 'set', 'group', 'multiple', 'pieces'];
      const entry = COLOR_BY_KEY.get(key) || SHAPE_BY_KEY.get(key) || ATTR_BY_KEY.get(key);
      return entry ? [entry.phrase || entry.key, ...entry.words] : [key];
    })
    .join(' ');
}

const PLURALS = { 'hook and eye': 'hooks and eyes', 'rhinestone cup chain': 'rhinestone cup chains' };
function pluralize(noun) {
  if (PLURALS[noun]) return PLURALS[noun];
  const words = noun.split(' ');
  let last = words.pop();
  if (/(s|x|ch|sh)$/i.test(last)) last += 'es';
  else if (/[^aeiou]y$/i.test(last)) last = `${last.slice(0, -1)}ies`;
  else last += 's';
  return [...words, last].join(' ');
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
  // a pattern ("floral") or, for small objects, a material ("wooden") the noun doesn't already say
  const pattern = tags.map((t) => ATTR_BY_KEY.get(t)).find((a) => a && a.key.startsWith('p:') && a.key !== 'p:solid');
  const material = ['bead', 'button', 'embellishment'].includes(type?.group)
    ? tags.map((t) => ATTR_BY_KEY.get(t)).find((a) => a && a.key.startsWith('m:') && !noun.includes(a.phrase))
    : null;
  const words = [color ? color.phrase || color.key : '', pattern?.phrase || '', material?.phrase || '', shapeWord, noun].filter(Boolean).join(' ');
  // several of a discrete item: say it in the plural ("gold metal O-rings"); trims stay as they are
  const discrete = ['bead', 'button', 'hardware', 'embellishment'].includes(type?.group || (group && Object.keys(GROUPS).find((k) => GROUPS[k] === group)));
  if (tags.includes('n:several') && discrete && !type?.mass && !(!type && group?.mass)) {
    return [color ? color.phrase || color.key : '', pattern?.phrase || '', material?.phrase || '', shapeWord, pluralize(noun)].filter(Boolean).join(' ');
  }
  if (!article || type?.mass || (!type && group?.mass)) return words;
  return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`;
}
