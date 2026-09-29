import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapshotStore } from '../src/eco/snapshot.ts';
import { rankGrowth } from '../src/eco/growth.ts';
import type { EcoRepo } from '../src/eco/segment.ts';

const repo: EcoRepo = { fullName: 'x/dsh-plugin-cost-ledger', description: 'ledger', stars: 5, createdAt: '2026-01-01', pushedAt: '2026-09-01', npmWeekly: 100 };

test('snapshots accumulate across days and dedupe per date', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eco-'));
  const store = new SnapshotStore(dir);
  store.append(repo, 'cost-budget', '2026-09-28');
  store.append({ ...repo, npmWeekly: 130 }, 'cost-budget', '2026-09-29');
  store.append({ ...repo, npmWeekly: 130 }, 'cost-budget', '2026-09-29'); // same-day rescan overwrites
  const series = store.series();
  assert.equal(series.length, 1);
  assert.equal(series[0]!.points.length, 2); // 09-28 + one 09-29
  const rows = rankGrowth(series);
  assert.equal(rows[0]!.delta, 30);
  rmSync(dir, { recursive: true, force: true });
});

test('torn lines are skipped and counted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eco-'));
  const store = new SnapshotStore(dir);
  store.append(repo, 'cost-budget', '2026-09-28');
  const file = join(dir, 'snapshots-2026-09.jsonl');
  writeFileSync(file, readFileSync(file, 'utf8') + 'torn\n');
  const all = store.readAll();
  assert.equal(all.records.length, 1);
  assert.equal(all.skipped, 1);
  rmSync(dir, { recursive: true, force: true });
});


