/**
 * Wire-level (assembly layer) tests for eco-scan: mount the real apply()
 * against a scripted cordis context and assert the registration surface and
 * the local pure paths. Deliberately network-free: the scan command/tool is
 * never invoked, only mounted; presentation helpers run on synthetic input.
 * Template: dsh-plugin-quota/test/harness.ts.
 * @module test/wire
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { apply, type Config } from '../src/plugin.ts';

interface CapturedCommand { name: string; handler: (...args: unknown[]) => unknown; description?: string }

interface CapturedTool {
  name: string;
  execute: (...args: unknown[]) => unknown;
  presentCall?: (...args: unknown[]) => unknown;
  presentResult?: (...args: unknown[]) => unknown;
}

function makeCtx() {
  const commands: CapturedCommand[] = [];
  const tools: CapturedTool[] = [];
  const listeners: { event: string; callback: (...args: unknown[]) => unknown }[] = [];
  const logs: string[] = [];
  const ctx = {
    logger() {
      return { info: (message: string) => logs.push(message), warn: (message: string) => logs.push(message), debug() {} };
    },
    on(event: string, callback: (...args: unknown[]) => unknown) {
      listeners.push({ event, callback });
    },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
    tools: { register(definition: CapturedTool) { tools.push(definition); } },
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
  return { ctx, commands, tools, listeners, logs, command, tool };
}

function applyDefaults(config: Partial<Config>): Config {
  return { enabled: true, dataDir: '', tokenEnv: ['GITHUB_TOKEN', 'GH_TOKEN'], topGrowth: 15, ...config };
}

const work = mkdtempSync(join(tmpdir(), 'eco-scan-wire-'));
after(() => rmSync(work, { recursive: true, force: true }));

test('disabled config mounts nothing', () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ enabled: false }));
  assert.equal(wired.commands.length, 0);
  assert.equal(wired.tools.length, 0);
  assert.ok(wired.logs.some((line) => line.includes('disabled by config')), `disable notice logged: ${wired.logs.join('|')}`);
});

test('mount wires exactly /eco-scan + eco_scan and no event middleware', () => {
  const dataDir = join(work, 'snapshots');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir }));

  assert.deepEqual(
    wired.commands.map((candidate) => candidate.name),
    ['eco-scan'],
  );
  assert.deepEqual(
    wired.tools.map((candidate) => candidate.name),
    ['eco_scan'],
  );
  assert.equal(wired.listeners.length, 0, 'eco-scan is command/tool surface only — no session or tool middleware');
  assert.ok(wired.logs.some((line) => line.includes(`mounted · dataDir=${dataDir}`)), `mount shadow logged: ${wired.logs.join('|')}`);

  // both surfaces point at the same scan() — wired, but never invoked here (network)
  assert.equal(typeof wired.command('eco-scan').handler, 'function');
  assert.equal(typeof wired.tool('eco_scan').execute, 'function');
});

test('mounting has no filesystem side effect until a scan actually runs', () => {
  const dataDir = join(work, 'side-effect-free');
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir }));
  assert.ok(!existsSync(dataDir), 'the SnapshotStore dir is created lazily by append, not at mount');
});

test('the injected tool presents its call and result cards locally, without a fetch', () => {
  const wired = makeCtx();
  apply(wired.ctx as never, applyDefaults({ dataDir: join(work, 'present') }));
  const tool = wired.tool('eco_scan');

  const call = tool.presentCall!({}) as { card: string; title: string; kind: string };
  assert.deepEqual(call, { card: 'generic', title: '生态扫描', kind: 'fetch' });

  const report = 'dsh 插件生态快照 2026-10-19：42 个仓库（topic: dsh-plugin / dsh-plugins）\n细分赛道（按周下载+星标排序）:\n- harness 12 仓库';
  const card = tool.presentResult!({}, report) as { card: string; title: string; kind: string; rawInput: string };
  assert.equal(card.card, 'generic');
  assert.equal(card.kind, 'fetch');
  assert.equal(card.title, report.split('\n')[0]!.slice(0, 60), 'title is the report headline, 60-char capped');
  assert.equal(card.rawInput, report, 'the full report stays inside the card');
});
