/** Built-in scan cadence. dsh keeps the plugin process alive, so the plugin
 * can own its own schedule instead of relying on cron; the CLI path stays
 * cron-friendly for headless installs. One implementation, tiny surface:
 * parse a spec, compute the next UTC instant, loop with an injectable clock so
 * the schedule math is testable without waiting. */
import { round } from './util.js';
export const SCHEDULE_HINT = 'every <N>h / every <N>m / daily HH:MM (UTC) / off';
export class ScheduleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ScheduleError';
    }
}
export function parseSchedule(text) {
    const raw = (text ?? '').trim().toLowerCase();
    if (!raw || raw === 'off' || raw === 'none' || raw === 'manual')
        return { kind: 'off' };
    const every = /^every\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/.exec(raw);
    if (every) {
        const value = Number(every[1]);
        const unit = every[2] ?? 'h';
        const hours = unit.startsWith('h') ? value : value / 60;
        if (!(hours > 0) || hours > 24 * 7)
            throw new ScheduleError(`排程间隔需在 0–168 小时之间：${text}`);
        return { kind: 'every', hours };
    }
    const daily = /^(?:daily\s+)?(\d{1,2}):(\d{2})(?:\s*utc)?$/.exec(raw);
    if (daily) {
        const hour = Number(daily[1]);
        const minute = Number(daily[2]);
        if (hour > 23 || minute > 59)
            throw new ScheduleError(`时间需为 HH:MM（00:00–23:59）：${text}`);
        return { kind: 'daily', hour, minute };
    }
    throw new ScheduleError(`无法解析排程「${text}」，可用：${SCHEDULE_HINT}`);
}
/** UTC instant of the next run strictly after `now`; null when scheduling is off. */
export function nextRunAt(spec, now = new Date()) {
    if (spec.kind === 'off')
        return null;
    if (spec.kind === 'every')
        return new Date(now.getTime() + spec.hours * 3_600_000);
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), spec.hour, spec.minute, 0, 0));
    if (candidate.getTime() <= now.getTime())
        candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
}
export function describeSchedule(spec) {
    if (spec.kind === 'off')
        return 'off';
    if (spec.kind === 'every')
        return `every ${round(spec.hours, 2)}h`;
    return `daily ${String(spec.hour).padStart(2, '0')}:${String(spec.minute).padStart(2, '0')} UTC`;
}
const MAX_TIMER_MS = 2_147_483_647;
export class Scheduler {
    options;
    running = false;
    next = null;
    loop = null;
    wake = null;
    constructor(options) {
        this.options = options;
    }
    get nextRunAt() {
        return this.next ? new Date(this.next.getTime()) : null;
    }
    get active() {
        return this.running;
    }
    /** Starts the loop; returns the first due instant (null for `off`). Safe to
     * call twice — the second call is a no-op. */
    start() {
        if (this.options.spec.kind === 'off' || this.running)
            return this.nextRunAt;
        this.running = true;
        this.loop = this.run();
        return this.nextRunAt;
    }
    stop() {
        this.running = false;
        this.next = null;
        this.wake?.();
    }
    /** Resolves when the loop has observed the stop flag (never rejects). */
    async settle() {
        await this.loop;
    }
    now() {
        return this.options.now ? this.options.now() : new Date();
    }
    /** Real timer, but `stop()` wakes it so a teardown never waits out a full
     * interval. Unref'd so a forgotten scheduler cannot hold the process open. */
    defaultSleep(ms) {
        return new Promise((resolve) => {
            const done = () => {
                this.wake = null;
                resolve();
            };
            const timer = setTimeout(done, Math.min(ms, MAX_TIMER_MS));
            timer.unref?.();
            this.wake = () => {
                clearTimeout(timer);
                done();
            };
        });
    }
    async run() {
        while (this.running) {
            const next = nextRunAt(this.options.spec, this.now());
            if (!next)
                break;
            this.next = next;
            this.options.log?.(`下次扫描：${next.toISOString()}`);
            const delay = Math.max(0, next.getTime() - this.now().getTime());
            await (this.options.sleep ? this.options.sleep(delay) : this.defaultSleep(delay));
            if (!this.running)
                break;
            this.next = null;
            try {
                await this.options.task(next, this.now());
            }
            catch (error) {
                this.options.onError?.(error);
                this.options.log?.(`定时扫描失败：${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.running = false;
        this.next = null;
    }
}
//# sourceMappingURL=scheduler.js.map