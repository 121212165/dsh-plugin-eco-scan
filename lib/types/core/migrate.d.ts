import type { EcoDb } from './db.ts';
export interface MigrateResult {
    files: number;
    records: number;
    skipped: number;
    repos: number;
    dates: number;
    alreadyMigrated: boolean;
}
interface V1Record {
    date: string;
    fullName: string;
    segment: string;
    stars: number;
    npmWeekly: number | null;
    releaseDownloads: number | null;
}
export declare function v1Files(dir: string): string[];
export declare function parseV1Line(line: string): V1Record | null;
export declare function migrateV1(db: EcoDb, v1Dir: string, options?: {
    force?: boolean;
}): MigrateResult;
export {};
//# sourceMappingURL=migrate.d.ts.map