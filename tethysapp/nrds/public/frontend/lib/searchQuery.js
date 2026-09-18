/**
 * The pure decisions behind the feature-id search box (migration unit U5d), kept clear of DuckDB and
 * the DOM so they can be unit-tested without either. Ported from the React DataStream lib/utils
 * `searchCandidates`, plus the typeahead shaping the vanilla search box needs: the LIKE pattern a
 * typed prefix becomes, the ids worth showing as suggestions, and the unmapped-id predicate that
 * drops rows the map can no longer place.
 */

const ID_PREFIXES = ['cat', 'wb'];

const UNMAPPED_PREFIXES = /^(nex|tnx|cnx|inx)-/;

/** Whether an id names something the map can no longer draw, so it is not worth offering or flying to. */
export const isUnmappedId = (id) => UNMAPPED_PREFIXES.test(String(id ?? '').trim().toLowerCase());

/** The ids worth looking for, given whatever was typed. A bare number is tried as a catchment first,
 * then its flowpath, then the raw number; an unmapped prefix yields nothing to look up. */
export const searchCandidates = (input) => {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return [];
  if (UNMAPPED_PREFIXES.test(trimmed)) return [];
  if (!/^\d+$/.test(trimmed)) return [trimmed];
  return [...ID_PREFIXES.map((prefix) => `${prefix}-${trimmed}`), trimmed];
};

/** Escape the characters DuckDB's LIKE treats as wildcards, so a typed id matches itself literally. */
const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The LIKE pattern a typed value becomes for the typeahead. A bare number matches by suffix, so the
 * candidate forms (`cat-123`, `wb-123`, `123`) all surface; anything else matches by prefix, so
 * typing `cat-` or `wb-98` narrows as expected. Returns '' for empty input (no query worth running).
 */
export const buildSearchPattern = (input) => {
  const trimmed = String(input ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const escaped = escapeLike(trimmed);
  return /^\d+$/.test(trimmed) ? `%${escaped}` : `${escaped}%`;
};

/**
 * Shape raw ids from the index into the suggestions the listbox shows: trimmed, de-duplicated,
 * with the unmapped nexus family dropped, and capped at `limit`. Order is preserved, so the query's
 * own ordering (shortest id first) decides what a reader sees.
 */
export const shapeSuggestions = (ids, { limit = 8 } = {}) => {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw ?? '').trim();
    if (!id || isUnmappedId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
};
