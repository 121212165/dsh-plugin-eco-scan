import { DatabaseSync } from 'node:sqlite';
export interface EcoDb {
    readonly raw: DatabaseSync;
    readonly path: string;
    close(): void;
}
export declare const SCHEMA_VERSION: number;
export declare function openDb(path: string, options?: {
    readOnly?: boolean;
}): EcoDb;
/** Applies every migration newer than the recorded version. Idempotent. */
export declare function migrate(db: EcoDb): number;
export declare function schemaVersion(db: EcoDb): number;
export declare function transaction<T>(db: EcoDb, work: () => T): T;
export declare function getMeta(db: EcoDb, key: string): string | null;
export declare function setMeta(db: EcoDb, key: string, value: string): void;
export declare function openReadOnly(path: string): EcoDb;
//# sourceMappingURL=db.d.ts.map