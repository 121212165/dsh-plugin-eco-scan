#!/usr/bin/env node
/** eco-core CLI. Runs the same library the plugin does, so a cron job or a CI
 * step does not need dsh at all. */
import { parseArgs } from 'node:util';
import { ecoPaths, ensureDefaultFiles } from './core/defaults.ts';
import { openDb } from './core/db.ts';
import { runScan, renderScanReport } from './core/scan.ts';
import { diffRows, queryReadOnly, topRows, unmatchedRepos } from './core/queries.ts';
import { buildExport, buildPanel, type ExportFormat } from './core/exporters.ts';
import { calibrate, renderCalibration } from './core/calibrate.ts';
import { evaluateAlerts, loadAlertRules, deliverWebhook } from './core/alerts.ts';
import { migrateV1 } from './core/migrate.ts';
import { health } from './core/storage.ts';
import { readToken } from './core/http.ts';
import { expandHome } from './core/util.ts';

const FORMATS: ExportFormat[] = ['json', 'jsonl', 'csv', 'md', 'html'];

function usage(): string {
  return `eco-core — dsh 插件生态情报库

  eco-core scan [--resume] [--skip-releases] [--max-repos N] [--release-budget N]
  eco-core diff [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  eco-core top [--segment S] [--limit N] [--date YYYY-MM-DD]
  eco-core export --format ${FORMATS.join('|')} [--date D] [--limit N] [--out]
  eco-core panel [--date D] [--limit N]        # 写入 <dataDir>/exports/panel.html
  eco-core calibrate [--from D] [--to D] [--k N]
  eco-core alerts [--dry-run] [--webhook URL]
  eco-core health
  eco-core mapping --unmatched
  eco-core migrate [--from <v1-dir>] [--force]
  eco-core sql "<SELECT ...>" [--limit N]

  全局：--data-dir <dir>   --json`;
}

type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

function str(values: Values, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
}

