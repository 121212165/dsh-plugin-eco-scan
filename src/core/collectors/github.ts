/** GitHub collector. GraphQL is the primary path: cursor pagination past the
 * 1,000-result REST window per query, several corpus queries (topics, names,
 * description terms) for coverage, and a single batched detail query per 25
 * repos (CI workflows, test trees, contributor count, recent issue close
 * times). REST is a fallback that still works without a token.
 *
 * Note on ETag: GitHub's GraphQL endpoint is POST-only and does not emit
 * validators, so conditional requests apply to REST paths (search fallback,
 * releases). Detail staleness on the GraphQL path is handled with a TTL. */
import type { HttpClient } from '../http.ts';
import { githubHeaders } from '../http.ts';
import type { RepoFacts } from '../types.ts';
import { asNumber, asString, isRecord, median, normalizeRepoId } from '../util.ts';

export const CORPUS_QUERIES = [
  'topic:dsh-plugin',
  'topic:dsh-plugins',
  'dsh-plugin in:name',
  'dsh-plugins in:name',
  'deepseek-harness',
  'cordis plugin in:description',
] as const;

const SEARCH_QUERY = `
query EcoSearch($q: String!, $first: Int!, $after: String) {
  search(query: $q, type: REPOSITORY, first: $first, after: $after) {
    repositoryCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Repository {
        id
        nameWithOwner
        description
        stargazerCount
        forkCount
        issues(states: OPEN) { totalCount }
        primaryLanguage { name }
        licenseInfo { spdxId }
        repositoryTopics(first: 20) { nodes { topic { name } } }
        createdAt
        pushedAt
        isArchived
        defaultBranchRef { target { ... on Commit { committedDate } } }
      }
    }
  }
}`;

const DETAILS_QUERY = `
query EcoDetails($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Repository {
      id
      nameWithOwner
      description
      stargazerCount
      forkCount
      issues(states: OPEN) { totalCount }
      primaryLanguage { name }
      licenseInfo { spdxId }
      repositoryTopics(first: 20) { nodes { topic { name } } }
      createdAt
      pushedAt
      isArchived
      defaultBranchRef { target { ... on Commit { committedDate } } }
      mentionableUsers(first: 1) { totalCount }
      workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
      testdir: object(expression: "HEAD:test") { ... on Tree { entries { name } } }
      testsdir: object(expression: "HEAD:tests") { ... on Tree { entries { name } } }
      recentIssues: issues(states: CLOSED, last: 5, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { createdAt closedAt }
      }
    }
  }
}`;

export interface GithubOptions {
  token?: string;
  queries?: readonly string[];
  pageSize?: number;
  maxPagesPerQuery?: number;
  maxRepos?: number;
  detailBatchSize?: number;
  /** Minimum gap between REST search calls. Defaults to 2s with a token
   * (30 searches/min) and 6.5s without one (10/min). */
  restPacingMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface CorpusResult {
  repos: RepoFacts[];
  complete: boolean;
  via: 'graphql' | 'rest';
  errors: string[];
}

interface GraphqlSearchNode {
  id?: unknown;
  nameWithOwner?: unknown;
  description?: unknown;
  stargazerCount?: unknown;
  forkCount?: unknown;
  issues?: unknown;
  primaryLanguage?: unknown;
  licenseInfo?: unknown;
  repositoryTopics?: unknown;
  createdAt?: unknown;
  pushedAt?: unknown;
  isArchived?: unknown;
  defaultBranchRef?: unknown;
}

function topicNames(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return [];
  const out: string[] = [];
  for (const node of value.nodes) {
    if (!isRecord(node) || !isRecord(node.topic)) continue;
    const name = asString(node.topic.name);
    if (name) out.push(name);
  }
  return out;
}

function commitDate(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.target)) return null;
  return asString(value.target.committedDate);
}

function fromSearchNode(node: GraphqlSearchNode): RepoFacts | null {
  const id = asString(node.nameWithOwner);
  if (!id) return null;
  const issues = isRecord(node.issues) ? asNumber(node.issues.totalCount) : null;
  const language = isRecord(node.primaryLanguage) ? asString(node.primaryLanguage.name) : null;
  const license = isRecord(node.licenseInfo) ? asString(node.licenseInfo.spdxId) : null;
  const nodeId = asString(node.id);
  return {
    id: normalizeRepoId(id),
    description: asString(node.description) ?? '',
    stars: asNumber(node.stargazerCount) ?? 0,
    forks: asNumber(node.forkCount) ?? 0,
    openIssues: issues ?? 0,
    language,
    license,
    topics: topicNames(node.repositoryTopics),
    createdAt: asString(node.createdAt) ?? '',
    pushedAt: asString(node.pushedAt) ?? '',
    lastCommitAt: commitDate(node.defaultBranchRef),
    contributors: null,
    ci: null,
    testsCount: null,
    issueCloseHours: null,
    archived: node.isArchived === true,
    ...(nodeId ? { nodeId } : {}),
  };
}

