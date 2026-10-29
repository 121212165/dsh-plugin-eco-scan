import type { MappingRow } from './types.ts';
import type { NpmPackageInfo } from './collectors/npm.ts';
export interface MappingPair {
    repoId: string;
    npmName: string;
    confidence: number;
    source: MappingRow['source'];
}
export interface MappingResult {
    mapping: MappingRow[];
    unmatched: string[];
    ambiguous: {
        repoId: string;
        candidates: string[];
    }[];
}
export declare function normalizePackageStem(name: string): string;
export declare function normalizeRepoStem(repoId: string): string;
export declare function levenshtein(a: string, b: string): number;
/** Confidence for one repo/package pair, or 0 when they are unrelated. */
export declare function heuristicConfidence(repoId: string, packageName: string): number;
export declare function parseManualMapping(text: string): MappingPair[];
/** Best-effort extraction from an awesome-list style markdown: one repo and
 * one or more npm links per line/table row. */
export declare function parseAwesomeReadme(text: string): MappingPair[];
/** Parse a package.json-style repository URL into owner/repo. */
export declare function repoFromRepositoryUrl(url: string | null): string | null;
export declare function registryMappings(packages: readonly NpmPackageInfo[]): MappingPair[];
export declare function buildMappings(input: {
    repoIds: readonly string[];
    packages: readonly NpmPackageInfo[];
    manual?: readonly MappingPair[];
    awesome?: readonly MappingPair[];
    heuristicFloor?: number;
    now?: string;
}): MappingResult;
/** Primary package per repo: highest confidence, then manual first. */
export declare function primaryPackage(rows: readonly MappingRow[]): MappingRow | null;
//# sourceMappingURL=mapping.d.ts.map