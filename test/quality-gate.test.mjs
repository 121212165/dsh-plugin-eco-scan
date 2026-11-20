import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  isArchived, isLowSignal, passesQualityGate, gateStats,
  mainBoard, excludedSamples, assertCleanBoard,
} from '../data/quality-gate.mjs';

const D = JSON.parse(readFileSync(new URL('../data/eco-data.json', import.meta.url), 'utf8'));
const { rows } = D;
const row = (over = {}) => {
  const r = Array(18).fill(null);
  r[0] = 'o/r'; r[1] = 50; r[2] = 10; r[3] = 100; r[8] = 0; r[11] = 1; r[17] = 'o';
  Object.assign(r, over); // numeric keys overwrite by index
  return r;
};

test('gate predicates classify synthetic archived / low-coverage / clean rows', () => {
  assert.equal(isArchived(row({ 8: 1 })), true);
  assert.equal(isArchived(row({ 8: 0 })), false);
  assert.equal(isLowSignal(row({ 11: 0.1 })), true);
  assert.equal(isLowSignal(row({ 11: 0.4 })), false);
  assert.equal(isLowSignal(row({ 11: null })), true); // missing coverage is not clean
  assert.equal(passesQualityGate(row({ 8: 1, 11: 1 })), false);
  assert.equal(passesQualityGate(row({ 8: 0, 11: 0.1 })), false);
  assert.equal(passesQualityGate(row()), true);
});

test('synthetic main board drops gated rows before sorting by score', () => {
  const rows2 = [
    row({ 0: 'clean/low', 1: 10, 8: 0, 11: 1 }),
    row({ 0: 'arch/high', 1: 99, 8: 1, 11: 1 }),
    row({ 0: 'shell/high', 1: 98, 8: 0, 11: 0.1 }),
    row({ 0: 'clean/high', 1: 90, 8: 0, 11: 1 }),
  ];
  assert.deepEqual(mainBoard(rows2, 10).map((r) => r[0]), ['clean/high', 'clean/low']);
  assert.deepEqual(assertCleanBoard(mainBoard(rows2, 10)), { checked: 2, archived: 0, lowSignal: 0 });
});

test('real snapshot: archived and coverage<0.4 counts match the confirmed corpus', () => {
  const g = gateStats(rows);
  assert.equal(g.total, 38549);
  assert.equal(g.archived, 415);
  assert.equal(g.lowSignal, 19524);
  assert.equal(g.eligible, rows.length - g.excluded);
});

test('real snapshot: no archived or low-signal shell enters the main board', () => {
  const board = mainBoard(rows, 60);
  assert.deepEqual(assertCleanBoard(board), { checked: 60, archived: 0, lowSignal: 0 });
  const ids = new Set(board.map((r) => r[0]));
  assert.ok(!ids.has('perrylink/dsh-session-pin'), 'archived 82.9 repo must not appear');
  const bestLow = rows.filter((r) => (r[11] ?? 0) < 0.4).sort((a, b) => b[1] - a[1])[0];
  assert.ok(!ids.has(bestLow[0]), `best low-coverage shell ${bestLow[0]} must not appear`);
  assert.ok(excludedSamples(rows, 3).archived.some((r) => r[0] === 'perrylink/dsh-session-pin'));
});
