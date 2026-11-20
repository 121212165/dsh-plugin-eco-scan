/** Positional row schema — source of truth: data/DATA-DICTIONARY.md §1.
 *  Every analysis module imports these constants instead of re-deriving column
 *  indices by hand (issue #6 / #13: hand-written mappings caused silent bugs). */

export const ROW = Object.freeze({
  ID: 0,
  SCORE: 1,
  STARS: 2,
  WEEKLY: 3,
  GROWTH: 4,
  AGE: 5,
  SEG: 6,
  ACTIVITY: 7,
  ARCHIVED: 8,
  TAGS: 9,
  ENRICHED: 10,
  COVERAGE: 11,
  LOWSIGNAL: 12,
  STARVEL: 13,
  DESCRIPTION: 14,
  LICENSE: 15,
  VERSION: 16,
  OWNER: 17,
});

export const ROW_WIDTH = 18;

/** Percentile helper shared by digest and the taxonomy rollups. */
export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

/** Stats over a slice of rows. `null` means "no observation", never 0. */
export function stats(list) {
  const stars = list.map((r) => r[ROW.STARS]).filter((x) => x != null);
  const weekly = list.map((r) => r[ROW.WEEKLY]).filter((x) => x > 0);
  const growth = list.map((r) => r[ROW.GROWTH]).filter((x) => x != null && Number.isFinite(x));
  const ages = list.map((r) => r[ROW.AGE]).filter((x) => x != null);
  return {
    n: list.length,
    starsMedian: pct(stars, 0.5),
    starsP90: pct(stars, 0.9),
    weeklyMedian: pct(weekly, 0.5),
    weeklyP90: pct(weekly, 0.9),
    weeklySum: weekly.reduce((a, b) => a + b, 0),
    growthMedian: growth.length ? pct(growth, 0.5) : null,
    growthPositive: growth.filter((x) => x > 0).length,
    new30: ages.filter((x) => x <= 30).length,
  };
}
