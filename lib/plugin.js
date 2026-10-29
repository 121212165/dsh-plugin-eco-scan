import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { buildExport, buildPanel, calibrate, deliverWebhook, describeSchedule, diffRows, ecoPaths, ensureDefaultFiles, evaluateAlerts, health, latestSnapshotDate, loadAlertRules, migrateV1, openDb, overview, parseSchedule, queryReadOnly, readToken, renderCalibration, renderScanReport, runScan, Scheduler, scoredSet, topRows, unmatchedRepos, } from './core/index.js';
import { SnapshotStore } from './eco/snapshot.js';
import { runScanV1 } from './v1.js';
export const name = 'eco-scan';
export const inject = ['commands', 'tools'];
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    dataDir: Schema.string(),
    tokenEnv: Schema.array(Schema.string()).default(['GITHUB_TOKEN', 'GH_TOKEN']),
    topGrowth: Schema.natural().default(15),
    ecoVersion: Schema.string().default('v2'),
    autoMigrate: Schema.boolean().default(true),
    resume: Schema.boolean().default(false),
    releaseBudget: Schema.natural().default(250),
    detailsTtlHours: Schema.natural().default(6),
    releaseTtlHours: Schema.natural().default(24),
    alertsWebhook: Schema.string(),
    schedule: Schema.string().default('off'),
    scheduleAlerts: Schema.boolean().default(true),
    scheduleOnStart: Schema.boolean().default(true),
});
const EXPORT_FORMATS = ['json', 'jsonl', 'csv', 'md', 'html'];
function parseInput(raw) {
    const positionals = [];
    const flags = new Map();
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token.startsWith('--')) {
            positionals.push(token);
            continue;
        }
        const [key, inline] = token.slice(2).split('=', 2);
        if (inline !== undefined) {
            flags.set(key, inline);
            continue;
        }
        const next = tokens[index + 1];
        if (next && !next.startsWith('--')) {
            flags.set(key, next);
            index++;
        }
        else {
            flags.set(key, true);
        }
    }
    return { positionals, flags };
}
function flagValue(parsed, key) {
    const value = parsed.flags.get(key);
    return typeof value === 'string' ? value : undefined;
}
function isOn(parsed, ...keys) {
    return keys.some((key) => parsed.flags.get(key) === true);
}
export function apply(ctx, configInput) {
    const config = normalizeConfig(configInput);
    const log = ctx.logger('eco-scan');
    if (!config.enabled)
        return void log.info('disabled by config');
    if (config.ecoVersion === 'v1') {
        mountV1(ctx, config, log);
        return;
    }
    const paths = ecoPaths(config.dataDir);
    let db = null;
    const getDb = () => {
        if (db)
            return { db, paths };
        ensureDefaultFiles(paths);
        db = openDb(paths.dbPath);
        if (config.autoMigrate) {
            try {
                const result = migrateV1(db, paths.dataDir);
                if (!result.alreadyMigrated && result.records)
                    log.info(`migrated v1: ${result.records} records from ${result.files} files`);
            }
            catch (error) {
                log.warn(`v1 migration failed: ${String(error)}`);
            }
        }
        return { db, paths };
    };
    ctx.effect(() => () => {
        db?.close();
        db = null;
    });
    const scan = async (parsed, overrides = {}) => {
        const opened = getDb();
        return runScan(opened.db, {
            ...(config.dataDir ? { dataDir: config.dataDir } : {}),
            ...(readToken(config.tokenEnv) ? { token: readToken(config.tokenEnv) } : {}),
            resume: overrides.resume ?? (config.resume || isOn(parsed, 'resume')),
            skipReleases: overrides.skipReleases ?? isOn(parsed, 'skip-releases', 'no-releases'),
            releaseBudget: config.releaseBudget,
            detailsTtlHours: config.detailsTtlHours,
            releaseTtlHours: config.releaseTtlHours,
            topN: config.topGrowth,
            log: (message) => log.info(message),
        });
    };
    const renderSlice = (opened, report, segment) => {
        const top = topRows(opened.db, { segment, limit: config.topGrowth });
        const segments = overview(opened.db, report.date).rows.filter((row) => row.segment === segment);
        const lines = [`${report.date} · 赛道 ${segment}：${segments[0]?.repos ?? 0} 仓库 · 周下载 ${segments[0]?.weeklyDownloads ?? 0}`];
        for (const row of top.rows)
            lines.push(`  ${row.repoId.padEnd(40)} ${String(row.score).padStart(6)}  ${row.segment}`);
        return lines.join('\n');
    };
    let scanBusy = false;
    const scheduledRun = async (reason) => {
        if (scanBusy) {
            log.warn(`定时扫描仍在进行，跳过本次（${reason}）`);
            return;
        }
        scanBusy = true;
        const startedAt = Date.now();
        try {
            const opened = getDb();
            const report = await scan(parseInput(''));
            log.info(`定时扫描（${reason}）：${report.status} · ${report.repos} 仓库 · ${(report.durationMs / 1000).toFixed(1)}s`);
            if (config.scheduleAlerts) {
                const run = evaluateAlerts(opened.db, loadAlertRules(opened.paths.alertsPath));
                for (const event of run.fired)
                    log.info(`告警 ${event.message}`);
                if (config.alertsWebhook && run.fired.length) {
                    const delivery = await deliverWebhook(config.alertsWebhook, run);
                    if (!delivery.ok)
                        log.warn(`webhook 失败：${delivery.error ?? delivery.status}`);
                }
            }
            const panel = buildPanel(opened.db, { dataDir: opened.paths.dataDir, limit: config.topGrowth });
            if (panel.path)
                log.info(`面板已更新 ${panel.path}`);
        }
        catch (error) {
            log.warn(`定时扫描异常：${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            scanBusy = false;
            log.info(`定时扫描耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        }
    };
    try {
        const spec = parseSchedule(config.schedule);
        if (spec.kind !== 'off') {
            const scheduler = new Scheduler({
                spec,
                task: () => scheduledRun('排程'),
                onError: (error) => log.warn(`排程任务失败：${error instanceof Error ? error.message : String(error)}`),
            });
            const first = scheduler.start();
            ctx.effect(() => () => scheduler.stop());
            log.info(`排程 ${describeSchedule(spec)} · 下次 ${first?.toISOString() ?? '—'}`);
            // dsh restarts often; a daily schedule that only fires at 03:30 would
            // otherwise never run on a machine that is rebooted every morning.
            if (config.scheduleOnStart) {
                const today = new Date().toISOString().slice(0, 10);
                const last = latestSnapshotDate(getDb().db);
                if (!last || last < today)
                    void scheduledRun('启动补扫');
            }
        }
    }
    catch (error) {
        log.warn(`排程配置无效，已关闭：${error instanceof Error ? error.message : String(error)}`);
    }
    ctx.commands.register({
        name: 'eco-scan',
        description: '扫描 dsh 插件生态（GitHub 语料 + npm 下载 + release 资产），写入 SQLite 情报库并输出赛道与评分 Top。可选 --resume / --skip-releases / --segment <id>',
        input: { hint: '[--resume] [--skip-releases] [--segment cost-budget]' },
        handler: async ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            try {
                const report = await scan(parsed);
                const segment = flagValue(parsed, 'segment');
                const text = segment ? renderSlice(getDb(), report, segment) : renderScanReport(report);
                return { kind: 'success', text };
            }
            catch (error) {
                return { kind: 'error', text: `生态扫描失败：${error instanceof Error ? error.message : String(error)}` };
            }
        },
    });
    ctx.commands.register({
        name: 'eco-diff',
        description: '对比两次扫描：/eco-diff [toDate] [fromDate]，省略参数则对比最近两次',
        input: { hint: '[toDate] [fromDate]' },
        handler: ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const opened = getDb();
            const result = diffRows(opened.db, parsed.positionals[0] ?? flagValue(parsed, 'to'), parsed.positionals[1] ?? flagValue(parsed, 'from'));
            if (!result.to)
                return { kind: 'error', text: '还没有任何快照，先跑一次 /eco-scan。' };
            const lines = [`${result.from ?? '(无前一次)'} → ${result.to}`];
            const changed = result.rows.filter((row) => row.npmDelta !== null && row.npmDelta !== 0);
            for (const row of changed.slice(0, 20))
                lines.push(`  ${row.repoId.padEnd(40)} npm ${row.npmDelta > 0 ? '+' : ''}${row.npmDelta}  ★ ${row.starsDelta >= 0 ? '+' : ''}${row.starsDelta}`);
            if (!changed.length)
                lines.push('  两次扫描之间没有 npm 下载变化。');
            return { kind: 'success', text: lines.join('\n') };
        },
    });
    ctx.commands.register({
        name: 'eco-top',
        description: '赛道 Top N：/eco-top [segment] [n]',
        input: { hint: '[segment] [n]' },
        handler: ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const segment = parsed.positionals[0] ?? flagValue(parsed, 'segment') ?? null;
            const limit = Number(parsed.positionals[1] ?? flagValue(parsed, 'limit') ?? config.topGrowth);
            const opened = getDb();
            const result = topRows(opened.db, { segment, limit: Number.isFinite(limit) ? limit : config.topGrowth });
            if (!result.date)
                return { kind: 'error', text: '还没有快照，先跑一次 /eco-scan。' };
            const lines = [`${result.date}${segment ? ` · ${segment}` : ''}`];
            for (const row of result.rows) {
                lines.push(`  ${String(row.rank).padStart(3)} ${row.repoId.padEnd(40)} ${String(row.score).padStart(6)}  v${row.velocity} a${row.adoption} q${row.quality} m${row.maintenance}${row.insufficient ? ' ·数据不足' : ''}`);
            }
            if (!result.rows.length)
                lines.push('  该赛道暂无足够数据。');
            return { kind: 'success', text: lines.join('\n') };
        },
    });
    ctx.commands.register({
        name: 'eco-export',
        description: '导出报告：/eco-export --format json|jsonl|csv|md|html [--date YYYY-MM-DD] [--out]',
        input: { hint: '--format md [--out]' },
        handler: ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const format = (flagValue(parsed, 'format') ?? 'md');
            if (!EXPORT_FORMATS.includes(format)) {
                return { kind: 'error', text: `未知格式 ${format}，可选 ${EXPORT_FORMATS.join('/')}` };
            }
            const opened = getDb();
            const date = flagValue(parsed, 'date');
            try {
                const result = buildExport({
                    db: opened.db,
                    format,
                    ...(date ? { date } : {}),
                    limit: Number(flagValue(parsed, 'limit') ?? config.topGrowth),
                    ...(isOn(parsed, 'out', 'save') ? { dataDir: opened.paths.dataDir } : {}),
                });
                const head = result.path ? `已写入 ${result.path}` : result.content.split('\n').slice(0, 3).join('\n');
                return { kind: 'success', text: head };
            }
            catch (error) {
                return { kind: 'error', text: `导出失败：${error instanceof Error ? error.message : String(error)}` };
            }
        },
    });
    ctx.commands.register({
        name: 'eco-panel',
        description: '生成本地 HTML 面板（趋势 sparkline + 赛道×日期热力图），写到 <dataDir>/exports/panel.html：/eco-panel [--date YYYY-MM-DD]',
        input: { hint: '[--date YYYY-MM-DD]' },
        handler: ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const opened = getDb();
            try {
                const date = flagValue(parsed, 'date');
                const result = buildPanel(opened.db, {
                    dataDir: opened.paths.dataDir,
                    limit: config.topGrowth,
                    ...(date ? { date } : {}),
                });
                return {
                    kind: 'success',
                    text: `面板已写入 ${result.path ?? '(未写入)'}\n快照 ${result.date ?? '(无)'} · 单文件、无外部资源，用浏览器直接打开。`,
                };
            }
            catch (error) {
                return { kind: 'error', text: `生成面板失败：${error instanceof Error ? error.message : String(error)}` };
            }
        },
    });
    ctx.commands.register({
        name: 'eco-calibrate',
        description: '样本外校准：T0 的评分能否预测 T0→T1 的实际下载变化（秩相关 + Top-K 命中 + 基线对比），需要至少两期快照',
        input: { hint: '[--from YYYY-MM-DD] [--to YYYY-MM-DD] [--k N]' },
        handler: ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const opened = getDb();
            const from = flagValue(parsed, 'from');
            const to = flagValue(parsed, 'to');
            const k = Number(flagValue(parsed, 'k'));
            const report = calibrate(opened.db, {
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(Number.isFinite(k) && k > 0 ? { k } : {}),
            });
            return { kind: 'success', text: renderCalibration(report) };
        },
    });
    ctx.commands.register({
        name: 'eco-alerts',
        description: '评估告警规则（npm 激增 / 新仓库 / 映射缺口）：/eco-alerts [--dry-run] [--webhook URL]',
        input: { hint: '[--dry-run] [--webhook URL]' },
        handler: async ({ rawInput }) => {
            const parsed = parseInput(String(rawInput ?? ''));
            const opened = getDb();
            const run = evaluateAlerts(opened.db, loadAlertRules(opened.paths.alertsPath), { dryRun: isOn(parsed, 'dry-run') });
            const webhook = flagValue(parsed, 'webhook') ?? config.alertsWebhook;
            const delivery = webhook ? await deliverWebhook(webhook, run) : null;
            const lines = run.fired.length ? run.fired.map((event) => `  ${event.message}`) : ['  没有触发告警。'];
            if (run.suppressed)
                lines.push(`  （${run.suppressed} 条同日重复告警已抑制）`);
            if (delivery)
                lines.push(`  webhook: ${delivery.ok ? 'ok' : `失败 ${delivery.error ?? delivery.status}`}`);
            return { kind: 'success', text: lines.join('\n') };
        },
    });
    ctx.commands.register({
        name: 'eco-health',
        description: '数据库状态：schema 版本、仓库/快照/映射数量、最近一次扫描与近期错误',
        handler: () => {
            const opened = getDb();
            const report = health(opened.db, opened.paths.dbPath);
            const lines = [
                `db ${report.dbPath} · schema v${report.schemaVersion}`,
                `repos ${report.repos} · snapshots ${report.snapshots} · npm ${report.npmPackages} · mappings ${report.mappings}`,
                `last scan ${report.lastScan ? `${report.lastScan.scanDate} ${report.lastScan.status} · ${report.lastScan.repoCount} repos · ${Math.round(report.lastScan.durationMs / 1000)}s` : 'none'}`,
                `dates ${report.dates.join(', ') || '(none)'}`,
            ];
            for (const error of report.recentErrors.slice(0, 5))
                lines.push(`  ! ${error.scanDate} ${error.stage}: ${error.message.slice(0, 120)}`);
            const unmapped = unmatchedRepos(opened.db).length;
            lines.push(`未映射仓库 ${unmapped}`);
            return { kind: 'success', text: lines.join('\n') };
        },
    });
    ctx.tools.register(defineTool({
        name: 'eco_scan',
        description: '扫描 dsh 插件生态市场并写入情报库：返回 JSON（覆盖度、赛道、综合评分 Top、错误）。做市场调研、找赛道机会、判断哪个插件在涨时用。首次会导入 v1 JSONL 历史。',
        parameters: {
            segment: { type: 'string', description: '可选，只输出某个赛道' },
            resume: { type: 'boolean', description: '可选，从上次中断的检查点续扫' },
            skipReleases: { type: 'boolean', description: '可选，跳过 release 资产统计（更快）' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: String(value).slice(0, 4000) }],
        },
        presentCall: (args) => ({
            card: 'generic',
            title: args.segment ? `生态扫描：${args.segment}` : '生态扫描',
            kind: 'fetch',
        }),
        presentResult: (args, value) => ({
            card: 'generic',
            title: `生态扫描完成${args.segment ? `：${args.segment}` : ''}`,
            kind: 'fetch',
            rawInput: String(value),
        }),
        async execute(args) {
            const report = await scan(parseInput(''), { ...(args.resume !== undefined ? { resume: args.resume } : {}), ...(args.skipReleases !== undefined ? { skipReleases: args.skipReleases } : {}) });
            const opened = getDb();
            const payload = {
                v: 2,
                date: report.date,
                status: report.status,
                repos: report.repos,
                coverage: report.coverage,
                corpusComplete: report.corpusComplete,
                unmatched: report.unmatched,
                ambiguous: report.ambiguous,
                errors: report.errors,
                report: renderScanReport(report),
                segments: report.segments,
                top: args.segment ? topRows(opened.db, { segment: args.segment, limit: config.topGrowth }).rows : report.top,
                previousDate: scoredSet(opened.db, report.date).previousDate,
                paths: { db: report.paths.dbPath, exports: report.paths.exportDir },
            };
            return JSON.stringify(payload, null, 2);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'eco_diff',
        description: '对比 dsh 插件生态的两次快照：给定 to/from 日期（省略则最近两次），返回每个仓库的 npm 周下载、stars、release 下载变化。',
        parameters: {
            to: { type: 'string', description: '可选，目标日期 YYYY-MM-DD（默认最近一次）' },
            from: { type: 'string', description: '可选，基准日期 YYYY-MM-DD（默认上一次）' },
            limit: { type: 'number', description: '可选，最多返回多少行（默认 50）' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: String(value).slice(0, 4000) }],
        },
        presentCall: () => ({ card: 'generic', title: '生态差异', kind: 'fetch' }),
        presentResult: () => ({ card: 'generic', title: '生态差异', kind: 'fetch' }),
        async execute(args) {
            const opened = getDb();
            const result = diffRows(opened.db, args.to, args.from);
            const rows = result.rows.slice(0, Math.max(1, Math.min(500, args.limit ?? 50)));
            return JSON.stringify({ v: 2, from: result.from, to: result.to, rows }, null, 2);
        },
    }));
    ctx.tools.register(defineTool({
        name: 'eco_query',
        description: '只读 SQL 查询生态情报库（表：repos/snapshots/npm_packages/repo_npm_map/repo_segments/segment_overrides/scans/scan_errors/alert_events/meta）。只能 SELECT，自动 LIMIT。回答“哪个赛道增长最快”“某插件历史下载”这类问题时用。',
        parameters: {
            sql: { type: 'string', required: true, description: 'SELECT 查询，如 SELECT segment, COUNT(*) n FROM repo_segments GROUP BY segment' },
            limit: { type: 'number', description: '可选，返回行数上限（默认 100，最大 1000）' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: String(value).slice(0, 4000) }],
        },
        presentCall: (args) => ({ card: 'generic', title: `eco_query: ${String(args.sql).slice(0, 40)}`, kind: 'search' }),
        presentResult: () => ({ card: 'generic', title: '查询结果', kind: 'search' }),
        async execute(args) {
            const opened = getDb();
            try {
                return JSON.stringify(queryReadOnly(opened.db, args.sql, args.limit ?? 100), null, 2);
            }
            catch (error) {
                return JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2);
            }
        },
    }));
    log.info(`mounted · v2 · db=${paths.dbPath}`);
}
function mountV1(ctx, config, log) {
    const store = new SnapshotStore(config.dataDir);
    const scan = async () => runScanV1(store, readToken(config.tokenEnv), config.topGrowth);
    ctx.commands.register({ name: 'eco-scan', description: 'v1 扫描器（legacy）', handler: async () => ({ kind: 'success', text: await scan() }) });
    ctx.tools.register(defineTool({
        name: 'eco_scan',
        description: 'v1 生态扫描（legacy）',
        parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        presentCall: () => ({ card: 'generic', title: '生态扫描', kind: 'fetch' }),
        presentResult: (_args, value) => ({ card: 'generic', title: String(value).split('\n')[0].slice(0, 60), kind: 'fetch', rawInput: value }),
        async execute() {
            return scan();
        },
    }));
    log.info(`mounted · v1 (legacy) · dataDir=${store.dataDir}`);
}
function normalizeConfig(config) {
    return {
        ...config,
        ecoVersion: config.ecoVersion === 'v1' ? 'v1' : 'v2',
        autoMigrate: config.autoMigrate !== false,
        resume: config.resume === true,
        releaseBudget: Number.isFinite(config.releaseBudget) ? config.releaseBudget : 250,
        detailsTtlHours: Number.isFinite(config.detailsTtlHours) ? config.detailsTtlHours : 6,
        releaseTtlHours: Number.isFinite(config.releaseTtlHours) ? config.releaseTtlHours : 24,
        topGrowth: Number.isFinite(config.topGrowth) ? config.topGrowth : 15,
        schedule: typeof config.schedule === 'string' && config.schedule.trim() ? config.schedule.trim() : 'off',
        scheduleAlerts: config.scheduleAlerts !== false,
        scheduleOnStart: config.scheduleOnStart !== false,
    };
}
//# sourceMappingURL=plugin.js.map