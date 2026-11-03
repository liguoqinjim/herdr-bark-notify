import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeConfig, requireEndpoint, loadConfig, initConfig } from '../src/config.mjs';

test('minimal config gets usable defaults and environment takes precedence', () => {
  const config = normalizeConfig({ bark_url: 'https://api.day.app/old', locale: 'en' }, { BARK_URL: 'https://api.day.app/new' });
  assert.equal(config.bark_url, 'https://api.day.app/new');
  assert.equal(config.enabled, true);
  assert.equal(config.timeout_ms, 5000);
  assert.equal(config.retries, 1);
  assert.equal(config.locale, 'en');
});

test('supports JSON /push and a self-hosted reverse-proxy prefix', () => {
  assert.doesNotThrow(() => normalizeConfig({ bark_url: 'https://bark.example/proxy/push', device_key: 'key' }));
  assert.doesNotThrow(() => normalizeConfig({ bark_url: 'http://127.0.0.1:8888/key' }));
  assert.throws(() => normalizeConfig({ bark_url: 'https://api.day.app/push' }), /device_key/);
  assert.throws(() => normalizeConfig({ bark_url: 'https://api.day.app/key', device_key: 'key' }), /\/push/);
});

test('accepts multiple key-in-path endpoints and deduplicates identical devices', () => {
  const config = normalizeConfig({ bark_url: ['https://api.day.app/one', 'https://api.day.app/two', 'https://api.day.app/one'] });
  assert.deepEqual(config.bark_url, ['https://api.day.app/one', 'https://api.day.app/two']);
  for (const bark_url of [[], ['https://api.day.app/push'], ['https://api.day.app/key', 3], ['https://api.day.app/key', 'file:///secret']]) {
    assert.throws(() => normalizeConfig({ bark_url }));
  }
  assert.throws(() => normalizeConfig({ bark_url: ['https://api.day.app/one'], device_key: 'secret' }));
});

test('UU Remote is opt-in and validates device IDs and window modes without exposing values', () => {
  assert.deepEqual(normalizeConfig({}).uuremote, { enabled: false, window_type: 0 });
  assert.deepEqual(normalizeConfig({ uuremote: { enabled: true } }).uuremote, { enabled: true, window_type: 0 });
  const uuremote = { enabled: true, anonymous_device_id: '  opaque+/=  ', window_type: 1 };
  assert.deepEqual(normalizeConfig({ uuremote }).uuremote, { ...uuremote, anonymous_device_id: 'opaque+/=' });
  assert.equal(uuremote.anonymous_device_id, '  opaque+/=  ');
  for (const invalid of [null, [], true, { enabled: 'true' }, { PRIVATE_ID: 'secret' },
    { anonymous_device_id: '' }, { anonymous_device_id: ' ' }, { anonymous_device_id: null },
    { anonymous_device_id: 123 }, { window_type: '1' }, { window_type: true },
    { window_type: -1 }, { window_type: 2 }, { window_type: 0.5 },
    { enabled: true, window_type: 1 }]) {
    assert.throws(() => normalizeConfig({ uuremote: invalid }), error => /uuremote/.test(error.message) && !/PRIVATE_ID|secret/.test(error.message));
  }
});

test('UU Remote accepts optional callbacks and rejects malformed URLs without exposing values', () => {
  const remote = { enabled: true, anonymous_device_id: 'bound' };
  for (const callback of ['', 'myapp://controlresult', 'https://example.com/result?key=PRIVATE_CALLBACK#result']) {
    assert.equal(normalizeConfig({ uuremote: { ...remote, callback } }).uuremote.callback, callback);
  }
  for (const callback of [null, false, 1, [], {}, ' ', 'PRIVATE_CALLBACK', '/PRIVATE_CALLBACK',
    'myapp:PRIVATE_CALLBACK', 'https://user:PRIVATE_CALLBACK@example.com', 'myapp://control\nresult']) {
    assert.throws(() => normalizeConfig({ uuremote: { ...remote, callback } }),
      error => /uuremote.callback/.test(error.message) && !error.message.includes('PRIVATE_CALLBACK'));
  }
  assert.throws(() => normalizeConfig({ uuremote: { enabled: true, callback: 'myapp://controlresult' } }), /anonymous_device_id/);
});

test('validates call and volume at every notification configuration layer', () => {
  const layers = [
    notification => ({ notification }),
    notification => ({ statuses: { blocked: { notification } } }),
    notification => ({ agents: { codex: { notification } } }),
    notification => ({ agents: { codex: { statuses: { blocked: { notification } } } } }),
  ];
  for (const wrap of layers) {
    for (const call of [0, 1, '0', '1', null]) assert.doesNotThrow(() => normalizeConfig(wrap({ call })));
    for (const volume of [0, 2, 2.5, 5, 10, null]) assert.doesNotThrow(() => normalizeConfig(wrap({ volume })));
    for (const call of [true, false, 2, -1, 0.5, '', 'true', '{agent_id}', [], {}]) {
      assert.throws(() => normalizeConfig(wrap({ call })), /\.call/);
    }
    for (const volume of [-1, 11, '2', '', true, false, NaN, Infinity, [], {}]) {
      assert.throws(() => normalizeConfig(wrap({ volume })), /\.volume/);
    }
  }
});

test('rejects malformed settings, dangerous URL shapes and misspelled template variables', () => {
  for (const raw of [null, [], { locale: 'fr' }, { enabled: 'false' }, { retries: -1 }, { timeout_ms: 30000 },
    { secretTypo: 'secret' }, { statuses: { working: {} } }, { statuses: { done: { enabled: 0 } } },
    { notification: { body: '{unknowable}' } }, { notification: { badge: -1 } },
    { notification: { isArchive: 2 } }, { notification: { level: 'urgent' } },
    { agents: { codex: { name: '' } } }, { notification: { token: 'secret' } },
    ...['file:///secret', 'https://user:secret@api.day.app/key', 'https://api.day.app/key?q=secret', 'https://api.day.app/key#secret', 'https://api.day.app/'].map(bark_url => ({ bark_url }))]) {
    assert.throws(() => normalizeConfig(raw));
  }
  assert.throws(() => requireEndpoint(normalizeConfig({})), /Missing bark_url/);
  assert.throws(() => requireEndpoint(normalizeConfig({ bark_url: 'https://api.day.app/YOUR_BARK_KEY' })), /example/);
});

test('init uses private file permissions, accepts BOM and never overwrites credentials', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'nested', 'config.json');
  await initConfig(file, 'en');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).locale, 'en');
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  await assert.rejects(initConfig(file), /not overwritten/);
  await writeFile(file, '\uFEFF{"bark_url":"https://api.day.app/private"}');
  assert.equal((await loadConfig(file, {})).bark_url, 'https://api.day.app/private');
  await writeFile(file, '{"key":"VERY_PRIVATE",');
  await assert.rejects(loadConfig(file, {}), error => !error.message.includes('VERY_PRIVATE') && /valid JSON/.test(error.message));
});

test('environment-only setup tolerates a missing file but not invalid JSON', async () => {
  assert.equal((await loadConfig('/nonexistent-herdr-bark/config.json', { BARK_URL: 'https://api.day.app/key' })).bark_url, 'https://api.day.app/key');
  await assert.rejects(loadConfig('/nonexistent-herdr-bark/config.json', {}), /Cannot read/);
});
