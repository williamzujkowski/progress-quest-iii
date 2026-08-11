export function plural(value: string): string {
  if (value.endsWith('y')) return `${value.slice(0, -1)}ies`;
  if (value.endsWith('us')) return `${value.slice(0, -2)}i`;
  if (['ch', 'x', 's', 'sh'].some((suffix) => value.endsWith(suffix))) return `${value}es`;
  if (value.endsWith('f')) return `${value.slice(0, -1)}ves`;
  if (value.endsWith('man') || value.endsWith('Man')) return `${value.slice(0, -2)}en`;
  return `${value}s`;
}

export function indefinite(value: string, quantity = 1): string {
  if (quantity !== 1) return `${formatGameNumber(quantity)} ${plural(value)}`;
  const article = 'AEIOUÜaeiouü'.includes(value.charAt(0)) ? 'an' : 'a';
  return `${article} ${value}`;
}

export function definite(value: string, quantity = 1): string {
  return `the ${quantity === 1 ? value : plural(value)}`;
}

export function stableIndex(key: string, length: number): number {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('Stable index requires a positive safe length');
  let hash = 7;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % length;
}

/**
 * A stable index whose low bits actually vary.
 *
 * `stableIndex` multiplies by 31, which is odd, so its result modulo two depends only on the
 * parity of the key's character-code sum. That is invisible at most lengths and decisive at
 * length two: two keys differing only by a short suffix pick the same option whenever the
 * suffixes share a parity, so choices that should be independent move in lockstep.
 *
 * This adds a final avalanche so the low bits depend on the whole key. Kept separate rather than
 * folded into `stableIndex`, because that function's outputs are baked into the item catalogue,
 * the world bulletins and the legacy fixtures — changing it would rewrite text everywhere to fix
 * a defect in one place.
 */
export function stableChoice(key: string, length: number): number {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('Stable choice requires a positive safe length');
  let hash = 7;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  // xorshift-multiply finish, so every input bit reaches the bottom of the word.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  // XOR yields a signed 32-bit value, so this must return to unsigned before the modulo — without
  // it a negative hash produces a negative index and an undefined option, which is how this was
  // caught rather than shipped.
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % length;
}

const SCIENTIFIC_NOTATION_THRESHOLD = 1_000_000;
const MAX_ORDINARY_CHARACTERS = 6;
const MAX_SPOKEN_CHARACTERS = 40;
const ordinaryFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  useGrouping: false,
});
const scientificFormatter = new Intl.NumberFormat('en-US', {
  notation: 'scientific',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});
const spokenFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'long',
  maximumSignificantDigits: 3,
});

/**
 * The largest currency total still written in plain digits.
 *
 * Stated here rather than imported from `data/limits`, because this module has no imports and is a
 * leaf on purpose. The value is the persisted ceiling; ordinary play never approaches it, since the
 * equipment sink pins gold below 5L² — about 1.3e8 at the maximum finite level — so the exponent
 * form is a guard against an imported save rather than something a player reaches.
 */
const CURRENCY_PLAIN_CEILING = 1_000_000_000;

const groupedFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true });

/**
 * A currency total, in plain grouped digits for as long as it can be.
 *
 * `formatGameNumber` crosses into scientific notation at a million, and that threshold is right for
 * the surface it was built for: an act of a million is an index, and `Loading Act 1.00e6...` reads
 * correctly. A gold total is not an index — it is the reward for about twenty-seven days of play,
 * and `1.16e6` is the smallest a million has ever looked.
 *
 * Diablo III made the same call for damage numbers, deliberately counting in millions rather than
 * crossing into billions, on the grounds that seeing 1,000M tells a better story than 1B. The
 * emotional size of a number is a design variable independent of its numeric size.
 *
 * Grouped, because plain digits alone are not an improvement: `127474005` is harder to read than
 * the exponent it replaces, and `127,474,005` is not.
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > CURRENCY_PLAIN_CEILING) return formatGameNumber(value);
  const grouped = groupedFormatter.format(value);
  return grouped === '-0' ? '0' : grouped;
}

function ordinaryGameNumber(value: number): string {
  const formatted = ordinaryFormatter.format(value);
  return formatted === '-0' ? '0' : formatted;
}

function shouldUseScientificNotation(value: number, ordinary: string): boolean {
  return (value !== 0 && Number(ordinary) === 0)
    || Math.abs(value) >= SCIENTIFIC_NOTATION_THRESHOLD
    || ordinary.length > MAX_ORDINARY_CHARACTERS;
}

function describeScientificGameNumber(value: number): string {
  const [mantissa, exponent = '0'] = formatGameNumber(value).split('e');
  const exponentValue = Number(exponent);
  return `${mantissa} times 10 to the ${exponentValue < 0 ? 'negative ' : ''}${Math.abs(exponentValue)}`;
}

/**
 * The plain form, or null when the value genuinely has more magnitude than digits can carry.
 *
 * The second attempt is the point. A five-digit figure with a fraction — plot progress is one —
 * exceeds the character budget on its decimals alone, and used to fall through to "1.53e4": longer
 * to read than "15300", less precise than it, and printed beside a denominator still in plain
 * digits. The budget is there to stop unreadable strings, not to demote ordinary numbers that
 * happen to carry a remainder, so the remainder is what gets rounded away.
 *
 * Rounded, not truncated, and the difference is load-bearing at the top of the range: 999999.9999
 * truncates to 999999, which reports a value below a threshold it has effectively reached and
 * contradicts the spoken form's "1 million". Rounding carries it to 1000000, which is over budget,
 * so it stays scientific — which is the answer that was already correct.
 *
 * Both callers go through here so the printed and spoken forms cannot disagree about which values
 * are still writable.
 */
