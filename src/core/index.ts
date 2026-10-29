/** Public surface of eco-core. The plugin shell and the CLI both import from
 * here; nothing below this file knows that dsh exists. */
export { openDb, openReadOnly, migrate, schemaVersion, SCHEMA_VERSION, transaction, type EcoDb } from './db.ts';
export { ecoPaths, ensureDefaultFiles, DEFAULT_RULES_YAML, DEFAULT_MAPPING_YAML, DEFAULT_ALERTS_YAML, type EcoPaths } from './defaults.ts';
export { HttpClient, HttpError, CircuitOpenError, githubHeaders, readToken, type HttpEvent, type HttpClientOptions } from './http.ts';
export { fetchCorpus, fetchCorpusGraphql, fetchCorpusRest, enrichDetails, CORPUS_QUERIES, errorText, type CorpusResult, type GithubOptions } from './collectors/github.ts';
export { searchPackages, fetchDownloadStats, weekGrowthFrom, rangeWindow, downloadWindows, type NpmPackageInfo, type NpmSearchResult, type DownloadResult, type DownloadWindows } from './collectors/npm.ts';
export { fetchReleaseDownloads, fetchReleaseBatch } from './collectors/releases.ts';
export { buildMappings, parseManualMapping, parseAwesomeReadme, registryMappings, repoFromRepositoryUrl, heuristicConfidence, normalizePackageStem, normalizeRepoStem, primaryPackage, levenshtein, type MappingPair, type MappingResult } from './mapping.ts';
export { SegmentBook, applyOverride, type SegmentRule, type SegmentInput } from './segmentation.ts';
export { scoreRepos, rankInSegment, smoothedGrowth, velocityScore, adoptionScore, qualityScore, maintenanceScore, WEIGHTS, VELOCITY_PRIOR, MIN_PREV_FOR_VELOCITY, type ScoreInput, type ScoreResult } from './scoring.ts';
export { scoredSet, topRows, diffRows, overview, unmatchedRepos, queryReadOnly, assertReadOnlySql, coverage, scoreSummary, snapshotExportRows, UnsafeQueryError, type SqlResult, type ScoredSet, type SnapshotExportRow } from './queries.ts';
export { buildExport, buildPanel, type ExportFormat, type ExportResult } from './exporters.ts';
export { renderPanel, sparkline, htmlEscape, pct, type PanelData } from './panel.ts';
export { repoSeries, segmentHeatmap, lastSnapshotDates, type RepoPoint, type SegmentHeatmap } from './history.ts';
export { calibrate, renderCalibration, spearman, ranks, type CalibrationReport, type CalibrationPair } from './calibrate.ts';
export { Scheduler, parseSchedule, nextRunAt, describeSchedule, ScheduleError, SCHEDULE_HINT, type ScheduleSpec, type SchedulerOptions } from './scheduler.ts';
export { parseAlertRules, loadAlertRules, evaluateAlerts, deliverWebhook, type AlertRule, type AlertEvent, type AlertRun } from './alerts.ts';
export { migrateV1, v1Files, parseV1Line, type MigrateResult } from './migrate.ts';
export { runScan, renderScanReport, type ScanOptions, type ScanReport } from './scan.ts';
export * from './storage.ts';
export type { RepoFacts, StoredRepo, SnapshotRow, SegmentLabel, MappingRow, ScanRecord, HealthReport, DiffRow, TopRow, OverviewRow, NpmStat, ErrorsByStage } from './types.ts';
