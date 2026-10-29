import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMappings,
  heuristicConfidence,
  levenshtein,
  normalizePackageStem,
  normalizeRepoStem,
  parseAwesomeReadme,
  parseManualMapping,
  primaryPackage,
  registryMappings,
  repoFromRepositoryUrl,
  type MappingPair,
} from '../../src/core/mapping.ts';
import type { NpmPackageInfo } from '../../src/core/collectors/npm.ts';

function pkg(name: string, repository: string | null = null): NpmPackageInfo {
  return { name, repository, keywords: [], version: '1.0.0', weekly: null };
}

test('package/repo stems strip scope and the dsh-plugin affixes', () => {
  assert.equal(normalizePackageStem('@scope/dsh-plugin-cost-ledger'), 'cost-ledger');
  assert.equal(normalizePackageStem('dsh-plugin-eco-scan'), 'eco-scan');
  assert.equal(normalizePackageStem('create-dsh-plugin-app'), 'app');
  assert.equal(normalizePackageStem('plugin-archive'), 'archive');
  assert.equal(normalizePackageStem('archive-plugin'), 'archive');
  assert.equal(normalizePackageStem('Foo__Bar'), 'foo-bar');
  assert.equal(normalizeRepoStem('Alice/DSH-Plugin-Eco-Scan'), 'eco-scan');
});

test('levenshtein is exact on small cases', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
});

test('heuristic confidence has explicit tiers and never guesses unrelated names', () => {
  assert.equal(heuristicConfidence('alice/dsh-plugin-cost-ledger', 'dsh-plugin-cost-ledger'), 0.85);
  assert.equal(heuristicConfidence('alice/dsh-plugin-cost-ledger', '@scope/dsh-plugin-cost-ledger'), 0.85);
  assert.equal(heuristicConfidence('alice/dsh-plugin-cost-ledger', 'dsh-plugin-cost-ledger-extra'), 0.6);
  assert.equal(heuristicConfidence('alice/telemetry-kit', 'telemetry-kit'), 0.85);
  assert.equal(heuristicConfidence('alice/telemetri-kit', 'telemetry-kit'), 0.4, 'one typo drops to the fuzzy tier');
  assert.ok(heuristicConfidence('alice/telemetrx', 'telemetry') >= 0.4, 'close spelling still links');
  assert.equal(heuristicConfidence('alice/foo', 'zzz-unrelated'), 0);
  assert.equal(heuristicConfidence('alice/foo', '@scope/bar'), 0);
});

test('manual mapping accepts both the list and the map shape', () => {
  const list = parseManualMapping(`
- repo: Alice/Eco-Scan
  npm: dsh-plugin-eco-scan
- repo: bob/mono
  npm: [pkg-a, pkg-b]
  confidence: 0.8
  source: awesome
- repo: carol/bogus
  npm: pkg-c
  source: totally-not-a-source
`);
  assert.deepEqual(list, [
    { repoId: 'alice/eco-scan', npmName: 'dsh-plugin-eco-scan', confidence: 1, source: 'manual' },
    { repoId: 'bob/mono', npmName: 'pkg-a', confidence: 0.8, source: 'awesome' },
    { repoId: 'bob/mono', npmName: 'pkg-b', confidence: 0.8, source: 'awesome' },
    { repoId: 'carol/bogus', npmName: 'pkg-c', confidence: 1, source: 'manual' },
  ]);
  assert.deepEqual(parseManualMapping('{}'), []);
  assert.deepEqual(parseManualMapping('dave/x: dsh-plugin-x'), [
    { repoId: 'dave/x', npmName: 'dsh-plugin-x', confidence: 1, source: 'manual' },
  ]);
  assert.deepEqual(parseManualMapping(''), []);
});

