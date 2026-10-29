import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeSchedule, nextRunAt, parseSchedule, Scheduler, ScheduleError } from '../../src/core/scheduler.ts';

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
  const scheduler = new Scheduler({ spec: { kind: 'every', hours: 6 }, task: () => void ran++ });
  const first = scheduler.start();
  assert.ok(first && first.getTime() > Date.now(), 'the first run is hours away');
  assert.equal(scheduler.active, true);
  scheduler.stop();
  await scheduler.settle();
  assert.equal(ran, 0);
  assert.equal(scheduler.active, false);
  assert.equal(scheduler.nextRunAt, null);
});
