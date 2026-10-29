import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { renderScanReport, runScan } from '../../src/core/scan.ts';
import { HttpClient } from '../../src/core/http.ts';
import {
  allMappings,
  getReleaseCache,
  getRepo,
  npmStat,
  segmentsForRepo,
  snapshotDates,
  snapshotsForDate,
  startScan,
  updateScan,
} from '../../src/core/storage.ts';
import { bodyOf, githubNode, response, scriptedFetch } from './fake-http.ts';
import { seedRepo, tempDb, work } from './helpers.ts';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const REPO = 'Alice/DSH-Plugin-Eco-Scan';

function router(url: string, init: RequestInit): Response {
  if (url === 'https://api.github.com/graphql') {
    const body = bodyOf(init);
    const query = String(body.query);
    if (query.includes('EcoSearch')) {
      return response({
        data: {
          search: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              githubNode(REPO, {
                description: 'market analytics dashboard for plugin ecosystem',
                repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }] },
              }),
            ],
          },
        },
      });
    }
    if (query.includes('EcoDetails')) {
      return response({
        data: {
          nodes: [
            githubNode(REPO, {
              id: 'node-Alice/DSH-Plugin-Eco-Scan',
              workflows: { entries: [{ name: 'ci.yml' }] },
              testdir: { entries: [{ name: 'a.test.ts' }, { name: 'b.test.ts' }] },
              testsdir: null,
              mentionableUsers: { totalCount: 3 },
              recentIssues: { nodes: [{ createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-01T06:00:00Z' }] },
            }),
          ],
        },
      });
    }
    return response({ errors: [{ message: 'unknown query' }] });
  }
  if (url.includes('registry.npmjs.org/-/v1/search')) {
    const from = Number(/[?&]from=(\d+)/.exec(url)?.[1] ?? '0');
    if (from !== 0) return response({ objects: [] });
    return response({
      objects: [
        {
          package: {
            name: 'dsh-plugin-eco-scan',
            version: '0.1.0',
            keywords: ['dsh-plugin'],
            links: { repository: 'https://github.com/alice/dsh-plugin-eco-scan' },
            downloads: { weekly: 50, monthly: 200 },
          },
        },
      ],
    });
  }
  if (url.includes('api.npmjs.org/downloads/point/')) {
    if (url.includes('2026-10-15:2026-10-21')) return response({ 'dsh-plugin-eco-scan': { downloads: 28 } });
    return response({ 'dsh-plugin-eco-scan': { downloads: 77 } });
  }
  if (url.includes('api.npmjs.org/downloads/range/')) {
    return response({
      downloads: Array.from({ length: 14 }, (_, index) => ({ day: `2026-10-${String(index + 15).padStart(2, '0')}`, downloads: index + 1 })),
    });
  }
  if (url.includes('/releases')) {
    return response([{ assets: [{ download_count: 12 }, { download_count: 3 }] }], { headers: { etag: 'rel-1' } });
  }
  return response('not found', { status: 404 });
}

function client(fetchImpl: typeof globalThis.fetch, retries = 0): HttpClient {
  return new HttpClient({ fetch: fetchImpl, retries, sleep: async () => {} });
}

test('a full scan collects GitHub, npm and releases into a consistent snapshot', async () => {
  const { db } = tempDb();
  const dataDir = join(work, `scan-full-${Math.random().toString(36).slice(2)}`);
  const report = await runScan(db, {
    dataDir,
    token: 'tok',
    now: NOW,
    http: client(scriptedFetch(router).fetch),
    releaseBudget: 10,
  });

  assert.equal(report.status, 'ok', report.errors.join(' | '));
  assert.deepEqual(report.errors, []);
  assert.equal(report.repos, 1);
  assert.equal(report.npmPackages, 1);
  assert.equal(report.mappings, 1);
  assert.equal(report.unmatched, 0);
  assert.equal(report.ambiguous, 0);
  assert.equal(report.corpusComplete, true);
  assert.equal(report.via, 'graphql');
  assert.equal(report.date, '2026-10-29');
  assert.equal(report.paths.dbPath, join(dataDir, 'eco.db'));

  assert.deepEqual(report.coverage, { repos: 1, mapped: 1, withWeekly: 1, withReleases: 1 });
  assert.equal(snapshotDates(db)[0], '2026-10-29');
  const snap = snapshotsForDate(db, '2026-10-29')[0];
  assert.equal(snap?.repoId, 'alice/dsh-plugin-eco-scan');
  assert.equal(snap?.npmWeekly, 77);
  assert.equal(snap?.releaseDownloads, 15);
  assert.equal(snap?.segment, 'telemetry-analytics');

  const repo = getRepo(db, 'alice/dsh-plugin-eco-scan');
  assert.equal(repo?.stars, 100);
  assert.equal(repo?.ci, true);
  assert.equal(repo?.testsCount, 2);
  assert.equal(repo?.contributors, 3);
  assert.equal(repo?.issueCloseHours, 6);

  assert.deepEqual(allMappings(db), [
    { repoId: 'alice/dsh-plugin-eco-scan', npmName: 'dsh-plugin-eco-scan', confidence: 1, source: 'registry' },
  ]);
  assert.equal(npmStat(db, 'dsh-plugin-eco-scan')?.weekly, 77);
  assert.equal(getReleaseCache(db, 'alice/dsh-plugin-eco-scan')?.downloads, 15);

  const labels = segmentsForRepo(db, 'alice/dsh-plugin-eco-scan').map((label) => label.segment);
  assert.equal(labels[0], 'telemetry-analytics');
  assert.ok(labels.includes('ui-client'), `multi-label keeps the dashboard hit: ${labels.join(',')}`);
  assert.equal(report.top.length, 1);
  assert.equal(report.top[0]?.repoId, 'alice/dsh-plugin-eco-scan');

  const text = renderScanReport(report);
  assert.ok(text.includes('dsh 插件生态 2026-10-29'));
  assert.ok(text.includes('alice/dsh-plugin-eco-scan'));
  assert.ok(text.includes('数据库'));
});

test('resume skips completed stages and still writes the snapshot', async () => {
  const { db } = tempDb();
  const dataDir = join(work, `scan-resume-${Math.random().toString(36).slice(2)}`);
  const scanId = startScan(db, '2026-10-29', NOW.toISOString());
  updateScan(db, scanId, { stage: 'npm', checkpoint: { done: ['corpus', 'details', 'npm'], date: '2026-10-29' } });
  seedRepo(db, 'alice/resumed', { stars: 5 });

  let calls = 0;
  const report = await runScan(db, {
    dataDir,
    resume: true,
    skipReleases: true,
    now: NOW,
    http: client(scriptedFetch(() => {
      calls += 1;
      return response('should not be called', { status: 500 });
    }).fetch),
  });

  assert.equal(calls, 0, 'no collector runs when corpus/details/npm are already checkpointed');
  assert.equal(report.resumed, true);
  assert.equal(report.status, 'ok');
  assert.equal(report.repos, 1);
  assert.equal(snapshotsForDate(db, '2026-10-29').length, 1);
  assert.equal(snapshotsForDate(db, '2026-10-29')[0]?.repoId, 'alice/resumed');
});

test('a dead corpus without a token fails cleanly instead of writing an empty snapshot', async () => {
  const { db } = tempDb();
  const dataDir = join(work, `scan-dead-${Math.random().toString(36).slice(2)}`);
  const report = await runScan(db, {
    dataDir,
    now: NOW,
    restPacingMs: 0,
    http: client(scriptedFetch(() => response('nope', { status: 500 })).fetch),
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.repos, 0);
  assert.equal(report.corpusComplete, false);
  assert.ok(report.errors.length > 0);
  assert.equal(snapshotsForDate(db, '2026-10-29').length, 0);
  assert.equal(report.top.length, 0);
  assert.ok(report.errors.some((message) => message.includes('corpus')));
  const persisted = db.raw.prepare('SELECT stage, message FROM scan_errors').all() as { stage: string; message: string }[];
  assert.ok(persisted.length > 0, 'stage failures are persisted for /eco-health, not only returned in the report');
  assert.ok(persisted.every((row) => row.stage === 'corpus'));
});

test('a dead npm stage is reported instead of storing zero packages silently', async () => {
  const { db } = tempDb();
  const dataDir = join(work, `scan-npm-dead-${Math.random().toString(36).slice(2)}`);
  const report = await runScan(db, {
    dataDir,
    token: 'tok',
    now: NOW,
    skipReleases: true,
    http: client(scriptedFetch((url, init) => {
      if (url === 'https://api.github.com/graphql' && String(bodyOf(init).query).includes('EcoSearch')) {
        return response({
          data: { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [githubNode(REPO, { description: 'plugin tool' })] } },
        });
      }
      if (url === 'https://api.github.com/graphql') return response('no details', { status: 500 });
      return response('npm down', { status: 503 });
    }).fetch),
  });

  assert.equal(report.status, 'partial');
  assert.equal(report.repos, 1);
  assert.equal(report.npmPackages, 0);
  assert.ok(report.errors.some((message) => message.startsWith('npm:')), report.errors.join(' | '));
  assert.equal(snapshotsForDate(db, '2026-10-29').length, 1, 'the repo still gets a snapshot, just without npm data');
});

test('scan releases stage is bounded by the budget and cached with its ETag', async () => {
  const { db } = tempDb();
  const dataDir = join(work, `scan-budget-${Math.random().toString(36).slice(2)}`);
  const scripted = scriptedFetch(router);
  const report = await runScan(db, {
    dataDir,
    token: 'tok',
    now: NOW,
    http: client(scripted.fetch),
    releaseBudget: 1,
  });
  assert.equal(report.status, 'ok');
  const releaseCalls = scripted.calls.filter((call) => call.url.includes('/releases'));
  assert.equal(releaseCalls.length, 1);
  assert.equal(getReleaseCache(db, 'alice/dsh-plugin-eco-scan')?.etag, 'rel-1');

  const second = await runScan(db, { dataDir, token: 'tok', now: NOW, http: client(scripted.fetch), releaseBudget: 1 });
  assert.equal(second.status, 'ok');
  assert.equal(scripted.calls.filter((call) => call.url.includes('/releases')).length, 1, 'fresh cache suppresses the second fetch');
});