interface GraphqlEnvelope {
  data?: Record<string, unknown> | null;
  errors?: { message?: string }[];
}

function envelopeErrors(payload: GraphqlEnvelope): string[] {
  return (payload.errors ?? []).map((error) => String(error.message ?? 'graphql error'));
}

async function graphql<T>(http: HttpClient, token: string | undefined, query: string, variables: Record<string, unknown>): Promise<T> {
  const result = await http.json<GraphqlEnvelope>('https://api.github.com/graphql', {
    method: 'POST',
    headers: graphqlHeaders(token),
    body: JSON.stringify({ query, variables }),
  });
  const payload = result.data;
  if (!payload) throw new Error('empty GraphQL response');
  const errors = envelopeErrors(payload);
  if (!payload.data) throw new Error(errors.join('; ') || 'GraphQL returned no data');
  if (errors.length) {
    // Partial data is still usable; the caller records the messages.
    (payload.data as Record<string, unknown>)['__warnings'] = errors;
  }
  return payload.data as T;
}

function graphqlHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = githubHeaders(token);
  const authorization = auth.Authorization;
  if (authorization) headers.Authorization = authorization;
  return headers;
}

function warnings(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.__warnings)) return [];
  return data.__warnings.filter((item): item is string => typeof item === 'string');
}

/** Collect the repository corpus via GraphQL. Returns complete=false when a
 * query hit its page cap, so the caller can label coverage honestly. */
export async function fetchCorpusGraphql(http: HttpClient, options: GithubOptions): Promise<CorpusResult> {
  const queries = options.queries ?? CORPUS_QUERIES;
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
  const maxPages = Math.max(1, options.maxPagesPerQuery ?? 10);
  const maxRepos = Math.max(1, options.maxRepos ?? 1200);
  const byId = new Map<string, RepoFacts>();
  const errors: string[] = [];
  let complete = true;

  for (const query of queries) {
    let after: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const data = await graphql<Record<string, unknown>>(
        http,
        options.token,
        SEARCH_QUERY,
        { q: query, first: pageSize, after },
      );
      errors.push(...warnings(data).map((message) => `${query}: ${message}`));
      const search = isRecord(data.search) ? data.search : null;
      if (!search || !Array.isArray(search.nodes)) break;
      for (const node of search.nodes) {
        if (!isRecord(node)) continue;
        const facts = fromSearchNode(node as GraphqlSearchNode);
        if (facts) byId.set(facts.id, facts);
      }
      const pageInfo = isRecord(search.pageInfo) ? search.pageInfo : null;
      const hasNext = pageInfo?.hasNextPage === true;
      const endCursor = asString(pageInfo?.endCursor);
      options.log?.(`github.search ${query} page=${page + 1} total=${byId.size}`);
      if (!hasNext || !endCursor) break;
      if (page === maxPages - 1) complete = false;
      if (byId.size >= maxRepos) {
        complete = false;
        break;
      }
      after = endCursor;
    }
    if (byId.size >= maxRepos) break;
  }

  return { repos: [...byId.values()].slice(0, maxRepos), complete, via: 'graphql', errors };
}

/** Batched details for the repos that still need CI/tests/contributors. */
export async function enrichDetails(
  http: HttpClient,
  repos: RepoFacts[],
  options: GithubOptions & { ttlHint?: (repo: RepoFacts) => boolean },
): Promise<{ enriched: number; errors: string[] }> {
  const targets = repos.filter((repo) => repo.nodeId && (options.ttlHint ? options.ttlHint(repo) : true));
  const batchSize = Math.max(1, options.detailBatchSize ?? 25);
  const errors: string[] = [];
  let enriched = 0;
  for (let index = 0; index < targets.length; index += batchSize) {
    const batch = targets.slice(index, index + batchSize);
    const ids = batch.map((repo) => repo.nodeId!).filter(Boolean);
    if (!ids.length) continue;
    try {
      const data = await graphql<Record<string, unknown>>(http, options.token, DETAILS_QUERY, { ids });
      errors.push(...warnings(data));
      if (!Array.isArray(data.nodes)) continue;
      const byId = new Map(batch.map((repo) => [repo.nodeId!, repo]));
      for (const node of data.nodes) {
        if (!isRecord(node)) continue;
        const facts = fromSearchNode(node as GraphqlSearchNode);
        const nodeId = asString(node.id);
        if (!facts || !nodeId) continue;
        const target = byId.get(nodeId);
        if (!target) continue;
        applyDetails(target, node);
        enriched++;
      }
      options.log?.(`github.details batch=${index / batchSize + 1} enriched=${enriched}`);
    } catch (error) {
      errors.push(`details batch ${index / batchSize + 1}: ${errorText(error)}`);
    }
  }
  return { enriched, errors };
}

