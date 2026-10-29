/** Public surface of eco-core. The plugin shell and the CLI both import from
 * here; nothing below this file knows that dsh exists. */
export { openDb, openReadOnly, migrate, schemaVersion, SCHEMA_VERSION, transaction } from './db.js';
export { ecoPaths, ensureDefaultFiles, DEFAULT_RULES_YAML, DEFAULT_MAPPING_YAML, DEFAULT_ALERTS_YAML } from './defaults.js';
export { HttpClient, HttpError, CircuitOpenError, githubHeaders, readToken } from './http.js';
export { fetchCorpus, fetchCorpusGraphql, fetchCorpusRest, enrichDetails, CORPUS_QUERIES, errorText } from './collectors/github.js';
export { searchPackages, fetchDownloadStats, weekGrowthFrom, rangeWindow, downloadWindows } from './collectors/npm.js';
export { fetchReleaseDownloads, fetchReleaseBatch } from './collectors/releases.js';
export { buildMappings, parseManualMapping, parseAwesomeReadme, registryMappings, repoFromRepositoryUrl, heuristicConfidence, normalizePackageStem, normalizeRepoStem, primaryPackage, levenshtein } from './mapping.js';
export { SegmentBook, applyOverride } from './segmentation.js';
export { scoreRepos, rankInSegment, smoothedGrowth, velocityScore, adoptionScore, qualityScore, maintenanceScore, WEIGHTS, VELOCITY_PRIOR, MIN_PREV_FOR_VELOCITY } from './scoring.js';
export { scoredSet, topRows, diffRows, overview, unmatchedRepos, queryReadOnly, assertReadOnlySql, coverage, scoreSummary, snapshotExportRows, UnsafeQueryError } from './queries.js';
export { buildExport, buildPanel } from './exporters.js';
export { renderPanel, sparkline, htmlEscape, pct } from './panel.js';
export { repoSeries, segmentHeatmap, lastSnapshotDates } from './history.js';
export { calibrate, renderCalibration, spearman, ranks } from './calibrate.js';
export { Scheduler, parseSchedule, nextRunAt, describeSchedule, ScheduleError, SCHEDULE_HINT } from './scheduler.js';
export { parseAlertRules, loadAlertRules, evaluateAlerts, deliverWebhook } from './alerts.js';
export { migrateV1, v1Files, parseV1Line } from './migrate.js';
export { runScan, renderScanReport } from './scan.js';
export * from './storage.js';
//# sourceMappingURL=index.js.map