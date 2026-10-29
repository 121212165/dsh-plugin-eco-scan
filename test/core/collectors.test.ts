import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CORPUS_QUERIES,
  enrichDetails,
  fetchCorpus,
  fetchCorpusGraphql,
  fetchCorpusRest,
} from '../../src/core/collectors/github.ts';
import { fetchDownloadStats, searchPackages, weekGrowthFrom } from '../../src/core/collectors/npm.ts';
import { fetchReleaseBatch, fetchReleaseDownloads } from '../../src/core/collectors/releases.ts';
import { HttpClient } from '../../src/core/http.ts';
import { bodyOf, githubNode, headerOf, response, scriptedFetch } from './fake-http.ts';

function client(fetchImpl: typeof globalThis.fetch, retries = 0): HttpClient {
  return new HttpClient({ fetch: fetchImpl, retries, sleep: async () => {} });
}

test('GraphQL corpus paginates by cursor and dedupes across pages', async () => {
  const scripted = scriptedFetch((_url, init) => {
    const body = bodyOf(init);
    assert.match(String(body.query), /EcoSearch/);
    const variables = body.variables as { after: string | null };
    if (variables.after === null) {
      return response({
        data: {
          search: {
            pageInfo: { hasNextPage: true, endCursor: 'c1' },
            nodes: [githubNode('Alice/Eco'), githubNode('Bob/Telemetry')],
          },
        },
      });
    }
    return response({
      data: {
        search: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [githubNode('Alice/Eco'), githubNode('Carol/Archive')],
        },
      },
    });
  });
  const result = await fetchCorpusGraphql(client(scripted.fetch), { token: 'tok', queries: ['topic:dsh-plugin'] });
  assert.equal(result.via, 'graphql');
  assert.equal(result.complete, true);
  assert.deepEqual(result.repos.map((repo) => repo.id), ['alice/eco', 'bob/telemetry', 'carol/archive']);
  assert.equal(scripted.calls.length, 2);
  assert.equal(headerOf(scripted.calls[0]!.init, 'Authorization'), 'Bearer tok');
  const eco = result.repos[0]!;
  assert.equal(eco.stars, 100);
  assert.deepEqual(eco.topics, ['dsh-plugin', 'telemetry']);
  assert.equal(eco.lastCommitAt, '2026-10-02T00:00:00Z');
  assert.equal(eco.nodeId, 'node-Alice/Eco');
});

test('GraphQL page caps and repo caps are reported as incomplete', async () => {
  const handler = (): Response =>
    response({
      data: {
        search: {
          pageInfo: { hasNextPage: true, endCursor: 'more' },
          nodes: [githubNode('Alice/Eco')],
        },
      },
    });
  const capped = await fetchCorpusGraphql(client(scriptedFetch(handler).fetch), { queries: ['topic:dsh-plugin'], maxPagesPerQuery: 2 });
  assert.equal(capped.complete, false);

  const limited = await fetchCorpusGraphql(client(scriptedFetch(handler).fetch), { queries: ['topic:dsh-plugin'], maxRepos: 1 });
  assert.equal(limited.complete, false);
  assert.equal(limited.repos.length, 1);
});

test('the default corpus queries cover topics, names and descriptions', () => {
  assert.ok(CORPUS_QUERIES.includes('topic:dsh-plugin'));
  assert.ok(CORPUS_QUERIES.includes('topic:dsh-plugins'));
  assert.ok(CORPUS_QUERIES.some((query) => query.includes('in:name')));
  assert.ok(CORPUS_QUERIES.some((query) => query.includes('in:description')));
});

