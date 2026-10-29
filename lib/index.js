/** Package entry. `apply`/`Config` are the dsh surface; everything else is the
 * reusable eco-core library plus the frozen v1 helpers kept for compatibility. */
export { name, Config, apply } from './plugin.js';
export { runScanV1 } from './v1.js';
export * from './core/index.js';
export { segmentOf, segmentStats, renderSegments, SEGMENT_LABEL, } from './eco/segment.js';
export { growthRow, rankGrowth, renderGrowth, renderSegmentsGrowth, weekGrowth, rankLiveGrowth, renderLiveGrowth, } from './eco/growth.js';
export { SnapshotStore, expandHome } from './eco/snapshot.js';
export { fetchTopicRepos, fetchNpmWeekly, fetchNpmRangeGrowth, fetchReleaseDownloads, readTokenFromEnv } from './eco/sources.js';
//# sourceMappingURL=index.js.map