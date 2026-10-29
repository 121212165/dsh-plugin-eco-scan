/** HTTP with the reliability envelope every collector shares: timeout, bounded
 * retries with exponential backoff (honouring Retry-After), ETag revalidation,
 * and a per-host circuit breaker so a dead source degrades instead of hanging
 * the whole scan. `fetch` and the clock are injectable for tests. */

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  etag: string | null;
  notModified: boolean;
}

export interface HttpEvent {
  kind: 'retry' | 'circuit-open' | 'circuit-half-open' | 'request-failed';
  url: string;
  attempt?: number | undefined;
  status?: number | undefined;
  message?: string | undefined;
  waitMs?: number | undefined;
}

export interface HttpClientOptions {
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: (event: HttpEvent) => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  etag?: string | null;
  /** per-call override; 0 disables retries for this call */
  retries?: number;
  timeoutMs?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class CircuitOpenError extends Error {
  constructor(url: string) {
    super(`circuit open for ${safeHost(url)} — skipping request`);
    this.name = 'CircuitOpenError';
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** The breaker is tracked per host: a dead GitHub must not make npm look
 * dead, which is exactly what a shared counter did. */
interface BreakerState {
  failures: number;
  openedAt: number;
  probing: boolean;
}

export class HttpClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly userAgent: string;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly circuitThreshold: number;
  private readonly circuitCooldownMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onEvent: (event: HttpEvent) => void;

  private readonly breakers = new Map<string, BreakerState>();

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? 'dsh-plugin-eco-scan';
    this.retries = options.retries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 8000;
    this.circuitThreshold = options.circuitThreshold ?? 5;
    this.circuitCooldownMs = options.circuitCooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onEvent = options.onEvent ?? (() => {});
  }

  circuitState(urlOrHost: string): 'closed' | 'open' | 'half-open' {
    return this.stateOf(this.breaker(safeHost(urlOrHost)));
  }

  private breaker(host: string): BreakerState {
    let state = this.breakers.get(host);
    if (!state) {
      state = { failures: 0, openedAt: 0, probing: false };
      this.breakers.set(host, state);
    }
    return state;
  }

  private stateOf(breaker: BreakerState): 'closed' | 'open' | 'half-open' {
    if (breaker.failures < this.circuitThreshold) return 'closed';
    return this.now() - breaker.openedAt < this.circuitCooldownMs ? 'open' : 'half-open';
  }

  async request(url: string, options: RequestOptions = {}): Promise<HttpResult> {
    const breaker = this.breaker(safeHost(url));
    const state = this.stateOf(breaker);
    if (state === 'open') throw new CircuitOpenError(url);
    if (state === 'half-open') {
      if (breaker.probing) throw new CircuitOpenError(url);
      breaker.probing = true;
      this.onEvent({ kind: 'circuit-half-open', url });
    }

    const attempts = (options.retries ?? this.retries) + 1;
    let lastError: Error | null = null;
    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const result = await this.once(url, options);
          breaker.failures = 0;
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const retryable = isRetryable(error, this.maxDelayMs);
          if (!retryable || attempt === attempts) break;
          const waitMs = retryDelay(lastError, attempt, this.baseDelayMs, this.maxDelayMs);
          this.onEvent({ kind: 'retry', url, attempt, waitMs, message: lastError.message });
          await this.sleep(waitMs);
        }
      }
    } finally {
      if (state === 'half-open') breaker.probing = false;
    }

    breaker.failures += 1;
    if (breaker.failures === this.circuitThreshold || state === 'half-open') {
      breaker.openedAt = this.now();
      if (state !== 'half-open') this.onEvent({ kind: 'circuit-open', url, message: lastError?.message });
    }
    this.onEvent({ kind: 'request-failed', url, message: lastError?.message });
    throw lastError ?? new Error(`request failed: ${url}`);
  }

  async json<T>(url: string, options: RequestOptions = {}): Promise<{ data: T | null; result: HttpResult }> {
    const result = await this.request(url, options);
    if (result.notModified) return { data: null, result };
    return { data: JSON.parse(result.body) as T, result };
  }

  private async once(url: string, options: RequestOptions): Promise<HttpResult> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
      ...options.headers,
    };
    if (options.etag) headers['If-None-Match'] = options.etag;
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
    };
    if (options.body !== undefined) init.body = options.body;
    const response = await this.fetchImpl(url, init);
    const headerRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerRecord[key.toLowerCase()] = value;
    });
    const etag = headerRecord.etag ?? null;
    if (response.status === 304) {
      return { status: 304, headers: headerRecord, body: '', etag, notModified: true };
    }
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status} for ${url}: ${body.slice(0, 200)}`, parseRetryAfter(headerRecord['retry-after']));
    }
    return { status: response.status, headers: headerRecord, body, etag, notModified: false };
  }
}

function parseRetryAfter(value: string | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function isRetryable(error: unknown, maxDelayMs: number): boolean {
  if (error instanceof HttpError) {
    // Retrying sooner than the source asked for only burns attempts and trips
    // the breaker: if Retry-After exceeds our backoff ceiling, surface it.
    if (error.retryAfterMs !== null && error.retryAfterMs > maxDelayMs) return false;
    // GitHub answers secondary rate limits with 403 + Retry-After; a plain 403
    // (bad credentials, forbidden repo) must not be retried.
    return RETRYABLE.has(error.status) || (error.status === 403 && error.retryAfterMs !== null);
  }
  if (error instanceof CircuitOpenError) return false;
  // AbortError (timeout) and TypeError from fetch are transient network faults
  if (error instanceof Error && error.name === 'AbortError') return true;
  return true;
}

function retryDelay(error: Error, attempt: number, base: number, max: number): number {
  if (error instanceof HttpError && error.retryAfterMs !== null) return Math.min(max, error.retryAfterMs);
  return Math.min(max, base * 2 ** (attempt - 1));
}

export function githubHeaders(token: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function readToken(envNames: string[]): string | undefined {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}
