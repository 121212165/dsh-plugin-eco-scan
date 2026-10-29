/** Scan orchestration: corpus → details → npm → mapping → releases → snapshot.
 * Each stage is isolated so one dead source degrades that metric instead of the
 * run; every repo's snapshot is upserted immediately, so a crash leaves a
 * resumable, internally consistent database. */
import { existsSync, readFileSync } from 'node:fs';
import { HttpClient as HttpClientImpl } from './http.js';
import { fetchCorpus, enrichDetails, errorText } from './collectors/github.js';
import { fetchDownloadStats, searchPackages } from './collectors/npm.js';
import { fetchReleaseDownloads } from './collectors/releases.js';
import { buildMappings, parseAwesomeReadme, parseManualMapping } from './mapping.js';
import { SegmentBook, applyOverride } from './segmentation.js';
import { ecoPaths, ensureDefaultFiles } from './defaults.js';
import { allMappings, allRepos, finishScan, getReleaseCache, latestOpenScan, overrides as loadOverrides, putReleaseCache, recordScanError, replaceMappings, replaceSegments, startScan, updateScan, upsertNpmPackage, upsertRepo, upsertRepoDetails, writeSnapshot, writeSnapshotSegments, setMetaValue, } from './storage.js';
import { mapLimit, round, todayUtc } from './util.js';
import { coverage, overview, topRows } from './queries.js';
const STAGES = ['corpus', 'details', 'npm', 'releases', 'snapshot'];
export async function runScan(db, options = {}) {
    const now = options.now ?? new Date();
    const date = todayUtc(now);
    const log = options.log ?? (() => { });
    const paths = ecoPaths(options.dataDir);
    ensureDefaultFiles(paths);
    const http = options.http ?? new HttpClientImpl();
    const startedAt = Date.now();
    const pending = options.resume ? latestOpenScan(db, date) : null;
    const scanId = pending ? pending.id : startScan(db, date, now.toISOString());
    const done = new Set(Array.isArray(pending?.checkpoint.done) ? pending.checkpoint.done : []);
    const errors = [];
    const markDone = (stage) => {
        done.add(stage);
        updateScan(db, scanId, { stage, checkpoint: { done: [...done], date } });
    };
    const fail = (stage, error) => {
        const message = `${stage}: ${errorText(error)}`;
        errors.push(message);
        recordScanError(db, scanId, stage, message);
        log(message);
    };
    // ---- corpus -------------------------------------------------------------
    let corpus = null;
    if (!done.has('corpus')) {
        try {
            corpus = await fetchCorpus(http, {
                ...(options.token ? { token: options.token } : {}),
                ...(options.maxRepos ? { maxRepos: options.maxRepos } : {}),
                ...(options.restPacingMs !== undefined ? { restPacingMs: options.restPacingMs } : {}),
                log,
            });
            for (const facts of corpus.repos)
                upsertRepo(db, facts, now.toISOString());
            for (const message of corpus.errors)
                fail('corpus', message);
            setMetaValue(db, 'corpus-complete', corpus.complete ? '1' : '0');
            markDone('corpus');
        }
        catch (error) {
            fail('corpus', error);
        }
    }
    else {
        log('corpus: skipped (resume checkpoint)');
    }
    const repoRows = allRepos(db);
    if (!repoRows.length) {
        finishScan(db, scanId, 'failed', 0, Date.now() - startedAt, errors.join('; ') || 'no repositories collected');
        return {
            scanId,
            date,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            resumed: pending !== null,
            repos: 0,
            npmPackages: 0,
            mappings: 0,
            unmatched: 0,
            ambiguous: 0,
            corpusComplete: false,
            via: corpus?.via ?? 'none',
            coverage: { repos: 0, mapped: 0, withWeekly: 0, withReleases: 0 },
            errors: errors.length ? errors : ['GitHub 没有返回任何仓库（检查 token / 网络）'],
            segments: [],
            top: [],
            paths,
        };
    }
    // ---- details (CI / tests / contributors / issue close time) --------------
    if (!done.has('details')) {
        if (corpus?.via === 'graphql') {
            try {
                const ttlMs = (options.detailsTtlHours ?? 6) * 3_600_000;
                const fresh = new Set(repoRows
                    .filter((repo) => repo.detailsFetchedAt && now.getTime() - Date.parse(repo.detailsFetchedAt) < ttlMs)
                    .map((repo) => repo.id));
                const result = await enrichDetails(http, corpus.repos, {
                    ...(options.token ? { token: options.token } : {}),
                    log,
                    ttlHint: (repo) => !fresh.has(repo.id),
                });
                for (const facts of corpus.repos) {
                    if (fresh.has(facts.id))
                        continue;
                    if (facts.ci !== null || facts.testsCount !== null || facts.contributors !== null)
                        upsertRepoDetails(db, facts, now.toISOString());
                }
                errors.push(...result.errors.map((message) => `details: ${message}`));
                markDone('details');
            }
            catch (error) {
                fail('details', error);
            }
        }
        else {
            log('details: skipped (REST corpus has no batch-detail path)');
            markDone('details');
        }
    }
    // ---- npm + mapping ------------------------------------------------------
    let npmCount = 0;
    let unmatched = 0;
    let ambiguous = 0;
    if (!done.has('npm')) {
        try {
            const search = await searchPackages(http, { log });
            for (const message of search.errors.slice(0, 20))
                fail('npm', message);
            if (!search.packages.length)
                throw new Error('npm search returned no packages');
            const packages = search.packages;
            const manualText = options.manualMappingText ?? readIfPresent(paths.mappingPath);
            const manual = manualText ? parseManualMapping(manualText) : [];
            const awesomeText = options.awesomePath && existsSync(options.awesomePath) ? readIfPresent(options.awesomePath) : null;
            const awesome = awesomeText ? parseAwesomeReadme(awesomeText) : [];
            const built = buildMappings({
                repoIds: allRepos(db).map((repo) => repo.id),
                packages,
                manual,
                awesome,
            });
            replaceMappings(db, built.mapping, ['heuristic', 'registry', 'awesome']);
            unmatched = built.unmatched.length;
            ambiguous = built.ambiguous.length;
            setMetaValue(db, 'mapping-unmatched', String(built.unmatched.length));
            setMetaValue(db, 'mapping-unmatched-list', JSON.stringify(built.unmatched));
            setMetaValue(db, 'mapping-ambiguous', JSON.stringify(built.ambiguous));
            // Only mapped packages feed a snapshot, so only those need downloads.
            const names = [...new Set(built.mapping.map((pair) => pair.npmName))];
            if (names.length) {
                const knownWeekly = new Map();
                for (const pkg of packages)
                    if (pkg.weekly !== null)
                        knownWeekly.set(pkg.name, pkg.weekly);
                const downloads = await fetchDownloadStats(http, names, { now, log, knownWeekly });
                for (const message of downloads.errors.slice(0, 20))
                    fail('npm', message);
                if (!downloads.stats.size)
                    throw new Error(`no download stats for ${names.length} mapped packages`);
                for (const stat of downloads.stats.values())
                    upsertNpmPackage(db, stat);
                npmCount = downloads.stats.size;
            }
            markDone('npm');
            log(`npm: ${packages.length} packages searched, ${names.length} mapped, ${npmCount} with downloads, ${built.mapping.length} mappings`);
        }
        catch (error) {
            fail('npm', error);
        }
    }
    else {
        npmCount = db.raw.prepare('SELECT COUNT(*) AS n FROM npm_packages').get()?.n ?? 0;
        unmatched = Number(db.raw.prepare("SELECT value FROM meta WHERE key = 'mapping-unmatched'").get()?.value ?? 0);
    }
    // ---- releases -----------------------------------------------------------
    if (!done.has('releases') && !options.skipReleases) {
        try {
            const ttlMs = (options.releaseTtlHours ?? 24) * 3_600_000;
            const budget = Math.max(0, options.releaseBudget ?? 250);
            const candidates = repoRows
                .filter((repo) => !repo.archived)
                .map((repo) => ({ repo, cache: getReleaseCache(db, repo.id) }))
                .filter(({ cache }) => !cache || now.getTime() - Date.parse(cache.fetchedAt) > ttlMs)
                .slice(0, budget);
            const results = await mapLimit(candidates, 4, async ({ repo, cache }) => {
                const result = await fetchReleaseDownloads(http, repo.id, {
                    ...(options.token ? { token: options.token } : {}),
                    ...(cache?.etag ? { etag: cache.etag } : {}),
                });
                if (result.notModified) {
                    putReleaseCache(db, repo.id, cache?.downloads ?? null, cache?.etag ?? null, now.toISOString());
                }
                else {
                    putReleaseCache(db, repo.id, result.downloads, result.etag, now.toISOString());
                }
                return repo.id;
            });
            const failed = results.filter((result) => result.status === 'rejected');
            for (const result of failed.slice(0, 20))
                fail('releases', errorText(result.reason));
            if (failed.length > 20)
                log(`releases: ${failed.length - 20} further failures not recorded individually`);
            log(`releases: ${results.length - failed.length}/${candidates.length} refreshed`);
            markDone('releases');
        }
        catch (error) {
            fail('releases', error);
        }
    }
    // ---- snapshot + segments ------------------------------------------------
    try {
        const book = new SegmentBook({ filePath: paths.rulesPath });
        book.maybeReload();
        const overrideMap = loadOverrides(db);
        const mappingRows = allMappings(db);
        const npmByName = new Map(db.raw.prepare('SELECT name, weekly_downloads FROM npm_packages').all().map((row) => [
            row.name,
            row.weekly_downloads,
        ]));
        const repos = allRepos(db);
        const weeklyByRepo = new Map();
        for (const row of mappingRows) {
            const weekly = npmByName.get(row.npmName);
            if (weekly === undefined)
                continue;
            weeklyByRepo.set(row.repoId, (weeklyByRepo.get(row.repoId) ?? 0) + weekly);
        }
        let written = 0;
        for (const repo of repos) {
            const labels = applyOverride(book.classify({ id: repo.id, description: repo.description, topics: repo.topics }), overrideMap.get(repo.id) ?? null);
            const primary = labels[0] ?? { segment: 'other', confidence: 0, source: 'rules' };
            const cache = getReleaseCache(db, repo.id);
            writeSnapshot(db, {
                repoId: repo.id,
                date,
                stars: repo.stars,
                npmWeekly: weeklyByRepo.get(repo.id) ?? null,
                releaseDownloads: cache?.downloads ?? null,
                segment: primary.segment,
                segmentConfidence: primary.confidence,
            }, now.toISOString());
            writeSnapshotSegments(db, repo.id, date, labels);
            replaceSegments(db, repo.id, labels, now.toISOString());
            written++;
        }
        markDone('snapshot');
        log(`snapshot: ${written} repos at ${date}`);
    }
    catch (error) {
        fail('snapshot', error);
    }
    const status = errors.length ? 'partial' : 'ok';
    const durationMs = Date.now() - startedAt;
    finishScan(db, scanId, status, repoRows.length, durationMs, errors.length ? errors.slice(0, 20).join('; ') : null);
    const set = topRows(db, { date, limit: options.topN ?? 15 });
    const segments = overview(db, date);
    return {
        scanId,
        date,
        status,
        durationMs,
        resumed: pending !== null,
        repos: repoRows.length,
        npmPackages: npmCount,
        mappings: allMappings(db).length,
        unmatched,
        ambiguous,
        corpusComplete: db.raw.prepare("SELECT value FROM meta WHERE key = 'corpus-complete'").get()?.value === '1',
        via: corpus?.via ?? 'resume',
        coverage: coverage(db),
        errors,
        segments: segments.rows,
        top: set.rows,
        paths,
    };
}
function readIfPresent(path) {
    if (!existsSync(path))
        return null;
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return null;
    }
}
/** Human summary used by the command surface and the tool's text render. */
export function renderScanReport(report) {
    const lines = [];
    const scan = report;
    lines.push(`dsh 插件生态 ${scan.date}：${scan.repos} 仓库 · 映射 ${scan.coverage.mapped}（${scan.coverage.repos ? round((scan.coverage.mapped / scan.coverage.repos) * 100, 1) : 0}%）· 周下载 ${scan.coverage.withWeekly} · release ${scan.coverage.withReleases}`);
    lines.push(`状态 ${scan.status}${scan.corpusComplete ? '' : '（语料未穷尽）'} · ${scan.via} · ${(scan.durationMs / 1000).toFixed(1)}s${scan.resumed ? ' · 续扫' : ''}`);
    if (scan.segments.length) {
        lines.push('');
        lines.push('赛道（多标签计数）:');
        for (const row of scan.segments.slice(0, 10)) {
            lines.push(`  ${row.segment.padEnd(22)} ${String(row.repos).padStart(4)} 仓库 · ★${String(row.stars).padStart(6)} · 周下载 ${String(row.weeklyDownloads).padStart(7)}`);
        }
    }
    if (scan.top.length) {
        lines.push('');
        lines.push('综合评分 Top（velocity/adoption/quality/maintenance）:');
        for (const row of scan.top) {
            lines.push(`  ${row.repoId.padEnd(38)} ${String(row.score).padStart(6)}  v${String(row.velocity).padStart(5)} a${String(row.adoption).padStart(5)} q${String(row.quality).padStart(5)} m${String(row.maintenance).padStart(5)}  ${row.segment}${row.insufficient ? ' ·数据不足' : ''}${row.outlier ? ' ·异常' : ''}`);
        }
    }
    if (scan.errors.length) {
        lines.push('');
        lines.push(`降级 ${scan.errors.length} 处：`);
        for (const error of scan.errors.slice(0, 5))
            lines.push(`  - ${error.slice(0, 160)}`);
    }
    lines.push('');
    lines.push(`数据库 ${scan.paths.dbPath} · 未匹配 ${scan.unmatched} 个仓库（eco-core mapping --unmatched 查看）`);
    return lines.join('\n');
}
//# sourceMappingURL=scan.js.map