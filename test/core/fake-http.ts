/** Scripted fetch for collector tests: no sockets, and every call is recorded
 * so tests can assert URLs, headers and conditional requests. */
export interface FakeCall {
  url: string;
  init: RequestInit;
}

export interface FakeResponseInit {
  status?: number;
  headers?: Record<string, string>;
}

export function response(body: unknown, init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = new Map(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { forEach: (callback: (value: string, key: string) => void) => headers.forEach((value, key) => callback(value, key)) },
    text: async () => text,
  } as unknown as Response;
}

export function scriptedFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): {
  fetch: typeof globalThis.fetch;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const request = init ?? {};
    calls.push({ url, init: request });
    return handler(url, request);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function headerOf(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found?.[1];
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? record[key] : undefined;
}

export function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
}

export function githubNode(fullName: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `node-${fullName}`,
    nameWithOwner: fullName,
    description: 'a plugin',
    stargazerCount: 100,
    forkCount: 5,
    issues: { totalCount: 2 },
    primaryLanguage: { name: 'TypeScript' },
    licenseInfo: { spdxId: 'MIT' },
    repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }, { topic: { name: 'telemetry' } }] },
    createdAt: '2026-01-01T00:00:00Z',
    pushedAt: '2026-10-01T00:00:00Z',
    isArchived: false,
    defaultBranchRef: { target: { committedDate: '2026-10-02T00:00:00Z' } },
    ...overrides,
  };
}
