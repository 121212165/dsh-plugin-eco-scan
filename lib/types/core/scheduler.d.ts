export type ScheduleSpec = {
    kind: 'off';
} | {
    kind: 'every';
    hours: number;
} | {
    kind: 'daily';
    hour: number;
    minute: number;
};
export declare const SCHEDULE_HINT = "every <N>h / every <N>m / daily HH:MM (UTC) / off";
export declare class ScheduleError extends Error {
    constructor(message: string);
}
export declare function parseSchedule(text: string | null | undefined): ScheduleSpec;
/** UTC instant of the next run strictly after `now`; null when scheduling is off. */
export declare function nextRunAt(spec: ScheduleSpec, now?: Date): Date | null;
export declare function describeSchedule(spec: ScheduleSpec): string;
export interface SchedulerOptions {
    spec: ScheduleSpec;
    /** Called once per due instant. Never runs twice concurrently. */
    task: (scheduledFor: Date, startedAt: Date) => Promise<void> | void;
    now?: () => Date;
    /** Injectable for tests; the default unrefs its timer so a stale scheduler
     * never keeps an otherwise finished process alive. */
    sleep?: (ms: number) => Promise<void>;
    onError?: (error: unknown) => void;
    log?: (message: string) => void;
}
export declare class Scheduler {
    private readonly options;
    private running;
    private next;
    private loop;
    private wake;
    constructor(options: SchedulerOptions);
    get nextRunAt(): Date | null;
    get active(): boolean;
    /** Starts the loop; returns the first due instant (null for `off`). Safe to
     * call twice — the second call is a no-op. */
    start(): Date | null;
    stop(): void;
    /** Resolves when the loop has observed the stop flag (never rejects). */
    settle(): Promise<void>;
    private now;
    /** Real timer, but `stop()` wakes it so a teardown never waits out a full
     * interval. Unref'd so a forgotten scheduler cannot hold the process open. */
    private defaultSleep;
    private run;
}
//# sourceMappingURL=scheduler.d.ts.map