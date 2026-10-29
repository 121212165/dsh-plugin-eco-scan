/** Report exporters. One dataset, five surfaces: JSON for agents, JSONL for
 * the v1-compatible audit trail, CSV for spreadsheets, Markdown for notes, and
 * a self-contained HTML page (inline CSS, no assets) for sharing. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EcoDb } from './db.ts';
import { coverage, diffRows, overview, scoredSet, snapshotExportRows, topRows, type SnapshotExportRow } from './queries.ts';
import { ecoPaths } from './defaults.ts';
import { repoSeries, segmentHeatmap, type RepoPoint, type SegmentHeatmap } from './history.ts';
import { pct, renderPanel } from './panel.ts';
import type { DiffRow, OverviewRow, TopRow } from './types.ts';

export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'md' | 'html';

export interface ExportInput {
  db: EcoDb;
  format: ExportFormat;
  date?: string;
  limit?: number;
  dataDir?: string;
  generatedAt?: string;
  /** overwrite `<exports>/panel.html` instead of a timestamped file, so a
   * bookmark or a cron-driven link keeps resolving to the newest report */
  stable?: boolean;
}

export interface ExportResult {
  format: ExportFormat;
  date: string | null;
  content: string;
  path: string | null;
}

export function buildExport(input: ExportInput): ExportResult {
  const { db, format } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const set = scoredSet(db, input.date);
  const date = set.date;
  const limit = Math.max(1, input.limit ?? 20);
  const top = topRows(db, { ...(date ? { date } : {}), limit });
  const segments = overview(db, input.date ?? undefined);
  const diff = diffRows(db, input.date ?? undefined);
  const stats = coverage(db);
  const snapshots = date ? snapshotExportRows(db, date) : [];
  const heatmap = segmentHeatmap(db);
  const series = repoSeries(db, top.rows.map((row) => row.repoId), heatmap.dates);
  const content = render(format, { date, generatedAt, scores: top.rows, segments: segments.rows, diff: diff.rows, stats, snapshots, series, heatmap });
  const path = writeIfRequested(input, format, date, content, generatedAt);
  return { format, date, content, path };
}

/** The panel is the HTML export written to a stable path. Same builder, so the
 * numbers cannot drift between the timestamped report and the live page. */
export function buildPanel(db: EcoDb, options: { dataDir?: string; date?: string; limit?: number; generatedAt?: string } = {}): ExportResult {
  return buildExport({
    db,
    format: 'html',
    stable: true,
    ...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
    ...(options.date !== undefined ? { date: options.date } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.generatedAt !== undefined ? { generatedAt: options.generatedAt } : {}),
  });
}

function writeIfRequested(
  input: ExportInput,
  format: ExportFormat,
  date: string | null,
  content: string,
  generatedAt: string,
): string | null {
  if (input.dataDir === undefined) return null;
  const dir = ecoPaths(input.dataDir).exportDir;
  mkdirSync(dir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, '-').slice(0, 19);
  const path = join(dir, input.stable ? 'panel.html' : `eco-${date ?? 'empty'}-${stamp}.${format}`);
  writeFileSync(path, content, 'utf8');
  return path;
}

interface RenderInput {
  date: string | null;
  generatedAt: string;
  scores: TopRow[];
  segments: OverviewRow[];
  diff: DiffRow[];
  stats: { repos: number; mapped: number; withWeekly: number; withReleases: number };
  snapshots: SnapshotExportRow[];
  series: Map<string, RepoPoint[]>;
  heatmap: SegmentHeatmap;
}

function render(format: ExportFormat, data: RenderInput): string {
  switch (format) {
    case 'json':
      return JSON.stringify(toJson(data), null, 2);
    case 'jsonl':
      return data.snapshots.map((row) => JSON.stringify(toJsonl(row, data.date))).join('\n');
    case 'csv':
      return toCsv(data.scores, data.date);
    case 'md':
      return toMarkdown(data);
    case 'html':
      return renderPanel(data);
  }
}

