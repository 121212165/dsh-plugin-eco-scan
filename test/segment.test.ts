import assert from 'node:assert/strict';
import { test } from 'node:test';
import { segmentOf, segmentStats, renderSegments, type EcoRepo } from '../src/eco/segment.ts';

const repo = (over: Partial<EcoRepo>): EcoRepo => ({
  fullName: 'a/b',
  description: '',
  stars: 10,
  createdAt: '2026-01-01',
  pushedAt: '2026-09-01',
  ...over,
});

test('segmentation classifies by keyword with first-match-wins', () => {
  assert.equal(segmentOf(repo({ fullName: 'x/dsh-plugin-cost-ledger', description: 'persistent cost ledger' })), 'cost-budget');
  assert.equal(segmentOf(repo({ fullName: 'x/dsh-token-telemetry', description: 'token throughput telemetry' })), 'telemetry-analytics');
  assert.equal(segmentOf(repo({ fullName: 'x/memos', description: 'self-evolving memory layer' })), 'memory-context');
  assert.equal(segmentOf(repo({ fullName: 'x/dsh-desktop', description: 'desktop client' })), 'ui-client');
  assert.equal(segmentOf(repo({ fullName: 'x/dsh-plugin-transcript', description: 'transcript archive' })), 'archive-export');
  assert.equal(segmentOf(repo({ fullName: 'x/quant-kb', description: 'nothing matching' })), 'other');
});

test('cost beats telemetry when both match (ordered rules)', () => {
  assert.equal(segmentOf(repo({ fullName: 'x/dsh-plugin-cost-telemetry' })), 'cost-budget');
});

test('segmentStats aggregate and rank by downloads then stars', () => {
  const stats = segmentStats([
    repo({ fullName: 'a/cost', description: 'cost ledger', stars: 10, npmWeekly: 5 }),
    repo({ fullName: 'a/cost2', description: 'budget tool', stars: 30, npmWeekly: 0 }),
    repo({ fullName: 'a/ui', description: 'dashboard ui', stars: 100, npmWeekly: 50 }),
  ]);
  assert.equal(stats[0]!.segment, 'ui-client'); // 50 downloads wins
  assert.equal(stats[0]!.repos, 1);
  const cost = stats.find((stat) => stat.segment === 'cost-budget')!;
  assert.equal(cost.repos, 2);
  assert.equal(cost.stars, 40);
  assert.equal(cost.medianStars, 20); // (10+30)/2
});

test('render is readable and includes every segment', () => {
  const text = renderSegments(segmentStats([repo({ description: 'cost ledger' }), repo({ description: 'dashboard' })]));
  assert.ok(text.includes('成本与预算'));
  assert.ok(text.includes('UI 与客户端'));
});
