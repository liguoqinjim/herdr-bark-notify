import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeConfig } from '../src/config.mjs';
import { EVENT, buildNotification, eventStatus, sampleEvent, parseObject } from '../src/message.mjs';

test('renders real Herdr event fields and matched context in both languages', async () => {
  const event = JSON.parse(await readFile(new URL('../fixtures/done.json', import.meta.url)));
  const context = { workspace_id: 'w1', workspace_label: 'backend', focused_pane_id: 'w1:p2', tab_label: 'API' };
  const zh = buildNotification(normalizeConfig({}), event, context).payload;
  assert.deepEqual(zh, {
    title: '✓ Claude Code · 完成', subtitle: 'backend / Implement login API',
    body: '任务完成，等待查看。\nAgent: claude\nPane: w1:p2', group: 'herdr-claude',
    icon: 'https://unpkg.com/@lobehub/icons-static-png@1.97.0/light/claudecode.png',
  });
  const en = buildNotification(normalizeConfig({ locale: 'en' }), sampleEvent('blocked')).payload;
  assert.equal(en.title, '⚠ Codex · Needs attention');
  assert.match(en.body, /waiting for your input/);
});

test('filters non-notifying states and unrelated events before config is needed', () => {
  for (const status of ['working', 'idle', 'unknown', null, 3]) {
    assert.equal(eventStatus(sampleEvent(status)), undefined);
  }
  assert.equal(eventStatus({ ...sampleEvent(), event: 'pane.created' }), undefined);
  assert.equal(eventStatus(sampleEvent(), { HERDR_PLUGIN_EVENT: 'pane.created' }), undefined);
  assert.equal(eventStatus({ data: {} }), undefined);
  assert.equal(eventStatus({ data: { agent_status: 'DONE' } }), 'done');
});

test('Herdr plugin snake_case envelope and dotted environment name both match', () => {
  const event = { event: 'pane_agent_status_changed', data: { type: 'pane_agent_status_changed', agent_status: 'blocked', agent: 'codex', pane_id: 'w1:p2', workspace_id: 'w1' } };
  assert.equal(eventStatus(event, { HERDR_PLUGIN_EVENT: EVENT }), 'blocked');
  assert.equal(buildNotification(normalizeConfig({ locale: 'en' }), event).payload.title, '⚠ Codex · Needs attention');
});

test('different panes of the same agent remain distinguishable; foreign focus is never used', () => {
  const event = { event: EVENT, data: { workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'done' } };
  const other = { workspace_id: 'w9', workspace_label: 'WRONG', focused_pane_id: 'w9:p9', focused_pane_agent: 'WRONG', tab_label: 'WRONG' };
  const { payload } = buildNotification(normalizeConfig({}), event, other);
  assert.equal(payload.title, '✓ Agent · 完成');
  assert.equal(payload.subtitle, 'w1 / w1:p2');
  assert.ok(!JSON.stringify(payload).includes('WRONG'));
  const another = structuredClone(event);
  another.data.pane_id = 'w1:p3';
  assert.notDeepEqual(buildNotification(normalizeConfig({}), another).payload, payload);
});

test('display name wins over built-in names; explicit agent name wins over display', () => {
  const event = sampleEvent();
  event.data.display_agent = 'Codex: auth';
  assert.match(buildNotification(normalizeConfig({}), event).payload.title, /Codex: auth/);
  assert.match(buildNotification(normalizeConfig({ agents: { codex: { name: 'My worker' } } }), event).payload.title, /My worker/);
  event.data.agent = '__proto__';
  event.data.display_agent = null;
  assert.match(buildNotification(normalizeConfig({}), event).payload.title, /__proto__/);
});

test('notification overrides follow global, status, agent, agent-status precedence', () => {
  const config = normalizeConfig({
    notification: { sound: 'default', icon: 'https://example.com/icon.png', group: '{workspace_id}-{agent_id}' },
    statuses: { blocked: { notification: { sound: 'alarm' } } },
    agents: { codex: { notification: { sound: 'bell', icon: null }, statuses: { blocked: { notification: { sound: 'minuet' } } } } },
  });
  const payload = buildNotification(config, sampleEvent('blocked')).payload;
  assert.equal(payload.sound, 'minuet');
  assert.equal(payload.icon, undefined);
  assert.equal(payload.group, 'w1-codex');
});

test('global switch, per-status switch, per-agent override, explicit test bypass', () => {
  assert.equal(buildNotification(normalizeConfig({ enabled: false }), sampleEvent()), undefined);
  assert.equal(buildNotification(normalizeConfig({ statuses: { done: { enabled: false } } }), sampleEvent()), undefined);
  const config = normalizeConfig({ statuses: { done: { enabled: false } }, agents: { codex: { statuses: { done: { enabled: true } } } } });
  assert.ok(buildNotification(config, sampleEvent()));
  assert.ok(buildNotification(normalizeConfig({ enabled: false }), sampleEvent(), {}, {}, { force: true }));
});

