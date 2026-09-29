import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EcoRepo } from './segment.ts';
import type { RepoSeries, SnapshotPoint } from './growth.ts';

/** One observation per repo per scan date, JSONL per month in a plugin-owned
 * directory — the same durable sidecar pattern as the rest of the family.
 * Growth is the DIFF between today's snapshot and the previous one, so the
 * value of this store compounds daily. */

export interface SnapshotRecord {
  v: 1;
  date: string;
  fullName: string;
  segment: string;
  stars: number;
  npmWeekly?: number;
  releaseDownloads?: number;
}

export class SnapshotStore {
  readonly dataDir: string;

  constructor(dataDir: string | undefined) {
    this.dataDir = dataDir ? expandHome(dataDir) : join(homedir(), '.dsh', 'eco-scan');
  }

  fileFor(date: string): string {
    return join(this.dataDir, `snapshots-${date.slice(0, 7)}.jsonl`);
  }

  append(repo: EcoRepo, segment: string, date: string): SnapshotRecord {
    const record: SnapshotRecord = {
      v: 1,
      date,
      fullName: repo.fullName,
      segment,
      stars: repo.stars,
      ...(repo.npmWeekly !== undefined ? { npmWeekly: repo.npmWeekly } : {}),
      ...(repo.releaseDownloads !== undefined ? { releaseDownloads: repo.releaseDownloads } : {}),
    };
    mkdirSync(this.dataDir, { recursive: true });
    appendFileSync(this.fileFor(date), `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  readAll(): { records: SnapshotRecord[]; skipped: number } {
    const records: SnapshotRecord[] = [];
    let skipped = 0;
    if (!existsSync(this.dataDir)) return { records, skipped };
    for (const name of readdirSync(this.dataDir).filter(validName).sort()) {
      for (const line of readFileSync(join(this.dataDir, name), 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (value.v !== 1 || typeof value.date !== 'string' || typeof value.fullName !== 'string') throw new Error('bad shape');
          records.push(value as unknown as SnapshotRecord);
        } catch {
          skipped++;
        }
      }
    }
    return { records, skipped };
  }

  /** Merge every snapshot into per-repo series (dedupe: last observation per date). */
  series(): RepoSeries[] {
    const { records } = this.readAll();
    const byRepo = new Map<string, { segment: string; byDate: Map<string, SnapshotPoint> }>();
    for (const record of records) {
      let entry = byRepo.get(record.fullName);
      if (!entry) {
        entry = { segment: record.segment, byDate: new Map() };
        byRepo.set(record.fullName, entry);
      }
      entry.segment = record.segment;
      entry.byDate.set(record.date, {
        date: record.date,
        stars: record.stars,
        ...(record.npmWeekly !== undefined ? { npmWeekly: record.npmWeekly } : {}),
        ...(record.releaseDownloads !== undefined ? { releaseDownloads: record.releaseDownloads } : {}),
      });
    }
    return [...byRepo.entries()].map(([fullName, entry]) => ({
      fullName,
      segment: entry.segment,
      points: [...entry.byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    }));
  }
}

function validName(name: string): boolean {
  const match = /^snapshots-(\d{4})-(\d{2})\.jsonl$/.exec(name);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function expandHome(dir: string): string {
  return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;
}
