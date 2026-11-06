import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeSchedule, nextRunAt, parseSchedule, Scheduler, ScheduleError } from '../../src/core/scheduler.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('parseSchedule accepts the documented forms and rejects nonsense', () => {
  assert.deepEqual(parseSchedule('off'), { kind: 'off' });
  assert.deepEqual(parseSchedule(''), { kind: 'off' });
  assert.deepEqual(parseSchedule(undefined), { kind: 'off' });
  assert.deepEqual(parseSchedule('every 6h'), { kind: 'every', hours: 6 });
  assert.deepEqual(parseSchedule('every 1.5 hours'), { kind: 'every', hours: 1.5 });
  assert.deepEqual(parseSchedule('every 30m'), { kind: 'every', hours: 0.5 });
  assert.deepEqual(parseSchedule('daily 03:30'), { kind: 'daily', hour: 3, minute: 30 });
  assert.deepEqual(parseSchedule('3:05'), { kind: 'daily', hour: 3, minute: 5 });
  assert.deepEqual(parseSchedule('DAILY 23:59 UTC'), { kind: 'daily', hour: 23, minute: 59 });
  assert.throws(() => parseSchedule('weekly'), ScheduleError);
  assert.throws(() => parseSchedule('every 0h'), ScheduleError);
  assert.throws(() => parseSchedule('every 500h'), ScheduleError);
  assert.throws(() => parseSchedule('24:00'), ScheduleError);
  assert.throws(() => parseSchedule('daily 03:75'), ScheduleError);
});

test('describeSchedule round-trips into something a human can read', () => {
  assert.equal(describeSchedule({ kind: 'off' }), 'off');
  assert.equal(describeSchedule({ kind: 'every', hours: 6 }), 'every 6h');
  assert.equal(describeSchedule({ kind: 'every', hours: 0.5 }), 'every 0.5h');
  assert.equal(describeSchedule({ kind: 'daily', hour: 3, minute: 5 }), 'daily 03:05 UTC');
});

test('nextRunAt is strictly after now and rolls a daily slot to tomorrow', () => {
  const now = new Date('2026-10-29T02:00:00.000Z');
  assert.equal(nextRunAt({ kind: 'daily', hour: 3, minute: 30 }, now)?.toISOString(), '2026-10-29T03:30:00.000Z');
  const exact = new Date('2026-10-29T03:30:00.000Z');
  assert.equal(nextRunAt({ kind: 'daily', hour: 3, minute: 30 }, exact)?.toISOString(), '2026-10-30T03:30:00.000Z');
  assert.equal(nextRunAt({ kind: 'every', hours: 6 }, now)?.toISOString(), '2026-10-29T08:00:00.000Z');
  assert.equal(nextRunAt({ kind: 'off' }, now), null);
});

test('the scheduler fires each due instant, sequentially, until stopped', async () => {
  let clock = Date.parse('2026-10-29T00:00:00.000Z');
  const delays: number[] = [];
  const runs: string[] = [];
  const scheduler: Scheduler = new Scheduler({
    spec: { kind: 'every', hours: 6 },
    now: () => new Date(clock),
    sleep: async (ms) => {
      delays.push(ms);
      clock += ms;
    },
    task: (scheduledFor) => {
      runs.push(scheduledFor.toISOString());
      if (runs.length === 2) scheduler.stop();
    },
  });
  const first = scheduler.start();
  assert.equal(first?.toISOString(), '2026-10-29T06:00:00.000Z');
  assert.equal(scheduler.active, true);
  await scheduler.settle();
  assert.deepEqual(runs, ['2026-10-29T06:00:00.000Z', '2026-10-29T12:00:00.000Z']);
  assert.deepEqual(delays, [6 * 3_600_000, 6 * 3_600_000]);
  assert.equal(scheduler.active, false);
  assert.equal(scheduler.nextRunAt, null);
});

test('a failing task is reported and does not kill the schedule', async () => {
  let clock = Date.parse('2026-10-29T00:00:00.000Z');
  const errors: string[] = [];
  let attempts = 0;
  const scheduler = new Scheduler({
    spec: { kind: 'every', hours: 1 },
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
    },
    onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
    task: () => {
      attempts++;
      if (attempts === 1) throw new Error('boom');
      scheduler.stop();
    },
  });
  scheduler.start();
  await scheduler.settle();
  assert.equal(attempts, 2);
  assert.deepEqual(errors, ['boom']);
});

