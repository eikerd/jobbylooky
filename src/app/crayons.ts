import type { PhraseKind } from './models';

/** The 48 crayons of the macOS colour picker, in the box's own order: four rows of twelve. */
export const CRAYONS: { name: string; hex: string }[] = [
  ['Cantaloupe', '#ffcc66'], ['Honeydew', '#ccff66'], ['Spindrift', '#66ffcc'], ['Sky', '#66ccff'],
  ['Lavender', '#cc66ff'], ['Carnation', '#ff6fcf'], ['Licorice', '#000000'], ['Snow', '#ffffff'],
  ['Salmon', '#ff6666'], ['Banana', '#ffff66'], ['Flora', '#66ff66'], ['Ice', '#66ffff'],
  ['Orchid', '#6666ff'], ['Bubblegum', '#ff66ff'], ['Lead', '#191919'], ['Mercury', '#e6e6e6'],
  ['Tangerine', '#ff8000'], ['Lime', '#80ff00'], ['Sea Foam', '#00ff80'], ['Aqua', '#0080ff'],
  ['Grape', '#8000ff'], ['Strawberry', '#ff0080'], ['Tungsten', '#333333'], ['Silver', '#cccccc'],
  ['Maraschino', '#ff0000'], ['Lemon', '#ffff00'], ['Spring', '#00ff00'], ['Turquoise', '#00ffff'],
  ['Blueberry', '#0000ff'], ['Magenta', '#ff00ff'], ['Iron', '#4c4c4c'], ['Magnesium', '#b3b3b3'],
  ['Mocha', '#804000'], ['Fern', '#408000'], ['Moss', '#008040'], ['Ocean', '#004080'],
  ['Eggplant', '#400080'], ['Maroon', '#800040'], ['Steel', '#666666'], ['Aluminum', '#999999'],
  ['Cayenne', '#800000'], ['Asparagus', '#808000'], ['Clover', '#008000'], ['Teal', '#008080'],
  ['Midnight', '#000080'], ['Plum', '#800080'], ['Tin', '#7f7f7f'], ['Nickel', '#808080'],
].map(([name, hex]) => ({ name, hex }));

/** Mirrors server/screen.mjs DEFAULT_PHRASE_COLORS, so the first paint is right before the API answers. */
export const DEFAULT_PHRASE_COLORS: Record<PhraseKind, string> = {
  negative: '#ff6666',
  positive: '#66ff66',
  neutral: '#ffff00',
  purple: '#cc66ff',
  pink: '#ff6fcf',
};

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
/** `amount` of the crayon laid over white paper. */
const tint = (rgb: Rgb, amount: number) => rgb.map((value) => 255 - (255 - value) * amount) as Rgb;
const shade = (rgb: Rgb, amount: number) => rgb.map((value) => value * (1 - amount)) as Rgb;
function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/**
 * Any crayon, Snow and Lemon included, becomes three readable tones:
 * mark (highlight behind text), soft (tag fill) and ink (text). Ink is the crayon
 * darkened just enough for 4.5:1 against the mark, so it also passes on soft and on white.
 */
export function crayonTones(hex: string) {
  const crayon = toRgb(hex);
  const mark = tint(crayon, 0.4);
  let ink = crayon;
  for (let amount = 0.05; contrast(ink, mark) < 4.5 && amount <= 1; amount += 0.05) ink = shade(crayon, amount);
  return { mark: toHex(mark), soft: toHex(tint(crayon, 0.18)), ink: toHex(ink) };
}

/** Custom properties (--negative-mark, --pink-ink, …) for every phrase kind, set on the app's host. */
export function phraseColorStyle(colors: Record<PhraseKind, string>) {
  return Object.entries(colors)
    .flatMap(([kind, hex]) => Object.entries(crayonTones(hex)).map(([tone, value]) => `--${kind}-${tone}: ${value}`))
    .join('; ');
}
