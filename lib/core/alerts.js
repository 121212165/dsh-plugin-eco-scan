/** Alert rules over the latest snapshot: npm growth spikes, newly created
 * repos, and mapping gaps. Events are deduped per (rule, repo, date) in SQLite,
 * so a rerun is silent; delivery is best-effort (webhook failures are reported,
 * never thrown). */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_ALERTS_YAML } from './defaults.js';
import { latestSnapshotDate, recordAlert, snapshotsForDate } from './storage.js';
import { scoredSet } from './queries.js';
import { daysSince, isRecord } from './util.js';
export function parseAlertRules(text) {
    const document = parseYaml(text);
    const raw = isRecord(document) && Array.isArray(document.rules) ? document.rules : [];
    const rules = [];
    for (const value of raw) {
        if (!isRecord(value))
            continue;
        const id = typeof value.id === 'string' ? value.id : null;
        const type = value.type;
        if (!id || (type !== 'growth-pct' && type !== 'new-repo' && type !== 'mapping-unmatched'))
            continue;
        rules.push({
            id,
            type,
            threshold: typeof value.threshold === 'number' ? value.threshold : null,
            minPrev: typeof value.minPrev === 'number' ? value.minPrev : null,
            maxAgeDays: typeof value.maxAgeDays === 'number' ? value.maxAgeDays : null,
            segment: typeof value.segment === 'string' && value.segment ? value.segment : null,
        });
    }
    return rules;
}
export function loadAlertRules(path) {
    if (!path)
        return parseAlertRules(DEFAULT_ALERTS_YAML);
    try {
        return parseAlertRules(readFileSync(path, 'utf8'));
    }
    catch {
        return parseAlertRules(DEFAULT_ALERTS_YAML);
    }
}
export function evaluateAlerts(db, rules, options = {}) {
    const date = options.date ?? latestSnapshotDate(db);
    const now = options.now ?? new Date();
    if (!date)
        return { date: null, fired: [], suppressed: 0, skipped: rules.map((rule) => rule.id) };
    const scored = scoredSet(db, date, now);
    const fired = [];
    const skipped = [];
    let suppressed = 0;
    const emit = (event) => {
        if (options.dryRun) {
            fired.push(event);
            return;
        }
        if (recordAlert(db, event.ruleId, event.repoId, event.date, event.payload))
            fired.push(event);
        else
            suppressed++;
    };
    for (const rule of rules) {
        if (rule.type === 'growth-pct') {
            const threshold = (rule.threshold ?? 50) / 100;
            const minPrev = rule.minPrev ?? 20;
            let matched = 0;
            for (const row of scored.scores) {
                if (row.npmWeekly === null)
                    continue;
                if (rule.segment && row.segment !== rule.segment)
                    continue;
                const prevWeekly = previousWeekly(db, date, row.repoId);
                if (prevWeekly === null || prevWeekly < minPrev)
                    continue;
                const growth = (row.npmWeekly - prevWeekly) / prevWeekly;
                if (growth < threshold)
                    continue;
                matched++;
                emit({
                    ruleId: rule.id,
                    repoId: row.repoId,
                    date,
                    type: rule.type,
                    message: `${row.repoId} 周下载 ${prevWeekly} → ${row.npmWeekly}（${Math.round(growth * 100)}%）`,
                    payload: { weekly: row.npmWeekly, prev: prevWeekly, growth, segment: row.segment, stars: row.stars },
                });
            }
            if (!matched)
                skipped.push(rule.id);
            continue;
        }
        if (rule.type === 'new-repo') {
            const maxAge = rule.maxAgeDays ?? 14;
            const rows = db.raw
                .prepare(`SELECT r.id, r.created_at, r.stars FROM repos r
           WHERE r.archived = 0 AND r.created_at IS NOT NULL
             AND julianday(?) - julianday(r.created_at) <= ?`)
                .all(now.toISOString(), maxAge);
            const visible = new Set(snapshotsForDate(db, date).map((snap) => snap.repoId));
            let matched = 0;
            for (const row of rows) {
                if (!visible.has(row.id))
                    continue;
                const age = daysSince(row.created_at, now);
                matched++;
                emit({
                    ruleId: rule.id,
                    repoId: row.id,
                    date,
                    type: rule.type,
                    message: `新仓库 ${row.id}（${age === null ? '?' : Math.round(age)} 天，★${row.stars}）`,
                    payload: { createdAt: row.created_at, stars: row.stars },
                });
            }
            if (!matched)
                skipped.push(rule.id);
            continue;
        }
        const threshold = rule.threshold ?? 10;
        const row = db.raw
            .prepare('SELECT COUNT(*) AS n FROM repos r LEFT JOIN repo_npm_map m ON m.repo_id = r.id WHERE m.repo_id IS NULL AND r.archived = 0')
            .get();
        const unmatched = row?.n ?? 0;
        if (unmatched <= threshold) {
            skipped.push(rule.id);
            continue;
        }
        emit({
            ruleId: rule.id,
            repoId: '__global__',
            date,
            type: rule.type,
            message: `${unmatched} 个仓库没有 npm 映射（阈值 ${threshold}）`,
            payload: { unmatched },
        });
    }
    return { date, fired, suppressed, skipped };
}
function previousWeekly(db, date, repoId) {
    const previous = db.raw
        .prepare('SELECT MAX(scan_date) AS date FROM snapshots WHERE scan_date < ?')
        .get(date);
    if (!previous?.date)
        return null;
    const row = db.raw
        .prepare('SELECT npm_weekly FROM snapshots WHERE scan_date = ? AND repo_id = ?')
        .get(previous.date, repoId);
    return row?.npm_weekly ?? null;
}
export async function deliverWebhook(url, run, fetchImpl = globalThis.fetch) {
    if (!url || !run.fired.length)
        return { attempted: false, ok: true, status: null, error: null };
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'dsh-plugin-eco-scan', date: run.date, alerts: run.fired }),
            signal: AbortSignal.timeout(10_000),
        });
        return { attempted: true, ok: response.ok, status: response.status, error: response.ok ? null : `HTTP ${response.status}` };
    }
    catch (error) {
        return { attempted: true, ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=alerts.js.map