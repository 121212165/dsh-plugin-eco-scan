/** Make the npm mapping layer trustworthy before scoring.
 * Pass 1 drops substring heuristics (confidence < 0.85) — they credited one
 * package's downloads to dozens of unrelated repos. Pass 2 keeps a single
 * winning repo per package (highest confidence, then most stars), so a
 * typosquat clone can no longer inherit the real package's download count.
 * Then today's snapshots are rebuilt from the surviving mappings only. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openDb, allMappings, writeSnapshot } from '../lib/core/index.js';

const DATA_DIR = process.env.ECO_SCAN_DATA_DIR || join(homedir(), '.dsh', 'eco-scan');
const db = openDb(join(DATA_DIR, 'eco.db'));
const TODAY = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

const total0 = db.raw.prepare('select count(*) n from repo_npm_map').get().n;
const weak = db.raw
  .prepare("delete from repo_npm_map where source = 'heuristic' and confidence < 0.85")
  .run().changes;
console.log(`pass 1: dropped ${weak} substring heuristics (${total0} -> ${total0 - weak})`);

const total1 = db.raw.prepare('select count(*) n from repo_npm_map').get().n;
const shared = db.raw
  .prepare(`with ranked as (
              select m.repo_id, m.npm_name,
                     row_number() over (partition by m.npm_name
                                        order by m.confidence desc, r.stars desc, m.repo_id) rn
              from repo_npm_map m join repos r on r.id = m.repo_id
            )
            delete from repo_npm_map
            where exists (select 1 from ranked
                          where ranked.repo_id = repo_npm_map.repo_id
                            and ranked.npm_name = repo_npm_map.npm_name
                            and ranked.rn > 1)`)
  .run().changes;
console.log(`pass 2: dropped ${shared} losing package claims (${total1} -> ${total1 - shared})`);

const npmByName = new Map(db.raw.prepare('select name, weekly_downloads from npm_packages').all().map((r) => [r.name, r.weekly_downloads]));
const weeklyByRepo = new Map();
for (const row of allMappings(db)) {
  const weekly = npmByName.get(row.npmName);
  if (weekly === undefined) continue;
  weeklyByRepo.set(row.repoId, (weeklyByRepo.get(row.repoId) ?? 0) + weekly);
}

const snaps = db.raw
  .prepare('select repo_id, stars, release_downloads, segment, segment_confidence from snapshots where scan_date = ?')
  .all(TODAY);
for (const snap of snaps) {
  writeSnapshot(db, {
    repoId: snap.repo_id,
    date: TODAY,
    stars: snap.stars,
    npmWeekly: weeklyByRepo.get(snap.repo_id) ?? null,
    releaseDownloads: snap.release_downloads,
    segment: snap.segment,
    segmentConfidence: snap.segment_confidence,
  }, nowIso);
}
console.log(`snapshots rebuilt: ${snaps.length}`);
console.log('mapped repos', db.raw.prepare('select count(distinct repo_id) n from repo_npm_map').get().n);
console.log('verified repos', db.raw.prepare('select count(distinct repo_id) n from repo_npm_map where confidence=1').get().n);
console.log('repos with weekly', db.raw.prepare('select count(*) n from snapshots where scan_date=? and npm_weekly is not null').get(TODAY).n);
db.close();
