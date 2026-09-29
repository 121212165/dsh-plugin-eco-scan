export { name, Config, apply, inject, runScan } from './plugin.ts';
export type { Config as EcoScanConfig } from './plugin.ts';
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
