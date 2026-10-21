import assert from 'node:assert/strict';
import test from 'node:test';
import { createUpdateManager } from '../src/pwa/updateManager.ts';
import { saveLessonResume, takeLessonResume } from '../src/pwa/lessonResume.ts';

class Worker extends EventTarget {
  state = 'installed';
  messages = [];
  postMessage(message) { this.messages.push(message); this.onMessage?.(message); }
}
class Registration extends EventTarget {
  waiting = null;
  installing = null;
  updates = 0;
  async update() { this.updates++; }
}
class Container extends EventTarget {
  controller = new Worker();
  registration = new Registration();
  registrations = 0;
  async register() { this.registrations++; return this.registration; }
  activate(worker) {
    this.controller = worker;
    this.registration.waiting = null;
    this.dispatchEvent(new Event('controllerchange'));
  }
}
function harness() {
  const container = new Container();
  let online = true;
  let reloads = 0;
  const manager = createUpdateManager(container, () => online, () => { reloads++; });
  return { container, manager, get reloads() { return reloads; }, offline: () => { online = false; } };
}
function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}

test('offline launches do not register or check the update server', async () => {
  const app = harness();
  app.offline();
  await app.manager.check();
  assert.equal(app.container.registrations, 0);
  assert.equal(app.manager.getState().available, false);
});

test('an already downloaded waiting worker is shown without activating it', async () => {
  const app = harness();
  app.container.registration.waiting = new Worker();
  await app.manager.check();
  assert.equal(app.manager.getState().available, true);
  assert.deepEqual(app.container.registration.waiting.messages, []);
  assert.equal(app.reloads, 0);
  await app.manager.check();
  assert.equal(app.container.registration.updates, 1);
});

test('an update found during a long-running session appears only after installation', async () => {
  const app = harness();
  await app.manager.check();
  const worker = new Worker();
  worker.state = 'installing';
  app.container.registration.installing = worker;
  app.container.registration.dispatchEvent(new Event('updatefound'));
  assert.equal(app.manager.getState().available, false);
  worker.state = 'installed';
  worker.dispatchEvent(new Event('statechange'));
  assert.equal(app.manager.getState().available, true);
  assert.equal(app.reloads, 0);
});

test('the first installation never prompts or reloads', async () => {
  const container = new Container();
  container.controller = null;
  let reloads = 0;
  const manager = createUpdateManager(container, () => true, () => { reloads++; });
  await manager.check();
  container.activate(new Worker());
  assert.equal(manager.getState().available, false);
  assert.equal(reloads, 0);
});

test('applying waits for pending local writes, activates once, then reloads once', async () => {
  const app = harness();
  const worker = new Worker();
  app.container.registration.waiting = worker;
  await app.manager.check();
  const saving = deferred();
  app.manager.beforeUpdate(() => saving.promise);
  const applied = app.manager.apply();
  await app.manager.apply(); // Repeated taps must not start another update.
  assert.equal(app.manager.getState().phase, 'saving');
  assert.deepEqual(worker.messages, []);
  assert.equal(app.reloads, 0);
  worker.onMessage = () => app.container.activate(worker);
  saving.resolve();
  await applied;
  assert.deepEqual(worker.messages, [{ type: 'ACTIVATE_UPDATE' }]);
  assert.equal(app.reloads, 1);
});

test('a failed save cancels activation and leaves the app open for retry', async () => {
  const app = harness();
  const worker = new Worker();
  app.container.registration.waiting = worker;
  await app.manager.check();
  const remove = app.manager.beforeUpdate(() => { throw new Error('Local write failed'); });
  await app.manager.apply();
  assert.equal(app.reloads, 0);
  assert.deepEqual(worker.messages, []);
  assert.ok(app.manager.getState().error);
  assert.equal(app.manager.getState().phase, 'idle');
  remove();
  worker.onMessage = () => app.container.activate(worker);
  await app.manager.apply();
  assert.equal(app.reloads, 1);
});

test('a fully downloaded update can be applied after the connection is lost', async () => {
  const app = harness();
  const worker = new Worker();
  app.container.registration.waiting = worker;
  await app.manager.check();
  app.offline();
  worker.onMessage = () => app.container.activate(worker);
  await app.manager.apply();
  assert.equal(app.reloads, 1);
});

test('a stalled activation leaves the app open and can be retried after activation completes', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const app = harness();
  const worker = new Worker();
  app.container.registration.waiting = worker;
  await app.manager.check();
  const applying = app.manager.apply();
  context.mock.timers.tick(10000);
  await applying;
  assert.equal(app.reloads, 0);
  assert.equal(app.manager.getState().phase, 'idle');
  assert.ok(app.manager.getState().error);
  app.container.activate(worker);
  assert.equal(app.reloads, 0);
  await app.manager.apply();
  assert.equal(app.reloads, 1);
});

test('an update applied by another window waits for this window to save and request reload', async () => {
  const app = harness();
  await app.manager.check();
  app.container.activate(new Worker());
  assert.equal(app.manager.getState().available, true);
  assert.equal(app.reloads, 0);
  let saved = false;
  app.manager.beforeUpdate(() => { saved = true; });
  await app.manager.apply();
  assert.equal(saved, true);
  assert.equal(app.reloads, 1);
});

test('background update failure does not affect the current lesson', async () => {
  const app = harness();
  app.container.register = async () => { throw new Error('Connection timed out'); };
  await app.manager.check();
  assert.deepEqual(app.manager.getState(), { available: false, phase: 'idle', error: '' });
  assert.equal(app.reloads, 0);
});

test('a lesson resume is scoped to its course/language and consumed once', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  const resume = { schema: 1, pageId: 'page', mode: 'self-paced', audience: 'group', presenting: false,
    blockId: 'block', showAll: false, showPrompt: true, reflected: false, voiceOverride: 'marin_opus' };
  saveLessonResume('course', 'en', resume, storage);
  assert.equal(takeLessonResume('course', 'es', storage), null);
  assert.deepEqual(takeLessonResume('course', 'en', storage), resume);
  assert.equal(takeLessonResume('course', 'en', storage), null);
  assert.throws(() => saveLessonResume('course', 'en', resume, { setItem() { throw new Error('Storage full'); } }), /Storage full/);
});