test('detail enrichment fills CI, tests, contributors and issue close time', async () => {
  const repo = {
    id: 'alice/eco',
    description: 'a plugin',
    stars: 10,
    forks: 1,
    openIssues: 0,
    language: 'TypeScript',
    license: 'MIT',
    topics: ['dsh-plugin'],
    createdAt: '2026-01-01T00:00:00Z',
    pushedAt: '2026-10-01T00:00:00Z',
    lastCommitAt: null,
    contributors: null,
    ci: null,
    testsCount: null,
    issueCloseHours: null,
    archived: false,
    nodeId: 'node-Alice/Eco',
  };
  const scripted = scriptedFetch((_url, init) => {
    const body = bodyOf(init);
    assert.match(String(body.query), /EcoDetails/);
    assert.deepEqual(body.variables, { ids: ['node-Alice/Eco'] });
    return response({
      data: {
        nodes: [
          githubNode('Alice/Eco', {
            id: 'node-Alice/Eco',
            workflows: { entries: [{ name: 'ci.yml' }] },
            testdir: { entries: [{ name: 'a.test.ts' }, { name: 'b.test.ts' }] },
            testsdir: { entries: [{ name: 'c.test.ts' }] },
            mentionableUsers: { totalCount: 7 },
            recentIssues: {
              nodes: [
                { createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-01T12:00:00Z' },
                { createdAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-02T12:00:00Z' },
              ],
            },
          }),
        ],
      },
    });
  });
  const result = await enrichDetails(client(scripted.fetch), [repo], { token: 'tok' });
  assert.equal(result.enriched, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(repo.ci, true);
  assert.equal(repo.testsCount, 3);
  assert.equal(repo.contributors, 7);
  assert.equal(repo.issueCloseHours, 24);
});

test('detail enrichment skips repos without node ids and reports batch errors', async () => {
  const withoutId = {
    id: 'a/no-node',
    description: '',
    stars: 0,
    forks: 0,
    openIssues: 0,
    language: null,
    license: null,
    topics: [],
    createdAt: '',
    pushedAt: '',
    lastCommitAt: null,
    contributors: null,
    ci: null,
    testsCount: null,
    issueCloseHours: null,
    archived: false,
  };
  const scripted = scriptedFetch(() => response('bad', { status: 500 }));
  const result = await enrichDetails(client(scripted.fetch), [withoutId], {});
  assert.equal(result.enriched, 0);
  assert.equal(scripted.calls.length, 0);
});

test('GraphQL failure falls back to the REST search', async () => {
  const scripted = scriptedFetch((url) => {
    if (url.includes('/graphql')) return response('graphql down', { status: 500 });
    assert.match(url, /search\/repositories\?q=topic%3Adsh-plugin/);
    return response({
      items: [
        {
          full_name: 'Alice/Eco',
          description: 'a plugin',
          stargazers_count: 42,
          forks_count: 2,
          open_issues_count: 1,
          language: 'TypeScript',
          license: { spdx_id: 'MIT' },
          topics: ['dsh-plugin'],
          created_at: '2026-01-01T00:00:00Z',
          pushed_at: '2026-10-01T00:00:00Z',
          archived: false,
        },
      ],
    });
  });
  const result = await fetchCorpus(client(scripted.fetch), { token: 'tok', queries: ['topic:dsh-plugin'], restPacingMs: 0 });
  assert.equal(result.via, 'rest');
  assert.equal(result.repos[0]?.id, 'alice/eco');
  assert.equal(result.repos[0]?.stars, 42);
  assert.ok(result.errors[0]?.startsWith('graphql:'), result.errors.join('|'));
});

test('REST corpus walks pages until a short page', async () => {
  const scripted = scriptedFetch((url) => {
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '1');
    const count = page === 1 ? 100 : 1;
    return response({
      items: Array.from({ length: count }, (_, index) => ({ full_name: `owner/repo-${page}-${index}`, stargazers_count: 1 })),
    });
  });
  const result = await fetchCorpusRest(client(scripted.fetch), { queries: ['topic:dsh-plugin'], restPacingMs: 0 });
  assert.equal(result.complete, true);
  assert.equal(result.repos.length, 101);
  assert.equal(scripted.calls.length, 2);
});

test('REST corpus paces calls and waits for the reset when the search quota is spent', async () => {
  const reset = String(Math.floor(Date.now() / 1000) + 2);
  const scripted = scriptedFetch((url) => {
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '1');
    if (page !== 1) return response({ items: [] });
    return response(
      { items: Array.from({ length: 100 }, (_, index) => ({ full_name: `owner/repo-${index}`, stargazers_count: 1 })) },
      { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } },
    );
  });
  const sleeps: number[] = [];
  const result = await fetchCorpusRest(client(scripted.fetch), {
    queries: ['topic:dsh-plugin'],
    restPacingMs: 50,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.repos.length, 100);
  assert.ok(sleeps.some((ms) => ms > 1000), `the reset wait is honoured: ${sleeps.join(',')}`);
  assert.equal(sleeps[sleeps.length - 1], 50, 'the second call is paced');
});

test('REST corpus respects maxRepos and marks the cap as incomplete', async () => {
  const scripted = scriptedFetch(() =>
    response({ items: Array.from({ length: 100 }, (_, index) => ({ full_name: `owner/repo-${index}`, stargazers_count: 1 })) }),
  );
  const result = await fetchCorpusRest(client(scripted.fetch), { queries: ['topic:dsh-plugin'], restPacingMs: 0, maxRepos: 40 });
  assert.equal(result.repos.length, 40);
  assert.equal(result.complete, false);
  assert.equal(scripted.calls.length, 1);
});

test('a failed REST page marks the corpus incomplete instead of claiming full coverage', async () => {
  const scripted = scriptedFetch((url) => {
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '1');
    if (page !== 1) return response('rate limited', { status: 429 });
    return response({
      items: Array.from({ length: 100 }, (_, index) => ({ full_name: `owner/repo-${index}`, stargazers_count: 1 })),
    });
  });
  const result = await fetchCorpusRest(client(scripted.fetch), { queries: ['topic:dsh-plugin'], restPacingMs: 0 });
  assert.equal(result.repos.length, 100);
  assert.equal(result.complete, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] ?? '', /page 2/);
});