test('awesome readme lines yield repo→npm pairs at 0.95', () => {
  const pairs = parseAwesomeReadme(`
| [Eco Scan](https://github.com/Alice/eco-scan) | [npm](https://www.npmjs.com/package/dsh-plugin-eco-scan) |
- [Memory](https://github.com/bob/memory-kit) — [npm](https://www.npmjs.com/package/@scope/memory-kit) [alt](https://www.npmjs.com/package/memory-kit-cli)
no links here
`);
  assert.deepEqual(
    pairs.map((pair) => `${pair.repoId}=>${pair.npmName}`),
    ['alice/eco-scan=>dsh-plugin-eco-scan', 'bob/memory-kit=>@scope/memory-kit', 'bob/memory-kit=>memory-kit-cli'],
  );
  assert.ok(pairs.every((pair) => pair.confidence === 0.95 && pair.source === 'awesome'));
});

test('package.json repository URLs become exact mappings', () => {
  assert.equal(repoFromRepositoryUrl('git+https://github.com/Owner/Repo.git'), 'owner/repo');
  assert.equal(repoFromRepositoryUrl('git@github.com:Owner/Repo.git'), 'owner/repo');
  assert.equal(repoFromRepositoryUrl('github:Owner/Repo'), 'owner/repo');
  assert.equal(repoFromRepositoryUrl('https://github.com/Owner/Repo/tree/main/packages/x'), 'owner/repo');
  assert.equal(repoFromRepositoryUrl('https://gitlab.com/o/r'), null);
  assert.equal(repoFromRepositoryUrl(null), null);
  const pairs = registryMappings([pkg('dsh-plugin-x', 'https://github.com/alice/x'), pkg('no-repo')]);
  assert.deepEqual(pairs, [{ repoId: 'alice/x', npmName: 'dsh-plugin-x', confidence: 1, source: 'registry' }]);
});

test('authoritative sources win and heuristics only fill uncovered repos', () => {
  const manual: MappingPair[] = [{ repoId: 'alice/tool', npmName: 'tool-manual', confidence: 1, source: 'manual' }];
  const result = buildMappings({
    repoIds: ['alice/tool', 'bob/registry', 'carol/heuristic-tool', 'dave/none'],
    packages: [
      pkg('tool-manual'),
      pkg('tool-heuristic'),
      pkg('dsh-plugin-registry', 'https://github.com/bob/registry'),
      pkg('heuristic-tool'),
    ],
    manual,
  });
  const forRepo = (repoId: string): string[] => result.mapping.filter((row) => row.repoId === repoId).map((row) => `${row.npmName}:${row.source}`);
  assert.deepEqual(forRepo('alice/tool'), ['tool-manual:manual'], 'manual row blocks heuristic in-fill');
  assert.deepEqual(forRepo('bob/registry'), ['dsh-plugin-registry:registry']);
  assert.deepEqual(forRepo('carol/heuristic-tool'), ['heuristic-tool:heuristic']);
  assert.deepEqual(result.unmatched, ['dave/none']);
  assert.deepEqual(result.ambiguous, []);
});

test('tied heuristics are reported as ambiguous and resolved deterministically', () => {
  const result = buildMappings({
    repoIds: ['alice/web-tool'],
    packages: [pkg('web-tool-b'), pkg('web-tool-a')],
  });
  assert.deepEqual(result.ambiguous, [{ repoId: 'alice/web-tool', candidates: ['web-tool-a', 'web-tool-b'] }]);
  assert.equal(result.mapping[0]?.npmName, 'web-tool-a');
  assert.equal(result.unmatched.length, 0);
});

test('heuristicFloor filters weak candidates', () => {
  const result = buildMappings({ repoIds: ['alice/telemetrx'], packages: [pkg('telemetry')], heuristicFloor: 0.5 });
  assert.deepEqual(result.unmatched, ['alice/telemetrx']);
});

test('primary package prefers confidence, then manual provenance', () => {
  const rows = [
    { repoId: 'a/b', npmName: 'heuristic', confidence: 0.6, source: 'heuristic' as const },
    { repoId: 'a/b', npmName: 'registry', confidence: 1, source: 'registry' as const },
    { repoId: 'a/b', npmName: 'manual', confidence: 1, source: 'manual' as const },
  ];
  assert.equal(primaryPackage(rows)?.npmName, 'manual');
  assert.equal(primaryPackage([]), null);
});
