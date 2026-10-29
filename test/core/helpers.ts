import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

import { openDb } from '../../src/core/db.ts';
import { upsertRepo } from '../../src/core/storage.ts';
import type { RepoFacts } from '../../src/core/types.ts';

const work = mkdtempSync(join(tmpdir(), 'eco-core-test-'));
const opened: { close(): void }[] = [];
after(() => {
  for (const db of opened) {
    try {
      db.close();
    } catch {
      // already closed by the test
    }
  }
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

export function tempDb(): { db: ReturnType<typeof openDb>; path: string } {
  const path = join(work, `eco-${Math.random().toString(36).slice(2)}.db`);
  const db = openDb(path);
  opened.push(db);
  return { db, path };
}

export function facts(id: string, overrides: Partial<RepoFacts> = {}): RepoFacts {
  return {
    id,
    description: 'a dsh plugin',
    stars: 10,
    forks: 1,
    openIssues: 0,
    language: 'TypeScript',
    license: 'MIT',
    topics: ['dsh-plugin'],
    createdAt: '2026-01-01T00:00:00.000Z',
    pushedAt: '2026-10-01T00:00:00.000Z',
    lastCommitAt: '2026-10-01T00:00:00.000Z',
    contributors: 2,
    ci: true,
    testsCount: 5,
    issueCloseHours: 12,
    archived: false,
    ...overrides,
  };
}

export function seedRepo(db: ReturnType<typeof openDb>, id: string, overrides: Partial<RepoFacts> = {}): void {
  upsertRepo(db, facts(id, overrides));
}

export { work };