test('start on an off schedule is a no-op and settle resolves immediately', async () => {
  let called = 0;
  const scheduler = new Scheduler({ spec: { kind: 'off' }, task: () => void called++ });
  assert.equal(scheduler.start(), null);
  assert.equal(scheduler.active, false);
  await scheduler.settle();
  assert.equal(called, 0);
});

test('starting twice does not create a second loop', async () => {
  let clock = Date.parse('2026-10-29T00:00:00.000Z');
  const runs: string[] = [];
  const scheduler = new Scheduler({
    spec: { kind: 'every', hours: 2 },
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
    },
    task: () => {
      runs.push(new Date(clock).toISOString());
      scheduler.stop();
    },
  });
  scheduler.start();
  scheduler.start();
  await scheduler.settle();
  assert.deepEqual(runs, ['2026-10-29T02:00:00.000Z']);
});

test('stop wakes the real timer so teardown settles without waiting out the interval', async () => {
  let ran = 0;
  const scheduler = new Scheduler({
    spec: { kind: 'every', hours: 6 },
    now: () => new Date('2026-10-29T00:00:00.000Z'),
    task: () => void ran++,
  });
  const first = scheduler.start();
  assert.equal(first?.toISOString(), '2026-10-29T06:00:00.000Z');
  assert.equal(scheduler.active, true);
  scheduler.stop();
  await scheduler.settle();
  assert.equal(ran, 0);
  assert.equal(scheduler.active, false);
  assert.equal(scheduler.nextRunAt, null);
});

test('parser normalizes aliases and validates both unit and clock boundaries', () => {
  for (const text of [null, ' NONE ', ' Manual ', '\tOFF\n']) assert.deepEqual(parseSchedule(text), { kind: 'off' });
  for (const unit of ['h', 'hr', 'hrs', 'hour', 'hours']) {
    assert.deepEqual(parseSchedule(` EVERY 168 ${unit.toUpperCase()} `), { kind: 'every', hours: 168 });
  }
  for (const unit of ['m', 'min', 'mins', 'minute', 'minutes']) {
    assert.deepEqual(parseSchedule(`every 10080 ${unit}`), { kind: 'every', hours: 168 });
  }
  assert.deepEqual(parseSchedule('every 0.5m'), { kind: 'every', hours: 1 / 120 });
  assert.deepEqual(parseSchedule('00:00 utc'), { kind: 'daily', hour: 0, minute: 0 });
  for (const text of ['every 0m', 'every 168.01h', 'every 10081m', 'every -1h', 'every NaNh', 'every .5h', 'every 1d', 'daily 12:60', '25:00', 'daily 3:5', 'daily 03:00 local']) {
    assert.throws(() => parseSchedule(text), (error: unknown) => {
      assert.ok(error instanceof ScheduleError);
      assert.equal(error.name, 'ScheduleError');
      assert.ok(error.message.includes(text));
      return true;
    });
  }
  assert.equal(describeSchedule(parseSchedule('every 1m')), 'every 0.02h');
});

test('daily slots cross UTC month, leap-day and year boundaries', () => {
  for (const [now, expected] of [
    ['2026-10-31T23:59:59Z', '2026-11-01T00:00:00.000Z'],
    ['2028-02-28T00:00:00Z', '2028-02-29T00:00:00.000Z'],
    ['2026-12-31T23:59:59Z', '2027-01-01T00:00:00.000Z'],
    ['2026-10-29T07:00:00+08:00', '2026-10-29T00:00:00.000Z'],
  ]) {
    assert.equal(nextRunAt(parseSchedule('daily 00:00'), new Date(now!))?.toISOString(), expected);
  }
});

test('default clock and timer fire exactly at the due instant without wall-clock waits', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-10-29T00:00:00.000Z') });
  assert.equal(nextRunAt(parseSchedule('every 1h'))?.toISOString(), '2026-10-29T01:00:00.000Z');
  const runs: string[][] = [];
  const scheduler = new Scheduler({
    spec: parseSchedule('every 1h'),
    task: (due, started) => {
      runs.push([due.toISOString(), started.toISOString()]);
      scheduler.stop();
    },
  });
  t.after(() => scheduler.stop());
  scheduler.start();
  t.mock.timers.tick(3_599_999);
  await Promise.resolve();
  assert.deepEqual(runs, []);
  t.mock.timers.tick(1);
  await scheduler.settle();
  assert.deepEqual(runs, [['2026-10-29T01:00:00.000Z', '2026-10-29T01:00:00.000Z']]);
  assert.equal(scheduler.active, false);
  assert.equal(scheduler.nextRunAt, null);
});

