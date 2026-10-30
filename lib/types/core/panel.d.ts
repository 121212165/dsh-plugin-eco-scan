/** Self-contained HTML panel: one file, inline CSS, inline SVG. It carries the
 * same numbers as the JSON report plus two shapes a table cannot show — a
 * 12-snapshot sparkline per ranked repo and a segment × date heatmap. No
 * scripts and no external assets, so it can be opened from disk or served by
 * any static file server without a build step. */
import type { RepoPoint, SegmentHeatmap } from './history.ts';
import type { DiffRow, OverviewRow, TopRow } from './types.ts';
export interface PanelData {
    date: string | null;
    generatedAt: string;
    scores: TopRow[];
    segments: OverviewRow[];
    diff: DiffRow[];
    stats: {
        repos: number;
        mapped: number;
        withWeekly: number;
        withReleases: number;
    };
    series: Map<string, RepoPoint[]>;
    heatmap: SegmentHeatmap;
}
export declare function htmlEscape(value: unknown): string;
export declare function pct(part: number, total: number): string;
/** Nulls remain gaps: dashed connectors mark interruptions without treating
 * missing observations as zero or including them in the vertical scale. */
export declare function sparkline(values: readonly (number | null)[]): string;
export declare function renderPanel(data: PanelData): string;
//# sourceMappingURL=panel.d.ts.map