interface JsonReport {
  v: 2;
  generatedAt: string;
  date: string | null;
  coverage: RenderInput['stats'] & { mappedPct: number; weeklyPct: number };
  segments: OverviewRow[];
  top: TopRow[];
  diff: DiffRow[];
}

function toJson(data: RenderInput): JsonReport {
  return {
    v: 2,
    generatedAt: data.generatedAt,
    date: data.date,
    coverage: {
      ...data.stats,
      mappedPct: data.stats.repos ? Math.round((data.stats.mapped / data.stats.repos) * 1000) / 10 : 0,
      weeklyPct: data.stats.repos ? Math.round((data.stats.withWeekly / data.stats.repos) * 1000) / 10 : 0,
    },
    segments: data.segments,
    top: data.scores,
    diff: data.diff.slice(0, 50),
  };
}

function toJsonl(row: SnapshotExportRow, date: string | null): Record<string, unknown> {
  return {
    v: 2,
    date,
    fullName: row.repoId,
    segment: row.segment,
    stars: row.stars,
    npmWeekly: row.npmWeekly,
    releaseDownloads: row.releaseDownloads,
    segmentConfidence: row.segmentConfidence,
    npmRangeWeek: row.npmRangeWeek,
    npmRangePrev: row.npmRangePrev,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: readonly TopRow[], date: string | null): string {
  const header = [
    'date',
    'repo',
    'segment',
    'score',
    'velocity',
    'adoption',
    'quality',
    'maintenance',
    'stars',
    'npm_weekly',
    'release_downloads',
    'cohort',
    'rank',
    'insufficient',
    'outlier',
    'description',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        date,
        row.repoId,
        row.segment,
        row.score,
        row.velocity,
        row.adoption,
        row.quality,
        row.maintenance,
        row.stars,
        row.npmWeekly,
        row.releaseDownloads,
        row.cohort,
        row.rank,
        row.insufficient,
        row.outlier,
        row.description,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function toMarkdown(data: RenderInput): string {
  const lines: string[] = [];
  lines.push(`# dsh 插件生态报告 ${data.date ?? '(no snapshot)'}`);
  lines.push('');
  lines.push(`生成时间：${data.generatedAt}`);
  lines.push('');
  lines.push(
    `覆盖：${data.stats.repos} 仓库 · 已映射 npm ${data.stats.mapped}（${pct(data.stats.mapped, data.stats.repos)}）· 有周下载 ${data.stats.withWeekly} · 有 release 数据 ${data.stats.withReleases}`,
  );
  lines.push('');
  lines.push('## 赛道');
  lines.push('');
  lines.push('| 赛道 | 仓库 | ★ | 周下载 | 中位 ★ |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const row of data.segments) {
    lines.push(`| ${mdCell(row.segment)} | ${row.repos} | ${row.stars} | ${row.weeklyDownloads} | ${row.medianStars} |`);
  }
  lines.push('');
  lines.push('## Top');
  lines.push('');
  lines.push('| # | 仓库 | 赛道 | 分 | 速度 | 规模 | 质量 | 维护 | 周下载 |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---:|');
  for (const row of data.scores) {
    lines.push(
      `| ${row.rank} | ${mdCell(row.repoId)} | ${mdCell(row.segment)} | ${row.score} | ${row.velocity} | ${row.adoption} | ${row.quality} | ${row.maintenance} | ${row.npmWeekly ?? '—'} |`,
    );
  }
  if (data.diff.some((row) => row.npmDelta !== null)) {
    lines.push('');
    lines.push('## 变化');
    lines.push('');
    lines.push('| 仓库 | 周下载 Δ | ★ Δ |');
    lines.push('|---|---:|---:|');
    for (const row of data.diff.filter((entry) => entry.npmDelta !== null).slice(0, 20)) {
      lines.push(`| ${mdCell(row.repoId)} | ${row.npmDelta ?? '—'} | ${row.starsDelta} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}
