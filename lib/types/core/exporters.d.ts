import type { EcoDb } from './db.ts';
export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'md' | 'html';
export interface ExportInput {
    db: EcoDb;
    format: ExportFormat;
    date?: string;
    limit?: number;
    dataDir?: string;
    generatedAt?: string;
    /** overwrite `<exports>/panel.html` instead of a timestamped file, so a
     * bookmark or a cron-driven link keeps resolving to the newest report */
    stable?: boolean;
}
export interface ExportResult {
    format: ExportFormat;
    date: string | null;
    content: string;
    path: string | null;
}
export declare function buildExport(input: ExportInput): ExportResult;
/** The panel is the HTML export written to a stable path. Same builder, so the
 * numbers cannot drift between the timestamped report and the live page. */
export declare function buildPanel(db: EcoDb, options?: {
    dataDir?: string;
    date?: string;
    limit?: number;
    generatedAt?: string;
}): ExportResult;
//# sourceMappingURL=exporters.d.ts.map