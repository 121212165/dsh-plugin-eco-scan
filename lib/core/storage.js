import { getMeta, setMeta, transaction } from './db.js';
import { asStringArray, normalizeRepoId } from './util.js';
function toRepo(row) {
    return {
        id: row.id,
        description: row.description,
        stars: row.stars,
        forks: row.forks,
        openIssues: row.open_issues,
        language: row.language,
        license: row.license,
        topics: asStringArray(JSON.parse(row.topics)),
        createdAt: row.created_at,
        pushedAt: row.pushed_at,
        lastCommitAt: row.last_commit_at,
        contributors: row.contributors_count,
        ci: row.ci === null ? null : row.ci !== 0,
        testsCount: row.tests_count,
        issueCloseHours: row.issue_close_hours,
        archived: row.archived !== 0,
        detailsFetchedAt: row.details_fetched_at,
        updatedAt: row.updated_at,
    };
}
export function upsertRepo(db, facts, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO repos (id, description, stars, forks, open_issues, language, license, topics,
         created_at, pushed_at, last_commit_at, contributors_count, ci, tests_count, issue_close_hours,
         archived, details_fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description = excluded.description,
         stars = excluded.stars,
         forks = excluded.forks,
         open_issues = excluded.open_issues,
         language = excluded.language,
         license = excluded.license,
         topics = excluded.topics,
         created_at = excluded.created_at,
         pushed_at = excluded.pushed_at,
         last_commit_at = COALESCE(excluded.last_commit_at, repos.last_commit_at),
         contributors_count = COALESCE(excluded.contributors_count, repos.contributors_count),
         ci = COALESCE(excluded.ci, repos.ci),
         tests_count = COALESCE(excluded.tests_count, repos.tests_count),
         issue_close_hours = COALESCE(excluded.issue_close_hours, repos.issue_close_hours),
         archived = excluded.archived,
         details_fetched_at = COALESCE(excluded.details_fetched_at, repos.details_fetched_at),
         updated_at = excluded.updated_at`)
        .run(normalizeRepoId(facts.id), facts.description, facts.stars, facts.forks, facts.openIssues, facts.language, facts.license, JSON.stringify(facts.topics), facts.createdAt, facts.pushedAt, facts.lastCommitAt, facts.contributors, facts.ci === null ? null : facts.ci ? 1 : 0, facts.testsCount, facts.issueCloseHours, facts.archived ? 1 : 0, null, now);
}
export function upsertRepoDetails(db, facts, now = new Date().toISOString()) {
    upsertRepo(db, facts, now);
    db.raw.prepare('UPDATE repos SET details_fetched_at = ? WHERE id = ?').run(now, normalizeRepoId(facts.id));
}
export function getRepo(db, id) {
    const row = db.raw.prepare('SELECT * FROM repos WHERE id = ?').get(normalizeRepoId(id));
    return row ? toRepo(row) : null;
}
export function allRepos(db) {
    return db.raw.prepare('SELECT * FROM repos ORDER BY stars DESC').all().map(toRepo);
}
export function repoIds(db) {
    return db.raw.prepare('SELECT id FROM repos ORDER BY id').all().map((row) => row.id);
}
export function repoCount(db) {
    const row = db.raw.prepare('SELECT COUNT(*) AS n FROM repos').get();
    return row?.n ?? 0;
}
export function writeSnapshot(db, snapshot, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO snapshots (repo_id, scan_date, stars, npm_weekly, release_downloads, segment, segment_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, scan_date) DO UPDATE SET
         stars = excluded.stars,
         npm_weekly = excluded.npm_weekly,
         release_downloads = excluded.release_downloads,
         segment = excluded.segment,
         segment_confidence = excluded.segment_confidence`)
        .run(normalizeRepoId(snapshot.repoId), snapshot.date, snapshot.stars, snapshot.npmWeekly, snapshot.releaseDownloads, snapshot.segment, snapshot.segmentConfidence, now);
}
export function snapshotDates(db) {
    return db.raw.prepare('SELECT DISTINCT scan_date FROM snapshots ORDER BY scan_date').all().map((row) => row.scan_date);
}
export function latestSnapshotDate(db) {
    const row = db.raw.prepare('SELECT MAX(scan_date) AS date FROM snapshots').get();
    return row?.date ?? null;
}
export function snapshotCount(db) {
    const row = db.raw.prepare('SELECT COUNT(*) AS n FROM snapshots').get();
    return row?.n ?? 0;
}
export function snapshotsForDate(db, date) {
    const rows = db.raw.prepare('SELECT * FROM snapshots WHERE scan_date = ? ORDER BY repo_id').all(date);
    return rows.map((row) => ({
        id: row.id,
        repoId: row.repo_id,
        date: row.scan_date,
        stars: row.stars,
        npmWeekly: row.npm_weekly,
        releaseDownloads: row.release_downloads,
        segment: row.segment,
        segmentConfidence: row.segment_confidence,
        createdAt: row.created_at,
    }));
}
export function previousSnapshotDate(db, date) {
    const row = db.raw.prepare('SELECT MAX(scan_date) AS date FROM snapshots WHERE scan_date < ?').get(date);
    return row?.date ?? null;
}
export function replaceSegments(db, repoId, labels, now = new Date().toISOString()) {
    const id = normalizeRepoId(repoId);
    transaction(db, () => {
        db.raw.prepare('DELETE FROM repo_segments WHERE repo_id = ?').run(id);
        const insert = db.raw.prepare('INSERT INTO repo_segments (repo_id, segment, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?)');
        for (const label of labels)
            insert.run(id, label.segment, label.confidence, label.source, now);
    });
}
export function segmentsForRepo(db, repoId) {
    const rows = db.raw
        .prepare('SELECT segment, confidence, source FROM repo_segments WHERE repo_id = ? ORDER BY confidence DESC, segment')
        .all(normalizeRepoId(repoId));
    return rows.map((row) => ({ segment: row.segment, confidence: row.confidence, source: row.source }));
}
export function allSegments(db) {
    const rows = db.raw
        .prepare('SELECT repo_id, segment, confidence, source FROM repo_segments ORDER BY repo_id, confidence DESC')
        .all();
    const map = new Map();
    for (const row of rows) {
        const list = map.get(row.repo_id) ?? [];
        list.push({ segment: row.segment, confidence: row.confidence, source: row.source });
        map.set(row.repo_id, list);
    }
    return map;
}
export function writeSnapshotSegments(db, repoId, date, labels) {
    const insert = db.raw.prepare('INSERT OR REPLACE INTO snapshot_segments (repo_id, scan_date, segment, confidence) VALUES (?, ?, ?, ?)');
    for (const label of labels)
        insert.run(normalizeRepoId(repoId), date, label.segment, label.confidence);
}
export function upsertNpmPackage(db, stat) {
    db.raw
        .prepare(`INSERT INTO npm_packages (name, weekly_downloads, range_week, range_prev, growth_pct, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         weekly_downloads = excluded.weekly_downloads,
         range_week = excluded.range_week,
         range_prev = excluded.range_prev,
         growth_pct = excluded.growth_pct,
         fetched_at = excluded.fetched_at`)
        .run(stat.name, stat.weekly, stat.weekly, stat.prev, stat.growthPct, stat.fetchedAt);
}
export function npmStat(db, name) {
    const row = db.raw
        .prepare('SELECT name, weekly_downloads, range_week, range_prev, growth_pct, fetched_at FROM npm_packages WHERE name = ?')
        .get(name);
    if (!row)
        return null;
    return { name: row.name, weekly: row.weekly_downloads, prev: row.range_prev ?? 0, growthPct: row.growth_pct, fetchedAt: row.fetched_at };
}
export function npmCount(db) {
    const row = db.raw.prepare('SELECT COUNT(*) AS n FROM npm_packages').get();
    return row?.n ?? 0;
}
export function putMapping(db, row, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO repo_npm_map (repo_id, npm_name, confidence, source, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, npm_name) DO UPDATE SET
         confidence = excluded.confidence,
         source = excluded.source,
         updated_at = excluded.updated_at`)
        .run(normalizeRepoId(row.repoId), row.npmName, row.confidence, row.source, now);
}
export function mappingsFor(db, repoId) {
    const rows = db.raw
        .prepare('SELECT repo_id, npm_name, confidence, source FROM repo_npm_map WHERE repo_id = ? ORDER BY confidence DESC')
        .all(normalizeRepoId(repoId));
    return rows.map((row) => ({ repoId: row.repo_id, npmName: row.npm_name, confidence: row.confidence, source: row.source }));
}
export function allMappings(db) {
    const rows = db.raw.prepare('SELECT repo_id, npm_name, confidence, source FROM repo_npm_map').all();
    return rows.map((row) => ({ repoId: row.repo_id, npmName: row.npm_name, confidence: row.confidence, source: row.source }));
}
export function mappingCount(db) {
    const row = db.raw.prepare('SELECT COUNT(*) AS n FROM repo_npm_map').get();
    return row?.n ?? 0;
}
export function putOverride(db, repoId, segment, reason, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO segment_overrides (repo_id, segment, reason, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET segment = excluded.segment, reason = excluded.reason, updated_at = excluded.updated_at`)
        .run(normalizeRepoId(repoId), segment, reason, now);
}
export function overrides(db) {
    const rows = db.raw.prepare('SELECT repo_id, segment, reason FROM segment_overrides').all();
    return new Map(rows.map((row) => [row.repo_id, { segment: row.segment, reason: row.reason }]));
}
export function deleteOverride(db, repoId) {
    db.raw.prepare('DELETE FROM segment_overrides WHERE repo_id = ?').run(normalizeRepoId(repoId));
}
export function startScan(db, scanDate, now = new Date().toISOString()) {
    const result = db.raw
        .prepare('INSERT INTO scans (scan_date, repo_count, duration_ms, status, error, stage, checkpoint, created_at) VALUES (?, 0, 0, ?, NULL, ?, ?, ?)')
        .run(scanDate, 'partial', 'start', '{}', now);
    return Number(result.lastInsertRowid);
}
export function updateScan(db, scanId, patch) {
    const current = db.raw.prepare('SELECT stage, checkpoint, repo_count FROM scans WHERE id = ?').get(scanId);
    if (!current)
        return;
    db.raw
        .prepare('UPDATE scans SET stage = ?, checkpoint = ?, repo_count = ? WHERE id = ?')
        .run(patch.stage ?? current.stage, patch.checkpoint ? JSON.stringify(patch.checkpoint) : current.checkpoint, patch.repoCount ?? current.repo_count, scanId);
}
export function finishScan(db, scanId, status, repoCount, durationMs, error) {
    db.raw
        .prepare('UPDATE scans SET status = ?, repo_count = ?, duration_ms = ?, error = ?, stage = ? WHERE id = ?')
        .run(status, repoCount, durationMs, error, 'done', scanId);
}
export function recordScanError(db, scanId, stage, message, now = new Date().toISOString()) {
    db.raw
        .prepare('INSERT INTO scan_errors (scan_id, stage, message, created_at) VALUES (?, ?, ?, ?)')
        .run(scanId, stage, message.slice(0, 2000), now);
}
export function lastScan(db) {
    const row = db.raw.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 1').get();
    return row ? toScan(row) : null;
}
function toScan(row) {
    let checkpoint = {};
    try {
        const parsed = JSON.parse(row.checkpoint);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            checkpoint = parsed;
    }
    catch {
        checkpoint = {};
    }
    return {
        id: row.id,
        scanDate: row.scan_date,
        repoCount: row.repo_count,
        durationMs: row.duration_ms,
        status: row.status,
        error: row.error,
        stage: row.stage,
        checkpoint,
        createdAt: row.created_at,
    };
}
export function scanById(db, id) {
    const row = db.raw.prepare('SELECT * FROM scans WHERE id = ?').get(id);
    return row ? toScan(row) : null;
}
export function getReleaseCache(db, repoId) {
    const row = db.raw.prepare('SELECT downloads, etag, fetched_at FROM release_cache WHERE repo_id = ?').get(normalizeRepoId(repoId));
    return row ? { downloads: row.downloads, etag: row.etag, fetchedAt: row.fetched_at } : null;
}
export function putReleaseCache(db, repoId, downloads, etag, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO release_cache (repo_id, downloads, etag, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET downloads = excluded.downloads, etag = excluded.etag, fetched_at = excluded.fetched_at`)
        .run(normalizeRepoId(repoId), downloads, etag, now);
}
export function getEtag(db, key) {
    const row = db.raw.prepare('SELECT etag, body FROM etag_cache WHERE key = ?').get(key);
    return row ?? null;
}
export function putEtag(db, key, etag, body, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO etag_cache (key, etag, body, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET etag = excluded.etag, body = excluded.body, fetched_at = excluded.fetched_at`)
        .run(key, etag, body, now);
}
export function recordAlert(db, ruleId, repoId, scanDate, payload, now = new Date().toISOString()) {
    const result = db.raw
        .prepare(`INSERT INTO alert_events (rule_id, repo_id, scan_date, payload, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(rule_id, repo_id, scan_date) DO NOTHING`)
        .run(ruleId, normalizeRepoId(repoId), scanDate, JSON.stringify(payload), now);
    return Number(result.changes) > 0;
}
export function errorsByStage(db, scanId) {
    const rows = db.raw.prepare('SELECT stage, message FROM scan_errors WHERE scan_id = ? ORDER BY id').all(scanId);
    const out = {};
    for (const row of rows)
        (out[row.stage] ??= []).push(row.message);
    return out;
}
export function health(db, dbPath) {
    const recent = db.raw
        .prepare(`SELECT s.scan_date AS scanDate, e.stage AS stage, e.message AS message
       FROM scan_errors e JOIN scans s ON s.id = e.scan_id ORDER BY e.id DESC LIMIT 10`)
        .all();
    const schema = db.raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return {
        dbPath,
        schemaVersion: schema?.version ?? 0,
        repos: repoCount(db),
        snapshots: snapshotCount(db),
        npmPackages: npmCount(db),
        mappings: mappingCount(db),
        lastScan: lastScan(db),
        dates: snapshotDates(db),
        recentErrors: recent,
    };
}
export function meta(db, key) {
    return getMeta(db, key);
}
export function setMetaValue(db, key, value) {
    setMeta(db, key, value);
}
/** Migration-only insert: keeps richer v2 facts when they already exist. */
export function upsertLegacyRepo(db, repoId, date, stars, now = new Date().toISOString()) {
    db.raw
        .prepare(`INSERT INTO repos (id, description, stars, forks, open_issues, topics, created_at, pushed_at, archived, updated_at)
       VALUES (?, '', ?, 0, 0, '[]', ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET stars = MAX(repos.stars, excluded.stars)`)
        .run(normalizeRepoId(repoId), stars, date, date, now);
}
/** Migration must never clobber a v2 snapshot taken the same day. */
export function writeSnapshotIfAbsent(db, snapshot, now = new Date().toISOString()) {
    const result = db.raw
        .prepare(`INSERT INTO snapshots (repo_id, scan_date, stars, npm_weekly, release_downloads, segment, segment_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repo_id, scan_date) DO NOTHING`)
        .run(normalizeRepoId(snapshot.repoId), snapshot.date, snapshot.stars, snapshot.npmWeekly, snapshot.releaseDownloads, snapshot.segment, snapshot.segmentConfidence, now);
    return Number(result.changes) > 0;
}
/** Replaces all mappings from the given sources in one transaction; manual and
 * registry rows are refreshed on every scan, heuristics are rebuilt from
 * scratch so a renamed package does not leave a stale pair behind. */
export function replaceMappings(db, rows, sources) {
    transaction(db, () => {
        const placeholders = sources.map(() => '?').join(',');
        if (sources.length)
            db.raw.prepare(`DELETE FROM repo_npm_map WHERE source IN (${placeholders})`).run(...sources);
        for (const row of rows)
            putMapping(db, row);
    });
}
export function latestOpenScan(db, scanDate) {
    const row = db.raw
        .prepare("SELECT * FROM scans WHERE scan_date = ? AND status != 'ok' AND stage != 'done' ORDER BY id DESC LIMIT 1")
        .get(scanDate);
    return row ? toScan(row) : null;
}
//# sourceMappingURL=storage.js.map