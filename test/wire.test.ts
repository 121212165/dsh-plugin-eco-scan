/**
 * Wire-level (assembly layer) tests for eco-scan v2: mount the real apply()
 * against a scripted cordis context and assert the registration surface and
 * the local, network-free paths. The scan command/tool is never invoked here.
 * Template: dsh-plugin-quota/test/harness.ts.
 * @module test/wire
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { apply, type Config } from '../src/plugin.ts';

interface CapturedCommand {
  name: string;
  handler: (...args: unknown[]) => unknown;
  description?: string;
}

interface CapturedTool {
  name: string;
  execute: (...args: unknown[]) => unknown;
  presentCall?: (...args: unknown[]) => unknown;
  presentResult?: (...args: unknown[]) => unknown;
}

const mounted: { dispose: () => void }[] = [];

function makeCtx() {
  const commands: CapturedCommand[] = [];
  const tools: CapturedTool[] = [];
  const listeners: { event: string; callback: (...args: unknown[]) => unknown }[] = [];
  const effects: (() => unknown)[] = [];
  const logs: string[] = [];
  const ctx = {
    logger() {
      return { info: (message: string) => logs.push(message), warn: (message: string) => logs.push(message), debug() {} };
    },
    on(event: string, callback: (...args: unknown[]) => unknown) {
      listeners.push({ event, callback });
    },
    effect(execute: () => unknown) {
      const result = execute();
      if (typeof result === 'function') effects.push(result as () => unknown);
    },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
    tools: { register(definition: CapturedTool) { tools.push(definition); } },
  };
  const dispose = (): void => {
    for (let index = effects.length - 1; index >= 0; index--) effects[index]!();
  };
  const command = (name: string): CapturedCommand => {
    const found = commands.find((candidate) => candidate.name === name);
    assert.ok(found, `command ${name} was never registered`);
    return found;
  };
  const tool = (name: string): CapturedTool => {
    const found = tools.find((candidate) => candidate.name === name);
    assert.ok(found, `tool ${name} was never registered`);
    return found;
  };
  mounted.push({ dispose });
  return { ctx, commands, tools, listeners, effects, logs, command, tool };
}

function applyDefaults(config: Partial<Config>): Config {
  return {
    enabled: true,
    dataDir: '',
    tokenEnv: ['GITHUB_TOKEN', 'GH_TOKEN'],
    topGrowth: 15,
    ecoVersion: 'v2',
    autoMigrate: true,
    resume: false,
    releaseBudget: 250,
    detailsTtlHours: 6,
    releaseTtlHours: 24,
    schedule: 'off',
    scheduleAlerts: true,
    scheduleOnStart: true,
    ...config,
  };
}

const work = mkdtempSync(join(tmpdir(), 'eco-scan-wire-'));
after(() => {
  for (const wired of mounted) wired.dispose();
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test('disabled config mounts nothing', () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ enabled: false }));
  assert.equal(wired.commands.length, 0);
  assert.equal(wired.tools.length, 0);
  assert.ok(wired.logs.some((line) => line.includes('disabled by config')), `disable notice logged: ${wired.logs.join('|')}`);
});

test('v2 mount wires eight commands and three tools, and no event middleware', () => {
  const dataDir = join(work, 'v2-mount');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir }));

  assert.deepEqual(
    wired.commands.map((candidate) => candidate.name),
    ['eco-scan', 'eco-diff', 'eco-top', 'eco-export', 'eco-panel', 'eco-calibrate', 'eco-alerts', 'eco-health'],
  );
  assert.deepEqual(
    wired.tools.map((candidate) => candidate.name),
    ['eco_scan', 'eco_diff', 'eco_query'],
  );
  assert.equal(wired.listeners.length, 0, 'eco-scan is command/tool surface only — no session or tool middleware');
  assert.equal(wired.effects.length, 1, 'one teardown effect closes the lazy database handle');
  assert.ok(wired.logs.some((line) => line.includes(`mounted · v2 · db=${join(dataDir, 'eco.db')}`)), `mount shadow logged: ${wired.logs.join('|')}`);
  for (const name of ['eco-scan', 'eco-diff', 'eco-top', 'eco-export', 'eco-panel', 'eco-calibrate', 'eco-alerts', 'eco-health']) {
    assert.equal(typeof wired.command(name).handler, 'function');
  }
  for (const name of ['eco_scan', 'eco_diff', 'eco_query']) {
    assert.equal(typeof wired.tool(name).execute, 'function');
  }
});

test('a schedule arms a second teardown effect and logs the next run', () => {
  const dataDir = join(work, 'scheduled');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir, schedule: 'every 6h', scheduleOnStart: false }));
  assert.equal(wired.effects.length, 2, 'the scheduler registers its own stop effect');
  assert.ok(wired.logs.some((line) => line.includes('排程 every 6h')), `schedule logged: ${wired.logs.join('|')}`);
  assert.ok(!existsSync(dataDir), 'arming a schedule without catch-up touches nothing on disk');
});

test('an invalid schedule is disabled with a warning instead of crashing the mount', () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir: join(work, 'bad-schedule'), schedule: 'weekly' }));
  assert.ok(wired.logs.some((line) => line.includes('排程配置无效')), wired.logs.join('|'));
  assert.equal(wired.commands.length, 8, 'the rest of the plugin still mounts');
});

test('mounting has no filesystem side effect until a command runs', () => {
  const dataDir = join(work, 'side-effect-free');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir }));
  assert.ok(!existsSync(dataDir), 'the database and default rule files are created lazily by the first command');
});

test('local commands answer without a network or a snapshot', async () => {
  const dataDir = join(work, 'local-commands');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir }));

  const health = (await wired.command('eco-health').handler()) as { kind: string; text: string };
  assert.equal(health.kind, 'success');
  assert.ok(health.text.includes('schema v2'));
  assert.ok(health.text.includes('repos 0'));

  const diff = (await wired.command('eco-diff').handler({ rawInput: '' })) as { kind: string; text: string };
  assert.equal(diff.kind, 'error');
  assert.ok(diff.text.includes('还没有任何快照'));

  const top = (await wired.command('eco-top').handler({ rawInput: '' })) as { kind: string; text: string };
  assert.equal(top.kind, 'error');

  const badFormat = (await wired.command('eco-export').handler({ rawInput: '--format nope' })) as { kind: string; text: string };
  assert.equal(badFormat.kind, 'error');
  assert.ok(badFormat.text.includes('未知格式'));

  const markdown = (await wired.command('eco-export').handler({ rawInput: '--format md' })) as { kind: string; text: string };
  assert.equal(markdown.kind, 'success');
  assert.ok(markdown.text.includes('(no snapshot)'));

  const alerts = (await wired.command('eco-alerts').handler({ rawInput: '--dry-run' })) as { kind: string; text: string };
  assert.equal(alerts.kind, 'success');
  assert.ok(alerts.text.includes('没有触发告警'));

  const panel = (await wired.command('eco-panel').handler({ rawInput: '' })) as { kind: string; text: string };
  assert.equal(panel.kind, 'success');
  assert.ok(panel.text.includes('panel.html'));
  assert.ok(panel.text.includes('快照 (无)'), panel.text);

  const calibration = (await wired.command('eco-calibrate').handler({ rawInput: '' })) as { kind: string; text: string };
  assert.equal(calibration.kind, 'success');
  assert.ok(calibration.text.includes('需要至少两个不同日期'));
});

test('the query tool enforces the read-only guard through the real tool', async () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir: join(work, 'query-tool') }));
  const tool = wired.tool('eco_query');

  const rejected = JSON.parse(String(await tool.execute({ sql: 'DELETE FROM repos' }))) as { error?: string };
  assert.match(rejected.error ?? '', /only SELECT \/ WITH \/ EXPLAIN is allowed/);

  const allowed = JSON.parse(String(await tool.execute({ sql: 'SELECT COUNT(*) AS n FROM repos' }))) as {
    columns: string[];
    rows: { n: number }[];
  };
  assert.deepEqual(allowed.columns, ['n']);
  assert.deepEqual(allowed.rows, [{ n: 0 }]);
});

test('the injected tool presents its call and result cards locally, without a fetch', () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir: join(work, 'present') }));
  const tool = wired.tool('eco_scan');

  assert.deepEqual(tool.presentCall!({}), { card: 'generic', title: '生态扫描', kind: 'fetch' });
  assert.deepEqual(tool.presentCall!({ segment: 'cost-budget' }), { card: 'generic', title: '生态扫描：cost-budget', kind: 'fetch' });

  const card = tool.presentResult!({}, '{"v":2}') as { card: string; title: string; kind: string; rawInput: string };
  assert.equal(card.card, 'generic');
  assert.equal(card.kind, 'fetch');
  assert.equal(card.title, '生态扫描完成');
  assert.equal(card.rawInput, '{"v":2}');
});

test('ecoVersion v1 mounts the frozen legacy surface only', () => {
  const dataDir = join(work, 'legacy');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir, ecoVersion: 'v1' }));
  assert.deepEqual(
    wired.commands.map((candidate) => candidate.name),
    ['eco-scan'],
  );
  assert.deepEqual(
    wired.tools.map((candidate) => candidate.name),
    ['eco_scan'],
  );
  assert.ok(wired.logs.some((line) => line.includes('v1 (legacy)')));
  assert.ok(!existsSync(dataDir), 'the legacy store is also lazy');
});
