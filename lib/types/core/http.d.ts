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
export declare class HttpError extends Error {
    readonly status: number;
    readonly retryAfterMs: number | null;
    constructor(status: number, message: string, retryAfterMs?: number | null);
}
export declare class CircuitOpenError extends Error {
    constructor(url: string);
}
export declare class HttpClient {
    private readonly fetchImpl;
    private readonly userAgent;
    private readonly retries;
    private readonly timeoutMs;
    private readonly baseDelayMs;
    private readonly maxDelayMs;
    private readonly circuitThreshold;
    private readonly circuitCooldownMs;
    private readonly now;
    private readonly sleep;
    private readonly onEvent;
    private readonly breakers;
    constructor(options?: HttpClientOptions);
    circuitState(urlOrHost: string): 'closed' | 'open' | 'half-open';
    private breaker;
    private stateOf;
    request(url: string, options?: RequestOptions): Promise<HttpResult>;
    json<T>(url: string, options?: RequestOptions): Promise<{
        data: T | null;
        result: HttpResult;
    }>;
    private once;
}
export declare function githubHeaders(token: string | undefined, extra?: Record<string, string>): Record<string, string>;
export declare function readToken(envNames: string[]): string | undefined;
//# sourceMappingURL=http.d.ts.map