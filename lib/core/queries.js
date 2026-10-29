import { allSegments, latestSnapshotDate, previousSnapshotDate, snapshotsForDate } from './storage.js';
import { round } from './util.js';
import { scoreRepos } from './scoring.js';
const SCORE_COLUMNS = `s.repo_id, s.stars, s.npm_weekly, s.release_downloads, s.segment,
       r.created_at, r.pushed_at, r.ci, r.tests_count, r.issue_close_hours,
       m.npm_name, m.confidence, p.weekly_downloads, p.range_prev`;
/** Arrays instead of one object per row: at 10k repos the row shape is the
 * dominant allocation, and the column order is fixed by SCORE_COLUMNS. */
function rowFromArray(values) {
    return {
        repoId: String(values[0]),
        stars: Number(values[1] ?? 0),
        npmWeekly: values[2] === null || values[2] === undefined ? null : Number(values[2]),
        releaseDownloads: values[3] === null || values[3] === undefined ? null : Number(values[3]),
        segment: String(values[4] ?? 'other'),
        createdAt: String(values[5] ?? ''),
        pushedAt: String(values[6] ?? ''),
        ci: values[7] === null || values[7] === undefined ? null : Number(values[7]),
        testsCount: values[8] === null || values[8] === undefined ? null : Number(values[8]),
        issueCloseHours: values[9] === null || values[9] === undefined ? null : Number(values[9]),
        npmName: values[10] === null || values[10] === undefined ? null : String(values[10]),
        mapConfidence: values[11] === null || values[11] === undefined ? null : Number(values[11]),
        pkgWeekly: values[12] === null || values[12] === undefined ? null : Number(values[12]),
        pkgPrev: values[13] === null || values[13] === undefined ? null : Number(values[13]),
    };
}
function descriptions(db, ids) {
    const out = new Map();
    if (!ids.length)
        return out;
    const rows = db.raw
        .prepare(`SELECT id, description FROM repos WHERE id IN (${ids.map(() => '?').join(',')})`)
        .all(...ids);
    for (const row of rows)
        out.set(row.id, row.description);
    return out;
}
export function scoredSet(db, date, now = new Date()) {
    const target = date ?? latestSnapshotDate(db);
    if (!target)
        return { date: null, previousDate: null, scores: [] };
    const previous = previousSnapshotDate(db, target);
    const prevWeekly = new Map();
    if (previous) {
        const statement = db.raw.prepare('SELECT repo_id, npm_weekly FROM snapshots WHERE scan_date = ?');
        statement.setReturnArrays(true);
        for (const row of statement.all(previous)) {
            prevWeekly.set(String(row[0]), row[1] === null || row[1] === undefined ? null : Number(row[1]));
        }
    }
    // One join instead of three: snapshot + repo facts + the best-confidence npm
    // mapping and its package, so a 10k-repo day materialises once.
    const statement = db.raw.prepare(`SELECT ${SCORE_COLUMNS}
     FROM snapshots s
     JOIN repos r ON r.id = s.repo_id
     LEFT JOIN repo_npm_map m ON m.repo_id = s.repo_id
     LEFT JOIN npm_packages p ON p.name = m.npm_name
     WHERE s.scan_date = ?`);
    statement.setReturnArrays(true);
    const rows = statement.all(target).map(rowFromArray);
    const best = new Map();
    for (const row of rows) {
        const current = best.get(row.repoId);
        if (!current) {
            best.set(row.repoId, row);
            continue;
        }
        const confidence = row.mapConfidence ?? -1;
        const currentConfidence = current.mapConfidence ?? -1;
        if (confidence > currentConfidence || (confidence === currentConfidence && String(row.npmName) < String(current.npmName))) {
            best.set(row.repoId, row);
        }
    }
    const inputs = [];
    for (const row of best.values()) {
        const mapped = row.npmName !== null;
        const fromSnapshot = prevWeekly.get(row.repoId);
        const weekly = row.npmWeekly ?? (mapped ? row.pkgWeekly : null);
        const prev = fromSnapshot !== undefined ? fromSnapshot : mapped ? row.pkgPrev : null;
        inputs.push({
            repoId: row.repoId,
            segment: row.segment,
            stars: row.stars,
            description: '',
            weekly: weekly ?? null,
            prev: prev ?? null,
            releaseDownloads: row.releaseDownloads,
            createdAt: row.createdAt,
            pushedAt: row.pushedAt,
            ci: row.ci === null ? null : row.ci !== 0,
            testsCount: row.testsCount,
            issueCloseHours: row.issueCloseHours,
        });
    }
    return { date: target, previousDate: previous, scores: scoreRepos(inputs, { now }) };
}
export function topRows(db, options = {}) {
    const set = scoredSet(db, options.date);
    const limit = Math.max(1, options.limit ?? 10);
    const selected = set.scores
        .filter((row) => (options.segment ? row.segment === options.segment : true))
        .filter((row) => options.includeInsufficient || !row.insufficient)
        .slice(0, limit);
    const byId = descriptions(db, selected.map((row) => row.repoId));
    const rows = selected.map((row) => toTopRow(row, byId.get(row.repoId) ?? ''));
    return { date: set.date, rows };
}
function toTopRow(row, description) {
    return {
        repoId: row.repoId,
        segment: row.segment,
        score: row.score,
        velocity: row.velocity,
        adoption: row.adoption,
        quality: row.quality,
        maintenance: row.maintenance,
        cohort: row.cohort,
        rank: row.rank,
        insufficient: row.insufficient,
        outlier: row.outlier,
        npmWeekly: row.npmWeekly,
        releaseDownloads: row.releaseDownloads,
        stars: row.stars,
        description,
    };
}
export function diffRows(db, toDate, fromDate) {
    const to = toDate ?? latestSnapshotDate(db);
    if (!to)
        return { from: null, to: null, rows: [] };
    const from = fromDate ?? previousSnapshotDate(db, to);
    const toSnaps = snapshotsForDate(db, to);
    const fromSnaps = from ? snapshotsForDate(db, from) : [];
    const before = new Map(fromSnaps.map((row) => [row.repoId, row]));
    const rows = [];
    for (const snap of toSnaps) {
        const prev = before.get(snap.repoId) ?? null;
        const starsDelta = snap.stars - (prev?.stars ?? snap.stars);
        const npmDelta = prev && prev.npmWeekly !== null && snap.npmWeekly !== null ? snap.npmWeekly - prev.npmWeekly : null;
        const releaseDelta = prev && prev.releaseDownloads !== null && snap.releaseDownloads !== null ? snap.releaseDownloads - prev.releaseDownloads : null;
        rows.push({
            repoId: snap.repoId,
            segment: snap.segment,
            from: prev
                ? { date: prev.date, stars: prev.stars, npmWeekly: prev.npmWeekly, releaseDownloads: prev.releaseDownloads }
                : null,
            to: { date: snap.date, stars: snap.stars, npmWeekly: snap.npmWeekly, releaseDownloads: snap.releaseDownloads },
            starsDelta,
            npmDelta,
            releaseDelta,
        });
    }
    rows.sort((a, b) => (b.npmDelta ?? b.starsDelta) - (a.npmDelta ?? a.starsDelta));
    return { from, to, rows };
}
export function overview(db, date) {
    const target = date ?? latestSnapshotDate(db);
    if (!target)
        return { date: null, rows: [], totalRepos: 0, mapped: 0 };
    const snaps = snapshotsForDate(db, target);
    const labels = allSegments(db);
    const segmentsByRepo = new Map();
    for (const snap of snaps) {
        const own = labels.get(snap.repoId);
        segmentsByRepo.set(snap.repoId, own && own.length ? own.map((label) => label.segment) : [snap.segment]);
    }
    const groups = new Map();
    for (const snap of snaps) {
        const assigned = segmentsByRepo.get(snap.repoId) ?? [snap.segment];
        for (const segment of assigned) {
            const group = groups.get(segment) ?? { repos: 0, stars: 0, weekly: 0, labelTotal: 0 };
            group.repos += 1;
            group.stars += snap.stars;
            group.weekly += snap.npmWeekly ?? 0;
            group.labelTotal += assigned.length;
            groups.set(segment, group);
        }
    }
    const rows = [...groups.entries()].map(([segment, group]) => {
        const groupStars = snaps
            .filter((snap) => (segmentsByRepo.get(snap.repoId) ?? []).includes(segment))
            .map((snap) => snap.stars)
            .sort((a, b) => a - b);
        const medianStars = groupStars.length ? groupStars[Math.floor(groupStars.length / 2)] ?? 0 : 0;
        return {
            segment,
            repos: group.repos,
            stars: group.stars,
            weeklyDownloads: group.weekly,
            medianStars,
            multiLabel: group.labelTotal / Math.max(1, group.repos),
        };
    });
    rows.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads || b.stars - a.stars);
    const mappedRows = db.raw.prepare('SELECT COUNT(DISTINCT repo_id) AS n FROM repo_npm_map').get();
    return { date: target, rows, totalRepos: snaps.length, mapped: mappedRows?.n ?? 0 };
}
export function unmatchedRepos(db) {
    const rows = db.raw
        .prepare(`SELECT r.* FROM repos r LEFT JOIN repo_npm_map m ON m.repo_id = r.id
       WHERE m.repo_id IS NULL AND r.archived = 0 ORDER BY r.stars DESC`)
        .all();
    return rows.map((row) => ({
        id: String(row.id),
        description: String(row.description ?? ''),
        stars: Number(row.stars ?? 0),
        forks: Number(row.forks ?? 0),
        openIssues: Number(row.open_issues ?? 0),
        language: row.language ?? null,
        license: row.license ?? null,
        topics: JSON.parse(String(row.topics ?? '[]')),
        createdAt: String(row.created_at ?? ''),
        pushedAt: String(row.pushed_at ?? ''),
        lastCommitAt: row.last_commit_at ?? null,
        contributors: row.contributors_count ?? null,
        ci: row.ci === null || row.ci === undefined ? null : Number(row.ci) !== 0,
        testsCount: row.tests_count ?? null,
        issueCloseHours: row.issue_close_hours ?? null,
        archived: Number(row.archived) !== 0,
        detailsFetchedAt: row.details_fetched_at ?? null,
        updatedAt: String(row.updated_at ?? ''),
    }));
}
const TABLE_WHITELIST = new Set([
    'repos',
    'snapshots',
    'npm_packages',
    'repo_npm_map',
    'segment_overrides',
    'repo_segments',
    'snapshot_segments',
    'scans',
    'scan_errors',
    'release_cache',
    'etag_cache',
    'alert_events',
    'meta',
    'schema_migrations',
]);
export class UnsafeQueryError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsafeQueryError';
    }
}
/** Defence in depth: strip comments, allow a single SELECT/WITH statement, and
 * wrap it in a subquery so SQLite itself rejects any write. */
