import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchPattern,
  isUnmappedId,
  searchCandidates,
  shapeSuggestions,
} from './searchQuery.js';

test('searchCandidates tries catchment then flowpath then the bare number for a numeric id', () => {
  assert.deepEqual(searchCandidates('123'), ['cat-123', 'wb-123', '123']);
});

test('searchCandidates passes a non-numeric id through, trimmed and lowercased', () => {
  assert.deepEqual(searchCandidates('  CAT-42  '), ['cat-42']);
  assert.deepEqual(searchCandidates('wb-9'), ['wb-9']);
});

test('searchCandidates yields nothing for empty input or an unmapped nexus family id', () => {
  assert.deepEqual(searchCandidates(''), []);
  assert.deepEqual(searchCandidates('   '), []);
  assert.deepEqual(searchCandidates(null), []);
  assert.deepEqual(searchCandidates('nex-5'), []);
  assert.deepEqual(searchCandidates('tnx-5'), []);
  assert.deepEqual(searchCandidates('cnx-5'), []);
  assert.deepEqual(searchCandidates('inx-5'), []);
});

test('isUnmappedId is true only for the nexus family prefixes', () => {
  assert.equal(isUnmappedId('nex-1'), true);
  assert.equal(isUnmappedId('TNX-1'), true);
  assert.equal(isUnmappedId('cat-1'), false);
  assert.equal(isUnmappedId('wb-1'), false);
  assert.equal(isUnmappedId('123'), false);
  assert.equal(isUnmappedId(''), false);
});

test('buildSearchPattern matches a bare number by suffix so cat-/wb-/bare forms all surface', () => {
  assert.equal(buildSearchPattern('123'), '%123');
});

test('buildSearchPattern matches anything else by prefix', () => {
  assert.equal(buildSearchPattern('cat-1'), 'cat-1%');
  assert.equal(buildSearchPattern('  WB-9 '), 'wb-9%');
});

test('buildSearchPattern is empty for empty input', () => {
  assert.equal(buildSearchPattern(''), '');
  assert.equal(buildSearchPattern('   '), '');
  assert.equal(buildSearchPattern(null), '');
});

test('buildSearchPattern escapes the LIKE wildcards in a typed value', () => {
  assert.equal(buildSearchPattern('cat_1'), 'cat\\_1%');
  assert.equal(buildSearchPattern('a%b'), 'a\\%b%');
  assert.equal(buildSearchPattern('a\\b'), 'a\\\\b%');
});

test('shapeSuggestions trims, de-duplicates, drops unmapped ids, and preserves order', () => {
  const ids = ['123', 'cat-123', 'cat-123', ' wb-123 ', 'nex-9', 'tnx-1'];
  assert.deepEqual(shapeSuggestions(ids), ['123', 'cat-123', 'wb-123']);
});

test('shapeSuggestions caps at the limit', () => {
  assert.deepEqual(shapeSuggestions(['a', 'b', 'c', 'd'], { limit: 2 }), ['a', 'b']);
});

test('shapeSuggestions tolerates non-array input', () => {
  assert.deepEqual(shapeSuggestions(null), []);
  assert.deepEqual(shapeSuggestions(undefined), []);
});