test('cancelled injected sleep cannot dispatch a task and exposed dates are defensive copies', async () => {
  const sleeper = deferred();
  let calls = 0;
  const scheduler = new Scheduler({
    spec: parseSchedule('daily 03:30'),
    now: () => new Date('2026-10-29T00:00:00.000Z'),
    sleep: () => sleeper.promise,
    task: () => { calls++; },
  });
  await scheduler.settle();
  scheduler.stop();
  const first = scheduler.start()!;
  first.setUTCFullYear(1999);
  scheduler.nextRunAt!.setUTCFullYear(2000);
  assert.equal(scheduler.start()?.toISOString(), '2026-10-29T03:30:00.000Z');
  scheduler.stop();
  scheduler.stop();
  assert.equal(scheduler.nextRunAt, null);
  sleeper.resolve();
  await scheduler.settle();
  assert.equal(calls, 0);
  assert.equal(scheduler.active, false);
});

test('an in-flight task is awaited on stop and no second run overlaps it', async () => {
  const entered = deferred();
  const finished = deferred();
  let sleeps = 0;
  let calls = 0;
  const scheduler = new Scheduler({
    spec: parseSchedule('every 1h'),
    now: () => new Date('2026-10-29T00:00:00.000Z'),
    sleep: async () => { sleeps++; },
    task: async () => {
      calls++;
      entered.resolve();
      await finished.promise;
    },
  });
  scheduler.start();
  await entered.promise;
  assert.equal(scheduler.nextRunAt, null);
  assert.equal(scheduler.start(), null, 'start is a no-op while a task is running');
  assert.equal(sleeps, 1);
  assert.equal(calls, 1);
  scheduler.stop();
  let settled = false;
  const settling = scheduler.settle().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  finished.resolve();
  await settling;
  assert.equal(settled, true);
  assert.equal(sleeps, 1);
  assert.equal(calls, 1);
  assert.equal(scheduler.active, false);
});

for (const failure of [new Error('boom'), 'non-Error rejection']) {
  test(`async task failure is logged without an onError hook and the next daily slot runs: ${String(failure)}`, async () => {
    let clock = Date.parse('2026-10-29T02:00:00.000Z');
    const logs: string[] = [];
    const runs: string[] = [];
    const scheduler = new Scheduler({
      spec: parseSchedule('daily 03:30'),
      now: () => new Date(clock),
      sleep: async (ms) => { clock += ms; },
      log: (message) => logs.push(message),
      task: async (due) => {
        runs.push(due.toISOString());
        if (runs.length === 1) throw failure;
        scheduler.stop();
      },
    });
    scheduler.start();
    await scheduler.settle();
    assert.deepEqual(runs, ['2026-10-29T03:30:00.000Z', '2026-10-30T03:30:00.000Z']);
    assert.deepEqual(logs, [
      '下次扫描：2026-10-29T03:30:00.000Z',
      `定时扫描失败：${failure instanceof Error ? failure.message : failure}`,
      '下次扫描：2026-10-30T03:30:00.000Z',
    ]);
    assert.equal(scheduler.active, false);
  });
}

test('a clock jump during scheduling clamps a past due delay to zero', async () => {
  let reads = 0;
  const delays: number[] = [];
  const runs: string[][] = [];
  const scheduler = new Scheduler({
    spec: parseSchedule('every 1h'),
    now: () => new Date(reads++ === 0 ? '2026-10-29T00:00:00Z' : '2026-10-29T02:00:00Z'),
    sleep: async (ms) => { delays.push(ms); },
    task: (due, started) => {
      runs.push([due.toISOString(), started.toISOString()]);
      scheduler.stop();
    },
  });
  scheduler.start();
  await scheduler.settle();
  assert.deepEqual(delays, [0]);
  assert.deepEqual(runs, [['2026-10-29T01:00:00.000Z', '2026-10-29T02:00:00.000Z']]);
});