function applyDetails(target: RepoFacts, node: Record<string, unknown>): void {
  const workflows = isRecord(node.workflows) && Array.isArray(node.workflows.entries) ? node.workflows.entries : null;
  const testDir = isRecord(node.testdir) && Array.isArray(node.testdir.entries) ? node.testdir.entries : null;
  const testsDir = isRecord(node.testsdir) && Array.isArray(node.testsdir.entries) ? node.testsdir.entries : null;
  target.ci = workflows !== null && workflows.length > 0;
  target.testsCount = (testDir?.length ?? 0) + (testsDir?.length ?? 0);
  target.contributors = isRecord(node.mentionableUsers) ? asNumber(node.mentionableUsers.totalCount) : null;
  target.issueCloseHours = closeHours(node.recentIssues);
}

function closeHours(value: unknown): number | null {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return null;
  const spans: number[] = [];
  for (const node of value.nodes) {
    if (!isRecord(node)) continue;
    const created = asString(node.createdAt);
    const closed = asString(node.closedAt);
    if (!created || !closed) continue;
    const hours = (Date.parse(closed) - Date.parse(created)) / 3_600_000;
    if (Number.isFinite(hours) && hours >= 0) spans.push(hours);
  }
  return median(spans);
}

/** REST fallback: search API caps at 1,000 items and returns no CI/test facts,
 * but it works with or without a token and supports ETag revalidation. Calls
 * are paced to the search rate limit; when the response says the quota is
 * nearly spent, it waits for the reset instead of collecting 403s. */
export async function fetchCorpusRest(http: HttpClient, options: GithubOptions): Promise<CorpusResult> {
  const queries = options.queries ?? CORPUS_QUERIES;
  const byId = new Map<string, RepoFacts>();
  const errors: string[] = [];
  let complete = true;
  const maxPages = options.maxPagesPerQuery ?? 10;
  const maxRepos = Math.max(1, options.maxRepos ?? 1200);
  const pacingMs = Math.max(0, options.restPacingMs ?? (options.token ? 2000 : 6500));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let requests = 0;
  outer: for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      if (requests > 0 && pacingMs > 0) await sleep(pacingMs);
      requests++;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=stars`;
      try {
        const { data, result } = await http.json<{ items?: Record<string, unknown>[] }>(url, { headers: githubHeaders(options.token) });
        const items = data?.items ?? [];
        for (const item of items) {
          if (byId.size >= maxRepos) break;
          const facts = fromRestItem(item);
          if (facts) byId.set(facts.id, facts);
        }
        options.log?.(`github.rest ${query} page=${page} total=${byId.size}`);
        if (byId.size >= maxRepos) {
          complete = false;
          break outer;
        }
        const resetWait = rateLimitWait(result.headers);
        if (resetWait > 0) {
          options.log?.(`github.rest quota nearly spent, waiting ${resetWait}ms for reset`);
          await sleep(resetWait);
        }
        if (items.length < 100) break;
        if (page === maxPages) complete = false;
      } catch (error) {
        // A page that failed means more results may exist but were not seen.
        complete = false;
        errors.push(`${query} page ${page}: ${errorText(error)}`);
        break;
      }
    }
  }
  return { repos: [...byId.values()], complete, via: 'rest', errors };
}

/** Wait until the primary rate-limit reset when almost no searches remain. */
function rateLimitWait(headers: Record<string, string>): number {
  const remaining = Number(headers['x-ratelimit-remaining']);
  const reset = Number(headers['x-ratelimit-reset']);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset) || remaining > 1) return 0;
  const wait = reset * 1000 - Date.now();
  return wait > 0 ? Math.min(wait + 250, 20_000) : 0;
}

function fromRestItem(item: Record<string, unknown>): RepoFacts | null {
  const fullName = asString(item.full_name);
  if (!fullName) return null;
  const license = isRecord(item.license) ? asString(item.license.spdx_id) : null;
  return {
    id: normalizeRepoId(fullName),
    description: asString(item.description) ?? '',
    stars: asNumber(item.stargazers_count) ?? 0,
    forks: asNumber(item.forks_count) ?? 0,
    openIssues: asNumber(item.open_issues_count) ?? 0,
    language: asString(item.language),
    license,
    topics: Array.isArray(item.topics) ? item.topics.filter((topic): topic is string => typeof topic === 'string') : [],
    createdAt: asString(item.created_at) ?? '',
    pushedAt: asString(item.pushed_at) ?? '',
    lastCommitAt: null,
    contributors: null,
    ci: null,
    testsCount: null,
    issueCloseHours: null,
    archived: item.archived === true,
  };
}

/** Corpus with graceful degradation: GraphQL first, REST on failure.
 * Repos already in the DB are always unioned in by the caller. */
export async function fetchCorpus(http: HttpClient, options: GithubOptions): Promise<CorpusResult> {
  if (options.token) {
    try {
      return await fetchCorpusGraphql(http, options);
    } catch (error) {
      options.log?.(`github.graphql failed, falling back to REST: ${errorText(error)}`);
      const rest = await fetchCorpusRest(http, options);
      rest.errors.unshift(`graphql: ${errorText(error)}`);
      return rest;
    }
  }
  return fetchCorpusRest(http, options);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
