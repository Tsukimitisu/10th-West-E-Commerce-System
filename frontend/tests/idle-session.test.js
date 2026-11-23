import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createIdleSessionController,
  serverSessionDeadline,
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
    jump(milliseconds) { current += milliseconds; },
  };
};

test('server deadline warns at sixty seconds and logs out exactly once', () => {
  const clock = createFakeClock(), warnings = []; let logouts = 0;
  const controller = createIdleSessionController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onWarning: value => warnings.push(value), onLogout: () => logouts++ });
  assert.equal(controller.start(),true); assert.equal(controller.start(),false);
  controller.setDeadline(90000);
  clock.advance(29999); assert.equal(warnings.length,0);
  clock.advance(1); assert.deepEqual(warnings,[{logoutAt:90000}]);
  clock.advance(60000); assert.equal(logouts,1);
  clock.advance(100000); assert.equal(logouts,1); assert.equal(clock.pending(),0);
});

test('activity and Stay signed in never invent an expiry; only server confirmation extends it', () => {
  const clock = createFakeClock(); let activity = 0, stays = 0, logouts = 0;
  const controller = createIdleSessionController({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onActivity: () => activity++, onStay: () => stays++, onLogout: () => logouts++ });
  controller.start(); controller.setDeadline(90000);
  clock.advance(10000); controller.recordActivity(); assert.equal(activity,1);
  clock.advance(20000); assert.equal(controller.recordActivity(),false);
  controller.staySignedIn(); assert.equal(stays,1);
  controller.setDeadline(200000); // Response from the existing authenticated refresh endpoint.
  clock.advance(60000); assert.equal(logouts,0);
  clock.advance(110000); assert.equal(logouts,1);
});

test('server clock mapping accounts for latency and background sleep cannot extend expiry', () => {
  assert.equal(serverSessionDeadline({expires_at:'2026-01-01T00:01:00Z',server_now:'2026-01-01T00:00:00Z'},1000),61000);
  assert.throws(() => serverSessionDeadline({}), /server/);
  const clock = createFakeClock(); let logouts = 0;
  const controller = createIdleSessionController({now:clock.now,setTimer:clock.setTimer,clearTimer:clock.clearTimer,onLogout:()=>logouts++});
  controller.start();controller.setDeadline(90000);clock.jump(150000);controller.check();assert.equal(logouts,1);
});

test('guard uses server timing, secure refresh and explicit activity rather than API polling', async () => {
  assert.equal(IDLE_WARNING_MS,60000);
  const [guard,api] = await Promise.all([readFile(new URL('../components/IdleSessionGuard.jsx',import.meta.url),'utf8'),readFile(new URL('../services/api.js',import.meta.url),'utf8')]);
  assert.match(guard,/Are you still there/);assert.match(guard,/Your session will expire in/);
  assert.match(guard,/event.isTrusted/);assert.match(guard,/request\(refreshSession, true\)/);
  assert.match(guard,/clearCurrentAuthUser\(\)/);assert.match(guard,/subscribeSessionDeadline/);
  assert.match(api,/auth\/session\/refresh.*method: 'POST'/);
});
