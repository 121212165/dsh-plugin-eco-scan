import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CircuitOpenError, HttpClient, HttpError, githubHeaders, readToken } from '../../src/core/http.ts';
import { bodyOf, githubNode, headerOf, response, scriptedFetch } from './fake-http.ts';

test('transient failures retry with exponential backoff, then succeed', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const scripted = scriptedFetch(() => {
    calls += 1;
    return calls < 3 ? response('boom', { status: 500 }) : response({ ok: true });
  });
  const http = new HttpClient({
    fetch: scripted.fetch,
    retries: 2,
    baseDelayMs: 100,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const { data, result } = await http.json<{ ok: boolean }>('https://example.test/x');
  assert.deepEqual(data, { ok: true });
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

test('Retry-After is honoured for 429', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const http = new HttpClient({
    fetch: scriptedFetch(() => {
      calls += 1;
      return calls === 1 ? response('slow down', { status: 429, headers: { 'retry-after': '2' } }) : response({ ok: true });
    }).fetch,
    retries: 1,
    baseDelayMs: 100,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await http.json('https://example.test/x');
  assert.deepEqual(sleeps, [2000]);
});

test('GitHub secondary-limit 403 retries only when Retry-After is present', async () => {
  let calls = 0;
  const delays: number[] = [];
  const withHeader = new HttpClient({
    fetch: scriptedFetch(() => {
      calls += 1;
      return calls === 1
        ? response('secondary rate limit', { status: 403, headers: { 'retry-after': '3' } })
        : response({ ok: true });
    }).fetch,
    retries: 1,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  await withHeader.json('https://api.github.test/x');
  assert.deepEqual(delays, [3000]);

  let plainCalls = 0;
  const plain = new HttpClient({
    fetch: scriptedFetch(() => {
      plainCalls += 1;
      return response('forbidden', { status: 403 });
    }).fetch,
    retries: 3,
    sleep: async () => {},
  });
  await assert.rejects(plain.request('https://api.github.test/x'));
  assert.equal(plainCalls, 1, 'a bare 403 (bad credentials / forbidden repo) is not retried');
});

test('a Retry-After longer than the backoff ceiling fails fast instead of retrying early', async () => {
  let calls = 0;
  const http = new HttpClient({
    fetch: scriptedFetch(() => {
      calls += 1;
      return response('slow down', { status: 429, headers: { 'retry-after': '30' } });
    }).fetch,
    retries: 3,
    maxDelayMs: 8000,
    sleep: async () => {
      throw new Error('retrying before the source said so is pointless');
    },
  });
  await assert.rejects(http.request('https://example.test/x'), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 429);
    return true;
  });
  assert.equal(calls, 1);
});

test('client errors are not retried and surface as HttpError', async () => {
  let calls = 0;
  const http = new HttpClient({
    fetch: scriptedFetch(() => {
      calls += 1;
      return response('nope', { status: 400 });
    }).fetch,
    retries: 3,
    sleep: async () => {},
  });
  await assert.rejects(http.request('https://example.test/x'), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(calls, 1);
});

test('ETag revalidation returns notModified and sends If-None-Match', async () => {
  const scripted = scriptedFetch(() => response('', { status: 304, headers: { etag: 'etag-1' } }));
  const http = new HttpClient({ fetch: scripted.fetch, retries: 0 });
  const { data, result } = await http.json('https://example.test/x', { etag: 'etag-1' });
  assert.equal(data, null);
  assert.equal(result.notModified, true);
  assert.equal(result.etag, 'etag-1');
  assert.equal(headerOf(scripted.calls[0]!.init, 'If-None-Match'), 'etag-1');
});

test('the circuit opens after the threshold, skips calls, and half-opens after cooldown', async () => {
  let clock = 0;
  let calls = 0;
  let healthy = false;
  const events: string[] = [];
  const http = new HttpClient({
    fetch: scriptedFetch(() => {
      calls += 1;
      return healthy ? response({ ok: true }) : response('down', { status: 500 });
    }).fetch,
    retries: 0,
    circuitThreshold: 2,
    circuitCooldownMs: 1000,
    now: () => clock,
    sleep: async () => {},
    onEvent: (event) => events.push(event.kind),
  });

  await assert.rejects(http.request('https://example.test/x'));
  await assert.rejects(http.request('https://example.test/x'));
  assert.equal(http.circuitState('https://example.test/x'), 'open');
  assert.ok(events.includes('circuit-open'));

  const before = calls;
  await assert.rejects(http.request('https://example.test/x'), CircuitOpenError);
  assert.equal(calls, before, 'an open circuit does not hit the network');

  clock = 1000;
  assert.equal(http.circuitState('https://example.test/x'), 'half-open');
  healthy = true;
  const result = await http.request('https://example.test/x');
  assert.equal(result.status, 200);
  assert.equal(http.circuitState('https://example.test/x'), 'closed');
  assert.ok(events.includes('circuit-half-open'));
});

test('the breaker is per host: a dead GitHub must not skip npm', async () => {
  let githubCalls = 0;
  const http = new HttpClient({
    fetch: scriptedFetch((url) => {
      if (url.includes('api.github.com')) {
        githubCalls += 1;
        return response('down', { status: 500 });
      }
      return response({ ok: true });
    }).fetch,
    retries: 0,
    circuitThreshold: 1,
    circuitCooldownMs: 60_000,
    sleep: async () => {},
  });

  await assert.rejects(http.request('https://api.github.com/search/repositories'));
  assert.equal(http.circuitState('https://api.github.com'), 'open');
  const { data } = await http.json<{ ok: boolean }>('https://registry.npmjs.org/-/v1/search');
  assert.deepEqual(data, { ok: true }, 'npm is still called while GitHub is open');
  assert.equal(http.circuitState('https://registry.npmjs.org'), 'closed');
  assert.equal(githubCalls, 1);
});

test('request headers include the user agent, auth is optional, and GitHub headers are well-formed', async () => {
  const scripted = scriptedFetch(() => response({ ok: true }));
  const http = new HttpClient({ fetch: scripted.fetch, userAgent: 'test-agent' });
  await http.request('https://example.test/x', { method: 'POST', headers: { 'X-Test': '1' }, body: '{"a":1}' });
  const init = scripted.calls[0]!.init;
  assert.equal(headerOf(init, 'User-Agent'), 'test-agent');
  assert.equal(headerOf(init, 'X-Test'), '1');
  assert.equal(init.method, 'POST');
  const github = githubHeaders('tok');
  assert.equal(github.Authorization, 'Bearer tok');
  assert.equal(github.Accept, 'application/vnd.github+json');
  assert.equal(githubHeaders(undefined).Authorization, undefined);
});

test('readToken takes the first non-empty environment variable', () => {
  process.env.ECO_TEST_TOKEN_A = '   ';
  process.env.ECO_TEST_TOKEN_B = 'secret';
  try {
    assert.equal(readToken(['ECO_TEST_TOKEN_A', 'ECO_TEST_TOKEN_B']), 'secret');
    assert.equal(readToken(['ECO_TEST_TOKEN_MISSING']), undefined);
  } finally {
    delete process.env.ECO_TEST_TOKEN_A;
    delete process.env.ECO_TEST_TOKEN_B;
  }
});

test('GraphQL bodies are JSON with headers set by the caller', async () => {
  const scripted = scriptedFetch(() => response({ data: { ok: true } }));
  const http = new HttpClient({ fetch: scripted.fetch });
  await http.request('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: 'q', variables: { a: 1 } }) });
  assert.deepEqual(bodyOf(scripted.calls[0]!.init), { query: 'q', variables: { a: 1 } });
  assert.equal(scripted.calls[0]!.url, 'https://api.github.com/graphql');
});

test('a helper node shape is valid JSON for the collectors', () => {
  const node = githubNode('Alice/Eco');
  assert.equal(node.nameWithOwner, 'Alice/Eco');
});