export function assertReadOnlySql(sql) {
    const stripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ')
        .trim();
    if (!stripped)
        throw new UnsafeQueryError('empty SQL');
    const withoutTrailing = stripped.replace(/;\s*$/, '');
    if (withoutTrailing.includes(';'))
        throw new UnsafeQueryError('multiple statements are not allowed');
    if (!/^(select|with|explain)\b/i.test(withoutTrailing))
        throw new UnsafeQueryError('only SELECT / WITH / EXPLAIN is allowed');
    if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|begin|commit|rollback|savepoint)\b/i.test(withoutTrailing)) {
        throw new UnsafeQueryError('write keyword in query');
    }
    const referenced = [...withoutTrailing.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)].map((match) => (match[1] ?? '').toLowerCase());
    const cteNames = new Set([...withoutTrailing.matchAll(/\b([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((match) => (match[1] ?? '').toLowerCase()).filter(Boolean));
    for (const table of referenced) {
        if (!TABLE_WHITELIST.has(table) && !cteNames.has(table))
            throw new UnsafeQueryError(`table not allowed: ${table}`);
    }
    return withoutTrailing;
}
export function queryReadOnly(db, sql, limit = 200) {
    const safe = assertReadOnlySql(sql);
    const cap = Math.max(1, Math.min(1000, limit));
    const wrapped = /^explain\b/i.test(safe) ? safe : `SELECT * FROM (${safe}) LIMIT ${cap + 1}`;
    const statement = db.raw.prepare(wrapped);
    const raw = statement.all();
    const truncated = raw.length > cap;
    const rows = raw.slice(0, cap);
    const columns = statement.columns().map((column) => column.name);
    return { columns, rows, truncated };
}
/** Every snapshot of one day with the v1 audit fields plus the v2 additions
 * (segment confidence and both weeks of the npm range), so a JSONL dump can
 * rebuild the store without re-hitting the network. */
export function snapshotExportRows(db, date) {
    const rows = db.raw
        .prepare(`SELECT s.repo_id AS repoId, s.stars, s.npm_weekly AS npmWeekly, s.release_downloads AS releaseDownloads,
              s.segment, s.segment_confidence AS segmentConfidence,
              SUM(p.range_week) AS npmRangeWeek, SUM(p.range_prev) AS npmRangePrev
       FROM snapshots s
       LEFT JOIN repo_npm_map m ON m.repo_id = s.repo_id
       LEFT JOIN npm_packages p ON p.name = m.npm_name
       WHERE s.scan_date = ?
       GROUP BY s.repo_id
       ORDER BY s.stars DESC, s.repo_id`)
        .all(date);
    return rows.map((row) => ({
        ...row,
        npmRangeWeek: row.npmRangeWeek ?? null,
        npmRangePrev: row.npmRangePrev ?? null,
    }));
}
export function coverage(db) {
    const repo = db.raw.prepare('SELECT COUNT(*) AS n FROM repos').get();
    const mapped = db.raw.prepare('SELECT COUNT(DISTINCT repo_id) AS n FROM repo_npm_map').get();
    const date = latestSnapshotDate(db);
    if (!date)
        return { repos: repo?.n ?? 0, mapped: mapped?.n ?? 0, withWeekly: 0, withReleases: 0 };
    const row = db.raw
        .prepare(`SELECT SUM(CASE WHEN npm_weekly IS NOT NULL THEN 1 ELSE 0 END) AS weekly,
              SUM(CASE WHEN release_downloads IS NOT NULL THEN 1 ELSE 0 END) AS releases
       FROM snapshots WHERE scan_date = ?`)
        .get(date);
    return { repos: repo?.n ?? 0, mapped: mapped?.n ?? 0, withWeekly: row?.weekly ?? 0, withReleases: row?.releases ?? 0 };
}
export function scoreSummary(rows) {
    const scores = rows.map((row) => row.score).sort((a, b) => a - b);
    const mid = Math.floor(scores.length / 2);
    return {
        median: round(scores.length ? (scores.length % 2 ? (scores[mid] ?? 0) : ((scores[mid - 1] ?? 0) + (scores[mid] ?? 0)) / 2) : 0, 2),
        outliers: rows.filter((row) => row.outlier).length,
        insufficient: rows.filter((row) => row.insufficient).length,
    };
}
//# sourceMappingURL=queries.js.map