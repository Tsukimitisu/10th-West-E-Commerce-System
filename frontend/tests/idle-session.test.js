import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createIdleSessionController,
  IDLE_LOGOUT_MS,
  IDLE_WARNING_MS,
} from '../utils/idleSession.js';

const createFakeClock = () => {
  let current = 0;
  let nextId = 1;
  const tasks = new Map();
  return {
    now: () => current,
    setTimer(callback, delay) {
      const id = nextId++;
      tasks.set(id, { at: current + delay, callback });
      return id;
    },
    clearTimer(id) { tasks.delete(id); },
    advance(milliseconds) {
      const target = current + milliseconds;
      while (true) {
        const due = [...tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        tasks.delete(due[0]);
        current = due[1].at;
        due[1].callback();
      }
      current = target;
    },
    pending: () => tasks.size,
  };
};

test('idle controller warns before logging out exactly once', () => {
  const clock = createFakeClock();
  const warnings = [];
  let logoutCount = 0;
  const controller = createIdleSessionController({
    warningMs: 25_000,
    logoutMs: 30_000,
    onWarning: (warning) => warnings.push(warning),
    onLogout: () => { logoutCount += 1; },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
  });

  assert.equal(controller.start(), true);
  assert.equal(controller.start(), false, 'a second start must not create duplicate timers');
  clock.advance(24_999);
  assert.equal(warnings.length, 0);
  clock.advance(1);
  assert.deepEqual(warnings, [{ logoutAt: 30_000 }]);
  clock.advance(5_000);
  assert.equal(logoutCount, 1);
  clock.advance(60_000);
  assert.equal(logoutCount, 1);
  assert.equal(clock.pending(), 0);
});

test('activity and Stay signed in reset the idle deadline', () => {
  const clock = createFakeClock();
  let warnings = 0;
  let warningClears = 0;
  let logouts = 0;
  const controller = createIdleSessionController({
    warningMs: 100,
    logoutMs: 150,
    onWarning: () => { warnings += 1; },
    onWarningCleared: () => { warningClears += 1; },
    onLogout: () => { logouts += 1; },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
  });

  controller.start();
  clock.advance(90);
  assert.equal(controller.recordActivity(), true);
  clock.advance(99);
  assert.equal(warnings, 0);
  clock.advance(1);
  assert.equal(warnings, 1);
  assert.equal(controller.recordActivity(), false, 'warning requires an explicit continue action');
  assert.equal(controller.staySignedIn(), true);
  clock.advance(100);
  assert.equal(warnings, 2);
  clock.advance(50);
  assert.equal(logouts, 1);
  assert.ok(warningClears >= 3);
});

test('idle guard is authenticated-only and uses the CSRF-aware logout endpoint', async () => {
  assert.equal(IDLE_WARNING_MS, 25 * 60 * 1000);
  assert.equal(IDLE_LOGOUT_MS, 30 * 60 * 1000);
  const [guard, app, api] = await Promise.all([
    readFile(new URL('../components/IdleSessionGuard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../services/api.js', import.meta.url), 'utf8'),
  ]);
  assert.match(guard, /if \(!user\?\.id\)/);
  assert.match(guard, /pointerdown.*keydown.*scroll.*touchstart.*mousemove/);
  assert.match(guard, /Stay signed in/);
  assert.match(guard, /You were signed out due to inactivity\./);
  assert.match(app, /<IdleSessionGuard user=\{user\} onLogout=\{onLogout\}/);
  assert.match(api, /authenticatedFetch\(`\$\{API_URL\}\/auth\/logout`, \{ method: 'POST' \}\)/);
});