function plainGameNumber(value: number): string | null {
  const ordinary = ordinaryGameNumber(value);
  if (!shouldUseScientificNotation(value, ordinary)) return ordinary;
  const whole = ordinaryGameNumber(Math.round(value));
  return shouldUseScientificNotation(value, whole) ? null : whole;
}

export function formatGameNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return plainGameNumber(value) ?? scientificFormatter.format(value).replace('E', 'e');
}

export function describeGameNumber(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable';
  const plain = plainGameNumber(value);
  if (plain !== null) return plain;
  const spoken = spokenFormatter.format(value);
  return spoken.length <= MAX_SPOKEN_CHARACTERS ? spoken : describeScientificGameNumber(value);
}

/**
 * A duration, at the precision the figure actually supports.
 *
 * Coarse on purpose. These come from projections over a sampled rate, and reporting "4h 12m 37s"
 * would dress a five-minute average up as a stopwatch reading. Two units at most, and seconds
 * only when there is nothing larger to report.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours < 24) return remainderMinutes === 0 ? `${hours}h` : `${hours}h ${remainderMinutes}m`;

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours === 0 ? `${days}d` : `${days}d ${remainderHours}h`;
}

// ponytail: shared by the social and world projections, which both truncate by code
// point so a surrogate pair is never split in half, at the same shared limit.
export const MAX_TEXT_CODE_POINTS = 180;

export function boundCodePoints(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

/**
 * A name cut to a length a line can hold, with a fallback for an empty one.
 *
 * Lived in `itemDetails` while the tooltips were its only caller. The market scene now quotes an
 * item's name too, and an imported save can carry a name of any length — so the bound belongs
 * beside the other text limits rather than in one consumer that happens to have needed it first.
 */
export const boundedLabel = (name: string, fallback: string, limit = 60): string => {
  const characters = Array.from(name);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : name || fallback;
};

/**
 * Code points no displayed string may contain, whatever its length.
 *
 * The C0 and C1 ranges because a control character in a name reaches the DOM as one. The bidi
 * formatting characters because U+202E reverses the rest of the line it lands in — names are
 * interpolated into guild chatter and printed on the world console, so one of them rewrites text
 * the player never typed. React escapes markup; it does not escape these.
 *
 * Written as a predicate over code points rather than a character class, because a regex matching
 * control characters is what `no-control-regex` exists to flag, and the rule fires whether the class
 * is spelled with literals or with escapes.
 *
 * Lives here rather than beside the save schema so the boundary that rejects these and the tests
 * that assert the shipped catalogues are free of them read the same rule. The two used to be
 * written separately, and the test half was checking `JSON.stringify` output — which escapes every
 * code point below 0x20 into `\uXXXX`, so half of it could never fail.
 */
const isForbiddenCodePoint = (point: number): boolean =>
  point <= 0x1f // C0 controls
  || (point >= 0x7f && point <= 0x9f) // delete and the C1 controls
  || point === 0x200e || point === 0x200f // left-to-right and right-to-left marks
  || (point >= 0x202a && point <= 0x202e) // the embedding and override run, U+202E among them
  || (point >= 0x2066 && point <= 0x2069); // the isolates

export const isUnrenderable = (value: string): boolean => {
  // Iterated by code point rather than by UTF-16 unit, so an astral character is never split into
  // surrogates and mistaken for something in a forbidden range.
  for (const character of value) {
    if (isForbiddenCodePoint(character.codePointAt(0) ?? 0)) return true;
  }
  return false;
};
