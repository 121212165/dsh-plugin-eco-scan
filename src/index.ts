/** Package entry. `apply`/`Config` are the dsh surface; everything else is the
 * reusable eco-core library plus the frozen v1 helpers kept for compatibility. */
export { name, Config, apply, type Config as EcoScanConfig } from './plugin.ts';
export { runScanV1 } from './v1.ts';

export * from './core/index.ts';

export {
  segmentOf,
  segmentStats,
  renderSegments,
  SEGMENT_LABEL,
  type EcoRepo,
  type Segment,
  type SegmentStat,
} from './eco/segment.ts';
export {
  growthRow,
  rankGrowth,
  renderGrowth,
  renderSegmentsGrowth,
  weekGrowth,
  rankLiveGrowth,
  renderLiveGrowth,
  type RepoSeries,
  type SnapshotPoint,
  type GrowthRow,
  type LiveGrowthRow,
} from './eco/growth.ts';
export { SnapshotStore, expandHome, type SnapshotRecord } from './eco/snapshot.ts';
export { fetchTopicRepos, fetchNpmWeekly, fetchNpmRangeGrowth, fetchReleaseDownloads, readTokenFromEnv, type RawRepo } from './eco/sources.ts';