test('npm search parses repository links and paginates by from', async () => {
  const scripted = scriptedFetch((url) => {
    const from = Number(/[?&]from=(\d+)/.exec(url)?.[1] ?? '0');
    if (from === 0) {
      return response({
        objects: [
          {
            package: {
              name: 'dsh-plugin-a',
              version: '1.0.0',
              keywords: ['dsh'],
              links: { repository: 'https://github.com/a/a' },
              downloads: { weekly: 1200, monthly: 5000 },
            },
          },
          { package: { name: 'dsh-plugin-b', version: '2.0.0', keywords: [], npm: { repository: 'git+https://github.com/b/b.git' } } },
        ],
      });
    }
    if (from === 2) return response({ objects: [{ package: { name: 'dsh-plugin-c' } }] });
    return response({ objects: [] });
  });
  const { packages, errors } = await searchPackages(client(scripted.fetch), { keywords: ['kw'], pageSize: 2, maxPages: 5 });
  assert.deepEqual(packages.map((pkg) => pkg.name), ['dsh-plugin-a', 'dsh-plugin-b', 'dsh-plugin-c']);
  assert.deepEqual(errors, []);
  assert.equal(packages[0]?.repository, 'https://github.com/a/a');
  assert.equal(packages[0]?.weekly, 1200, 'the search index carries a weekly count');
  assert.equal(packages[1]?.repository, 'git+https://github.com/b/b.git');
  assert.equal(packages[1]?.weekly, null);
  assert.equal(scripted.calls.length, 2);
});

test('download stats use bulk point windows for unscoped packages and ranges for scoped ones', async () => {
  const scripted = scriptedFetch((url) => {
    if (url.includes('/downloads/point/2026-10-22:2026-10-28/good,bad')) {
      return response({ good: { downloads: 77, package: 'good' }, bad: { downloads: 55, package: 'bad' } });
    }
    if (url.includes('/downloads/point/2026-10-15:2026-10-21/good,bad')) {
      return response({ good: { downloads: 28, package: 'good' } });
    }
    if (url.includes('/downloads/range/2026-10-15:2026-10-28/@scope/pkg')) {
      const day = new Date('2026-10-15T00:00:00Z');
      const downloads = Array.from({ length: 14 }, (_, index) => ({
        day: new Date(day.getTime() + index * 86_400_000).toISOString().slice(0, 10),
        downloads: index + 1,
      }));
      return response({ downloads });
    }
    return response('unexpected', { status: 500 });
  });
  const { stats, errors } = await fetchDownloadStats(client(scripted.fetch), ['good', 'bad', '@scope/pkg'], {
    now: new Date('2026-10-29T00:00:00Z'),
  });
  assert.deepEqual(errors, []);
  assert.equal(stats.size, 3);
  const good = stats.get('good');
  assert.equal(good?.weekly, 77);
  assert.equal(good?.prev, 28);
  assert.equal(good?.growthPct, (77 - 28) / 28);
  const bad = stats.get('bad');
  assert.equal(bad?.weekly, 55);
  assert.equal(bad?.prev, 0);
  assert.equal(bad?.growthPct, null);
  const scoped = stats.get('@scope/pkg');
  assert.equal(scoped?.weekly, 77);
  assert.equal(scoped?.prev, 28);
  assert.equal(scripted.calls.length, 3, 'two bulk windows plus one scoped range');
});

test('a missing prev window keeps weekly downloads and reports the degradation', async () => {
  const scripted = scriptedFetch((url) => {
    if (url.includes('/downloads/point/2026-10-15:2026-10-21/a,b')) return response('nope', { status: 500 });
    if (url.includes('/downloads/point/2026-10-22:2026-10-28/a,b')) {
      return response({ a: { downloads: 10 }, b: { downloads: 0 } });
    }
    return response('unexpected', { status: 500 });
  });
  const { stats, errors } = await fetchDownloadStats(client(scripted.fetch), ['a', 'b'], {
    now: new Date('2026-10-29T00:00:00Z'),
  });
  assert.equal(stats.size, 2);
  assert.equal(stats.get('a')?.weekly, 10);
  assert.equal(stats.get('a')?.prev, 0);
  assert.equal(stats.get('a')?.growthPct, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? '', /prev/);
});