test('UU Remote links open the app or connect to the bound device in either window mode', () => {
  const render = uuremote => buildNotification(normalizeConfig({ uuremote }), sampleEvent()).payload;
  assert.equal(render(undefined).url, undefined);
  assert.equal(render({ enabled: false, anonymous_device_id: 'private-device' }).url, undefined);
  assert.equal(render({ enabled: true }).url, 'uuremote://external');
  const id = 'opaque+/=&window_type=9#?% 中文 {agent_id}';
  for (const window_type of [0, 1]) {
    const payload = render({ enabled: true, anonymous_device_id: id, window_type });
    const url = new URL(payload.url);
    assert.equal(url.protocol, 'uuremote:');
    assert.equal(url.host, 'external');
    assert.equal(url.pathname, '/device/control');
    assert.deepEqual([...url.searchParams], [['anonymous_device_id', id], ['window_type', String(window_type)]]);
    assert.equal(url.hash, '');
    assert.ok(!payload.url.includes('+'));
    assert.ok(!Object.hasOwn(payload, 'uuremote'));
  }
});

test('UU Remote preserves explicit empty callbacks and encodes nested callback URLs once', () => {
  const callbacks = ['', 'myapp://controlresult?next=a+b%2Fc&pane={pane_id}#结果'];
  for (const callback of callbacks) {
    for (const window_type of [0, 1]) {
      const config = normalizeConfig({ uuremote: { enabled: true, anonymous_device_id: 'opaque+/=', window_type, callback } });
      const { payload } = buildNotification(config, sampleEvent());
      const url = new URL(payload.url);
      assert.deepEqual([...url.searchParams], [
        ['anonymous_device_id', 'opaque+/='], ['window_type', String(window_type)], ['callback', callback],
      ]);
      if (callback === '') assert.equal(payload.url, `uuremote://external/device/control?anonymous_device_id=opaque%2B%2F%3D&window_type=${window_type}&callback=`);
    }
  }
});

test('explicit notification URLs can override or remove the generated UU Remote link at every layer', () => {
  const layers = [
    notification => ({ notification }),
    notification => ({ statuses: { blocked: { notification } } }),
    notification => ({ agents: { codex: { notification } } }),
    notification => ({ agents: { codex: { statuses: { blocked: { notification } } } } }),
  ];
  for (const wrap of layers) {
    for (const url of ['myapp://pane/{pane_id}', null, '']) {
      const config = normalizeConfig({ uuremote: { enabled: true, anonymous_device_id: 'bound' }, ...wrap({ url }) });
      const payload = buildNotification(config, sampleEvent('blocked')).payload;
      assert.equal(payload.url, url ? 'myapp://pane/w1:p2' : undefined);
    }
  }
  assert.throws(() => buildNotification(normalizeConfig({
    uuremote: { enabled: true, anonymous_device_id: 'a'.repeat(3000) },
  }), sampleEvent()), /3000/);
});

test('call and volume preserve overrides, zero and removal with Bark string encoding', () => {
  const raw = {
    notification: { call: 1, volume: 5 },
    statuses: { blocked: { notification: { level: 'critical', call: '1', volume: 2 } } },
    agents: { codex: { notification: { volume: 2.5 }, statuses: { blocked: { notification: { call: 0, volume: 0 } } } } },
  };
  const render = (config, status) => buildNotification(normalizeConfig(config), sampleEvent(status)).payload;
  const blocked = render(raw, 'blocked');
  assert.equal(blocked.level, 'critical');
  assert.equal(blocked.call, '0');
  assert.equal(blocked.volume, '0');
  const done = render(raw, 'done');
  assert.equal(done.call, '1');
  assert.equal(done.volume, '2.5');
  raw.agents.codex.statuses.blocked.notification = { call: null, volume: null };
  const removed = render(raw, 'blocked');
  assert.ok(!Object.hasOwn(removed, 'call'));
  assert.ok(!Object.hasOwn(removed, 'volume'));
  const defaults = render({}, 'done');
  assert.ok(!Object.hasOwn(defaults, 'call'));
  assert.ok(!Object.hasOwn(defaults, 'volume'));
});

test('templates substitute once, preserve UTF-8, and bound the APNs payload', () => {
  const event = sampleEvent();
  event.data.title = '{agent_id}';
  const config = normalizeConfig({ notification: { body: '你😀'.repeat(1000) } });
  const payload = buildNotification(config, event).payload;
  assert.equal(payload.subtitle, 'my-project / {agent_id}');
  assert.ok(Buffer.byteLength(payload.body) <= 1600);
  assert.ok(payload.body.endsWith('…'));
  assert.ok(!payload.body.includes('\uFFFD'));
  assert.throws(() => buildNotification(normalizeConfig({ notification: { body: '' } }), event), /empty/);
  assert.throws(() => buildNotification(normalizeConfig({ notification: { copy: 'a'.repeat(4000) } }), event), /3000/);
});

test('malformed JSON is rejected without including input in errors', () => {
  for (const raw of ['null', '[]', '3', '"secret"', '{"secret":']) assert.throws(() => parseObject(raw, 'event'), error => !error.message.includes('secret'));
});
