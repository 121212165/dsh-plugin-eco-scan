import type { EcoRepo } from './segment.ts';
import type { RepoSeries } from './growth.ts';
/** One observation per repo per scan date, JSONL per month in a plugin-owned
 * directory — the same durable sidecar pattern as the rest of the family.
 * Growth is the DIFF between today's snapshot and the previous one, so the
 * value of this store compounds daily. */
export interface SnapshotRecord {
    v: 1;
    date: string;
    fullName: string;
    segment: string;
    stars: number;
    npmWeekly?: number;
    releaseDownloads?: number;
}
export declare class SnapshotStore {
    readonly dataDir: string;
    constructor(dataDir: string | undefined);
    fileFor(date: string): string;
    append(repo: EcoRepo, segment: string, date: string): SnapshotRecord;
    readAll(): {
        records: SnapshotRecord[];
        skipped: number;
    };
    /** Merge every snapshot into per-repo series (dedupe: last observation per date). */
    series(): RepoSeries[];
}
export declare function expandHome(dir: string): string;
//# sourceMappingURL=snapshot.d.ts.map