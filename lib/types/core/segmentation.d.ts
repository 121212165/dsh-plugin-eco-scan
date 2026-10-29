import type { SegmentLabel } from './types.ts';
export interface SegmentRule {
    id: string;
    label: string;
    weight: number;
    keywords: string[];
    topics: string[];
    namePatterns: string[];
}
export interface SegmentInput {
    id: string;
    description: string;
    topics: string[];
}
export declare class SegmentBook {
    private rules;
    private compiled;
    private signature;
    private readonly filePath;
    private readonly maxLabels;
    constructor(options?: {
        filePath?: string | null;
        text?: string;
        maxLabels?: number;
    });
    get ruleCount(): number;
    labels(): Map<string, string>;
    /** Re-reads the rules file when it changed. Returns true when reloaded. */
    maybeReload(): boolean;
    load(text: string): void;
    classify(repo: SegmentInput): SegmentLabel[];
    /** Highest-confidence label; `other` when nothing matched. */
    primary(repo: SegmentInput): SegmentLabel;
}
/** Overrides are authoritative: the override label replaces rule labels. */
export declare function applyOverride(labels: SegmentLabel[], override: {
    segment: string;
    reason: string | null;
} | null): SegmentLabel[];
//# sourceMappingURL=segmentation.d.ts.map