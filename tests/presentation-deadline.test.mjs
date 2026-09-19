import assert from 'node:assert/strict';
import test from 'node:test';
import { schedulePresentationDeadline } from '../src/shared/presentation-deadline.ts';

const createClock = (initialTime) => {
  let time = initialTime;
  const timers = [];
  return {
    timers,
    clock: {
      now: () => time,
      setTimer: (callback, delayMs) => {
        const timer = { callback, delayMs, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimer: (timer) => { timer.cancelled = true; },
    },
    fire: (timer, presentationTime) => {
      time = presentationTime;
      timer.callback();
    },
  };
};

test('deadline de mídia fracionário arredonda a espera para cima sem disparar antes', () => {
  const fake = createClock(1000);
  const deadline = 1000 + 18.44625 * 1000;
  let calls = 0;
  schedulePresentationDeadline(deadline, () => { calls += 1; }, fake.clock);
  assert.equal(fake.timers[0].delayMs, 18_447);
  assert.equal(calls, 0);
  fake.fire(fake.timers[0], 19_447);
  assert.equal(calls, 1);
  assert.equal(fake.timers.length, 1);
});

test('timer adiantado e correção regressiva do relógio rearmam a mesma transição', () => {
  const fake = createClock(1000);
  let calls = 0;
  schedulePresentationDeadline(1100.5, () => { calls += 1; }, fake.clock);
  assert.equal(fake.timers[0].delayMs, 101);
  fake.fire(fake.timers[0], 1100);
  assert.equal(calls, 0);
  assert.equal(fake.timers[1].delayMs, 1);
  fake.fire(fake.timers[1], 1090);
  assert.equal(calls, 0);
  assert.equal(fake.timers[2].delayMs, 11);
  fake.fire(fake.timers[2], 1101);
  assert.equal(calls, 1);
  assert.equal(fake.timers.length, 3);
});

for (const rearm of [false, true]) {
  test(`cancelamento ${rearm ? 'depois do rearme' : 'antes do disparo'} impede callback atrasado`, () => {
    const fake = createClock(1000);
    let calls = 0;
    const cancel = schedulePresentationDeadline(1100.5, () => { calls += 1; }, fake.clock);
    if (rearm) fake.fire(fake.timers[0], 1100);
    const latest = fake.timers.at(-1);
    cancel();
    cancel();
    assert.equal(latest.cancelled, true);
    const count = fake.timers.length;
    // A queued callback can arrive after cleanup even though its timer was cleared.
    fake.fire(latest, 1200);
    assert.equal(calls, 0);
    assert.equal(fake.timers.length, count);
  });
}

test('transição concluída executa uma vez mesmo com entrega repetida do callback', () => {
  const fake = createClock(1000);
  let calls = 0;
  const cancel = schedulePresentationDeadline(1100.5, () => { calls += 1; }, fake.clock);
  fake.fire(fake.timers[0], 1100);
  const finalTimer = fake.timers[1];
  fake.fire(finalTimer, 1100.5);
  fake.fire(finalTimer, 1300);
  fake.fire(fake.timers[0], 1400);
  cancel();
  assert.equal(calls, 1);
  assert.equal(fake.timers.length, 2);
});

test('deadline já vencido continua assíncrono e usa espera mínima de um milissegundo', () => {
  const fake = createClock(1100);
  let calls = 0;
  schedulePresentationDeadline(1000, () => { calls += 1; }, fake.clock);
  assert.equal(calls, 0);
  assert.equal(fake.timers[0].delayMs, 1);
  fake.fire(fake.timers[0], 1101);
  assert.equal(calls, 1);
});