function num(values: Values, key: string): number | undefined {
  const value = values[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flag(values: Values, key: string): boolean {
  return values[key] === true;
}

function emit(value: unknown, json: boolean): void {
  if (json && typeof value !== 'string') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      'data-dir': { type: 'string' },
      resume: { type: 'boolean', default: false },
      'skip-releases': { type: 'boolean', default: false },
      'max-repos': { type: 'string' },
      'release-budget': { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      date: { type: 'string' },
      segment: { type: 'string' },
      limit: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      webhook: { type: 'string' },
      unmatched: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const dataDir = str(values, 'data-dir') ?? process.env.ECO_SCAN_DATA_DIR;
  const json = flag(values, 'json');
  const paths = ecoPaths(dataDir);
  ensureDefaultFiles(paths);
  const token = readToken(['GITHUB_TOKEN', 'GH_TOKEN']);
  const maxRepos = num(values, 'max-repos');
  const releaseBudget = num(values, 'release-budget');
  const limit = num(values, 'limit');
  const date = str(values, 'date');
  const from = str(values, 'from');
  const to = str(values, 'to');
  const segment = str(values, 'segment');

  switch (command) {
    case 'scan': {
      const db = openDb(paths.dbPath);
      try {
        const report = await runScan(db, {
          ...(dataDir ? { dataDir } : {}),
          ...(token ? { token } : {}),
          resume: flag(values, 'resume'),
          skipReleases: flag(values, 'skip-releases'),
          ...(maxRepos !== undefined ? { maxRepos } : {}),
          ...(releaseBudget !== undefined ? { releaseBudget } : {}),
          log: json ? () => {} : (message) => process.stderr.write(`[scan] ${message}\n`),
        });
        emit(json ? report : renderScanReport(report), json);
        return report.status === 'failed' ? 1 : 0;
      } finally {
        db.close();
      }
    }
    case 'diff': {
      const db = openDb(paths.dbPath);
      try {
        const result = diffRows(db, to, from);
        if (json) {
          emit(result, true);
          return 0;
        }
        const lines = [`${result.from ?? '(none)'} → ${result.to ?? '(none)'}`];
        for (const row of result.rows.slice(0, 30)) {
          lines.push(
            `  ${row.repoId.padEnd(40)} npmΔ ${String(row.npmDelta ?? '—').padStart(8)} ★Δ ${String(row.starsDelta).padStart(6)} releaseΔ ${String(row.releaseDelta ?? '—').padStart(8)}`,
          );
        }
        emit(lines.join('\n'), false);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'top': {
      const db = openDb(paths.dbPath);
      try {
        const result = topRows(db, {
          ...(segment ? { segment } : {}),
          limit: limit ?? 10,
          ...(date ? { date } : {}),
        });
        if (json) {
          emit(result, true);
          return 0;
        }
        const lines = [`${result.date ?? '(no snapshot)'}${segment ? ` · ${segment}` : ''}`];
        for (const row of result.rows) {
          lines.push(
            `  ${String(row.rank).padStart(3)} ${row.repoId.padEnd(40)} ${String(row.score).padStart(6)}  ${row.segment}${row.insufficient ? ' · 数据不足' : ''}`,
          );
        }
        emit(lines.join('\n'), false);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'export': {
      const format = (str(values, 'format') ?? 'md') as ExportFormat;
      if (!FORMATS.includes(format)) throw new Error(`unknown format: ${format}`);
      const db = openDb(paths.dbPath);
      try {
        const result = buildExport({
          db,
          format,
          ...(date ? { date } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(flag(values, 'out') ? { dataDir: paths.dataDir } : {}),
        });
        if (result.path) {
          emit(`written ${result.path}`, false);
        } else {
          process.stdout.write(result.content);
        }
        return 0;
      } finally {
        db.close();
      }
    }
    case 'panel': {
      const db = openDb(paths.dbPath);
      try {
        const result = buildPanel(db, {
          dataDir: paths.dataDir,
          ...(limit !== undefined ? { limit } : {}),
          ...(date ? { date } : {}),
        });
        emit(json ? { path: result.path, date: result.date } : `written ${result.path}`, json);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'calibrate': {
      const db = openDb(paths.dbPath);
      try {
        const report = calibrate(db, {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(limit !== undefined ? { k: limit } : {}),
        });
        emit(json ? report : renderCalibration(report), json);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'alerts': {
      const db = openDb(paths.dbPath);
      try {
        const run = evaluateAlerts(db, loadAlertRules(paths.alertsPath), { dryRun: flag(values, 'dry-run') });
        const webhook = str(values, 'webhook');
        const delivery = webhook ? await deliverWebhook(webhook, run) : null;
        emit(json ? { ...run, delivery } : run.fired.map((event) => event.message).join('\n') || '没有触发告警。', json);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'health': {
      const db = openDb(paths.dbPath);
      try {
        const report = health(db, paths.dbPath);
        if (json) {
          emit(report, true);
          return 0;
        }
        const lines = [
          `db ${report.dbPath} · schema v${report.schemaVersion}`,
          `repos ${report.repos} · snapshots ${report.snapshots} · npm ${report.npmPackages} · mappings ${report.mappings}`,
          `last scan ${report.lastScan ? `${report.lastScan.scanDate} ${report.lastScan.status} (${report.lastScan.repoCount} repos, ${Math.round(report.lastScan.durationMs / 1000)}s)` : 'none'}`,
          `dates ${report.dates.join(', ') || '(none)'}`,
        ];
        for (const error of report.recentErrors) lines.push(`  ! ${error.scanDate} ${error.message.slice(0, 120)}`);
        emit(lines.join('\n'), false);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'mapping': {
      const db = openDb(paths.dbPath);
      try {
        if (!flag(values, 'unmatched')) {
          emit('用法：eco-core mapping --unmatched', false);
          return 0;
        }
        const rows = unmatchedRepos(db);
        if (json) {
          emit(rows.map((repo) => ({ id: repo.id, stars: repo.stars, description: repo.description })), true);
          return 0;
        }
        const lines = [`${rows.length} 个仓库没有 npm 映射`];
        for (const repo of rows.slice(0, 50)) {
          lines.push(`  ${repo.id.padEnd(45)} ★${String(repo.stars).padStart(5)}  ${repo.description.slice(0, 60)}`);
        }
        emit(lines.join('\n'), false);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'migrate': {
      const db = openDb(paths.dbPath);
      try {
        const result = migrateV1(db, expandHome(from ?? paths.dataDir), { force: flag(values, 'force') });
        emit(result, json);
        return 0;
      } finally {
        db.close();
      }
    }
    case 'sql': {
      const sql = positionals[0];
      if (!sql) throw new Error('usage: eco-core sql "<SELECT ...>"');
      const db = openDb(paths.dbPath);
      try {
        const result = queryReadOnly(db, sql, limit ?? 200);
        if (json) {
          emit(result, true);
          return 0;
        }
        emit(`${result.columns.join('\t')}\n${result.rows.map((row) => result.columns.map((column) => String(row[column] ?? '')).join('\t')).join('\n')}${result.truncated ? '\n(truncated)' : ''}`, false);
        return 0;
      } finally {
        db.close();
      }
    }
    default:
      throw new Error(`unknown command: ${command}\n\n${usage()}`);
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
