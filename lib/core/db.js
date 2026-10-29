/** SQLite storage built on Node's built-in `node:sqlite` (no native addon, no
 * better-sqlite3 install step). WAL for concurrent readers, foreign keys on,
 * and a numbered migration table so schema changes stay auditable. */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const MIGRATIONS = [
    {
        version: 2,
        name: 'v2-baseline',
        sql: `
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        stars INTEGER NOT NULL DEFAULT 0,
        forks INTEGER NOT NULL DEFAULT 0,
        open_issues INTEGER NOT NULL DEFAULT 0,
        language TEXT,
        license TEXT,
        topics TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        pushed_at TEXT NOT NULL,
        last_commit_at TEXT,
        contributors_count INTEGER,
        ci INTEGER,
        tests_count INTEGER,
        issue_close_hours REAL,
        archived INTEGER NOT NULL DEFAULT 0,
        details_fetched_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        scan_date TEXT NOT NULL,
        stars INTEGER NOT NULL,
        npm_weekly INTEGER,
        release_downloads INTEGER,
        segment TEXT NOT NULL,
        segment_confidence REAL,
        created_at TEXT NOT NULL,
        UNIQUE(repo_id, scan_date)
      );

      CREATE TABLE IF NOT EXISTS npm_packages (
        name TEXT PRIMARY KEY,
        weekly_downloads INTEGER NOT NULL DEFAULT 0,
        range_week INTEGER,
        range_prev INTEGER,
        growth_pct REAL,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repo_npm_map (
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        npm_name TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual','awesome','registry','heuristic')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (repo_id, npm_name)
      );

      CREATE TABLE IF NOT EXISTS segment_overrides (
        repo_id TEXT PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
        segment TEXT NOT NULL,
        reason TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repo_segments (
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        segment TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('rules','override','legacy')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (repo_id, segment)
      );

      CREATE TABLE IF NOT EXISTS snapshot_segments (
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        scan_date TEXT NOT NULL,
        segment TEXT NOT NULL,
        confidence REAL NOT NULL,
        PRIMARY KEY (repo_id, scan_date, segment)
      );

      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_date TEXT NOT NULL,
        repo_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('ok','partial','failed')),
        error TEXT,
        stage TEXT NOT NULL DEFAULT 'start',
        checkpoint TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scan_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS release_cache (
        repo_id TEXT PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
        downloads INTEGER,
        etag TEXT,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS etag_cache (
        key TEXT PRIMARY KEY,
        etag TEXT NOT NULL,
        body TEXT,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alert_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id TEXT NOT NULL,
        repo_id TEXT NOT NULL,
        scan_date TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(rule_id, repo_id, scan_date)
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(scan_date);
      CREATE INDEX IF NOT EXISTS idx_snapshots_repo ON snapshots(repo_id);
      CREATE INDEX IF NOT EXISTS idx_repo_segments_segment ON repo_segments(segment);
      CREATE INDEX IF NOT EXISTS idx_npm_weekly ON npm_packages(weekly_downloads);
      CREATE INDEX IF NOT EXISTS idx_scan_errors_scan ON scan_errors(scan_id);
    `,
    },
];
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
export function openDb(path, options = {}) {
    if (path !== ':memory:')
        mkdirSync(dirname(path), { recursive: true });
    const raw = new DatabaseSync(path, {
        readOnly: options.readOnly ?? false,
        enableForeignKeyConstraints: true,
        timeout: 5000,
    });
    if (!options.readOnly) {
        raw.exec('PRAGMA journal_mode = WAL');
        raw.exec('PRAGMA synchronous = NORMAL');
    }
    const db = { raw, path, close: () => raw.close() };
    if (!options.readOnly)
        migrate(db);
    return db;
}
/** Applies every migration newer than the recorded version. Idempotent. */
export function migrate(db) {
    db.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    const appliedRows = db.raw.prepare('SELECT version FROM schema_migrations').all();
    const applied = new Set(appliedRows.map((row) => row.version));
    for (const migration of MIGRATIONS) {
        if (applied.has(migration.version))
            continue;
        transaction(db, () => {
            db.raw.exec(migration.sql);
            db.raw
                .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
                .run(migration.version, migration.name, new Date().toISOString());
        });
    }
    return schemaVersion(db);
}
export function schemaVersion(db) {
    const row = db.raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return row?.version ?? 0;
}
export function transaction(db, work) {
    db.raw.exec('BEGIN IMMEDIATE');
    try {
        const result = work();
        db.raw.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.raw.exec('ROLLBACK');
        throw error;
    }
}
export function getMeta(db, key) {
    const row = db.raw.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row?.value ?? null;
}
export function setMeta(db, key, value) {
    db.raw
        .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, value);
}
export function openReadOnly(path) {
    return openDb(path, { readOnly: true });
}
//# sourceMappingURL=db.js.map