test('scoped packages beyond the range budget keep their search weekly count with no download call', async () => {
  const scripted = scriptedFetch(() => response('unexpected', { status: 500 }));
  const knownWeekly = new Map([
    ['@scope/big', 900],
    ['@scope/small', 3],
  ]);
  const { stats, errors } = await fetchDownloadStats(client(scripted.fetch), ['@scope/big', '@scope/small'], {
    now: new Date('2026-10-29T00:00:00Z'),
    knownWeekly,
    scopedBudget: 0,
  });
  assert.deepEqual(errors, []);
  assert.equal(stats.size, 2);
  assert.equal(stats.get('@scope/big')?.weekly, 900);
  assert.equal(stats.get('@scope/big')?.prev, 0);
  assert.equal(stats.get('@scope/big')?.growthPct, null);
  assert.equal(scripted.calls.length, 0);
});

test('the scoped budget is spent on the biggest packages first and a failed range keeps the search weekly', async () => {
  const scripted = scriptedFetch((url) => {
    if (url.endsWith('/@scope/big')) return response('missing', { status: 404 });
    if (url.includes('/@scope/small')) return response('missing', { status: 404 });
    return response('unexpected', { status: 500 });
  });
  const knownWeekly = new Map([
    ['@scope/big', 5000],
    ['@scope/small', 2],
  ]);
  const { stats, errors } = await fetchDownloadStats(
    client(scripted.fetch),
    ['@scope/small', '@scope/big'],
    { now: new Date('2026-10-29T00:00:00Z'), knownWeekly, scopedBudget: 1 },
  );
  assert.deepEqual(errors, [], 'a known weekly avoids the point fallback');
  assert.equal(scripted.calls.length, 1, 'only the budgeted package is requested');
  assert.ok(scripted.calls[0]?.url.endsWith('/@scope/big'), String(scripted.calls[0]?.url));
  assert.equal(stats.get('@scope/big')?.weekly, 5000, 'the failed range falls back to the search weekly');
  assert.equal(stats.get('@scope/small')?.weekly, 2);
});

test('weekGrowthFrom needs two full weeks before reporting growth', () => {
  assert.deepEqual(weekGrowthFrom([1, 2, 3, 4, 5, 6, 7]), { week: 28, prev: 0, growthPct: null });
  assert.deepEqual(weekGrowthFrom([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]), { week: 14, prev: 7, growthPct: 1 });
  assert.deepEqual(weekGrowthFrom([]), { week: 0, prev: 0, growthPct: null });
});

test('release downloads sum every asset across every page', async () => {
  const scripted = scriptedFetch((url) => {
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '1');
    const count = page === 1 ? 100 : 2;
    return response(
      Array.from({ length: count }, () => ({ assets: [{ download_count: 1 }, { download_count: 0 }] })),
      page === 1 ? { headers: { etag: 'etag-1' } } : {},
    );
  });
  const result = await fetchReleaseDownloads(client(scripted.fetch), 'alice/eco');
  assert.equal(result.downloads, 102);
  assert.equal(result.etag, 'etag-1');
  assert.equal(result.notModified, false);
  assert.equal(scripted.calls.length, 2);
});

test('release page 1 honours ETag and skips the body entirely', async () => {
  const scripted = scriptedFetch(() => response('', { status: 304, headers: { etag: 'etag-1' } }));
  const result = await fetchReleaseDownloads(client(scripted.fetch), 'alice/eco', { etag: 'etag-1' });
  assert.equal(result.notModified, true);
  assert.equal(result.downloads, null);
  assert.equal(scripted.calls.length, 1);
  assert.equal(headerOf(scripted.calls[0]!.init, 'If-None-Match'), 'etag-1');
});

test('unexpected release payloads throw instead of silently reporting zero', async () => {
  const scripted = scriptedFetch(() => response({ message: 'not an array' }));
  await assert.rejects(fetchReleaseDownloads(client(scripted.fetch), 'alice/eco'), /unexpected releases payload/);
});

test('release batch records per-repo failures without rejecting the batch', async () => {
  const scripted = scriptedFetch((url) => (url.includes('/good/') ? response([{ assets: [{ download_count: 9 }] }]) : response('nope', { status: 404 })));
  const entries = await fetchReleaseBatch(client(scripted.fetch), ['a/good', 'a/bad']);
  assert.equal(entries.length, 2);
  assert.equal(entries.find((entry) => entry.repoId === 'a/good')?.downloads, 9);
  assert.ok(entries.find((entry) => entry.repoId === 'a/bad')?.error);
});
