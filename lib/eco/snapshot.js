import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export class SnapshotStore {
    dataDir;
    constructor(dataDir) {
        this.dataDir = dataDir ? expandHome(dataDir) : join(homedir(), '.dsh', 'eco-scan');
    }
    fileFor(date) {
        return join(this.dataDir, `snapshots-${date.slice(0, 7)}.jsonl`);
    }
    append(repo, segment, date) {
        const record = {
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
    readAll() {
        const records = [];
        let skipped = 0;
        if (!existsSync(this.dataDir))
            return { records, skipped };
        for (const name of readdirSync(this.dataDir).filter(validName).sort()) {
            for (const line of readFileSync(join(this.dataDir, name), 'utf8').split(/\r?\n/)) {
                if (!line.trim())
                    continue;
                try {
                    const value = JSON.parse(line);
                    if (value.v !== 1 || typeof value.date !== 'string' || typeof value.fullName !== 'string')
                        throw new Error('bad shape');
                    records.push(value);
                }
                catch {
                    skipped++;
                }
            }
        }
        return { records, skipped };
    }
    /** Merge every snapshot into per-repo series (dedupe: last observation per date). */
    series() {
        const { records } = this.readAll();
        const byRepo = new Map();
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
function validName(name) {
    const match = /^snapshots-(\d{4})-(\d{2})\.jsonl$/.exec(name);
    if (!match)
        return false;
    const month = Number(match[2]);
    return month >= 1 && month <= 12;
}
export function expandHome(dir) {
    return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;
}
//# sourceMappingURL=snapshot.js.map