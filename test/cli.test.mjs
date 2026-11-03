import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { sampleEvent } from '../src/message.mjs';

const exec = promisify(execFile);
const entry = fileURLToPath(new URL('../notify.mjs', import.meta.url));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('HERDR_') && !key.startsWith('BARK_')));
const run = (args = [], env = {}) => exec(process.execPath, [entry, ...args], { env: { ...cleanEnv, ...env }, timeout: 10000 });

test('CLI preview needs no credentials; check requires endpoint; idle needs no config', async () => {
  assert.equal(JSON.parse((await run(['preview'])).stdout).title, '✓ Codex · 完成');
  await assert.rejects(run(['check']), /Missing bark_url/);
  assert.equal((await run([], { HERDR_PLUGIN_EVENT_JSON: JSON.stringify(sampleEvent('working')), HERDR_PLUGIN_CONFIG_DIR: '/nonexistent' })).stdout, '');
  await assert.rejects(run(['test', '--status', 'idle']), /done\/blocked/);
  await assert.rejects(run(['test', '--event', 'file']), /event\/preview/);
});

test('CLI initializes once, validates without sending and previews explicit fixtures', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  await run(['init', '--config', file, '--locale', 'en']);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).locale, 'en');
  await assert.rejects(run(['init', '--config', file]), /not overwritten/);
  await writeFile(file, JSON.stringify({ bark_url: 'https://api.day.app/private', locale: 'en', notification: { call: '1', volume: 2 }, uuremote: { enabled: true, anonymous_device_id: 'opaque+/=', window_type: 1, callback: 'myapp://controlresult?key=PRIVATE_CALLBACK' } }));
  const check = await run(['check', '--config', file]);
  assert.match(check.stdout, /Configuration valid/);
  assert.ok(!check.stdout.includes('private'));
  assert.ok(!check.stdout.includes('opaque'));
  assert.ok(!check.stdout.includes('PRIVATE_CALLBACK'));
  const fixture = fileURLToPath(new URL('../fixtures/blocked.json', import.meta.url));
  const preview = await run(['preview', '--config', file, '--event', fixture]);
  assert.equal(JSON.parse(preview.stdout).subtitle, 'w2 / Fix database migration');
  assert.equal(JSON.parse(preview.stdout).call, '1');
  assert.equal(JSON.parse(preview.stdout).volume, '2');
  assert.equal(JSON.parse(preview.stdout).url, 'uuremote://external/device/control?anonymous_device_id=opaque%2B%2F%3D&window_type=1&callback=myapp%3A%2F%2Fcontrolresult%3Fkey%3DPRIVATE_CALLBACK');
});

test('event entrypoint posts to a local Bark mock with real env contract; tests bypass switches', async t => {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks)));
    res.end('{"code":200}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-event-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = {
    bark_url: `http://127.0.0.1:${server.address().port}/key`,
    uuremote: { enabled: true, anonymous_device_id: 'opaque+/=', callback: '' },
    statuses: { blocked: { notification: { level: 'critical', call: 1, sound: 'alarm', volume: 2 } } },
  };
  const file = path.join(dir, 'config.json');
  await writeFile(file, JSON.stringify(config));
  const event = sampleEvent();
  delete event.data.workspace_label;
  const env = { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_PLUGIN_EVENT: event.event, HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event), HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_id: 'w1', workspace_label: 'Real project', focused_pane_id: 'w1:p2' }) };
  const result = await run([], env);
  assert.match(result.stdout, /notification sent/);
  assert.match(received[0].subtitle, /Real project/);
  assert.ok(!Object.hasOwn(received[0], 'call'));
  assert.ok(!Object.hasOwn(received[0], 'volume'));
  assert.equal(received[0].url, 'uuremote://external/device/control?anonymous_device_id=opaque%2B%2F%3D&window_type=0&callback=');
  await writeFile(file, JSON.stringify({ ...config, enabled: false }));
  await run([], env);
  assert.equal(received.length, 1);
  await run(['test', '--status', 'blocked'], env);
  assert.equal(received.length, 2);
  assert.match(received[1].title, /^\[TEST \/ 测试\]/);
  assert.match(received[1].title, /需要处理/);
  assert.equal(received[1].level, 'critical');
  assert.equal(received[1].call, '1');
  assert.equal(received[1].sound, 'alarm');
  assert.equal(received[1].volume, '2');
  assert.equal(received[1].url, received[0].url);
});

test('focused idle sends once after agent lookup; later rounds and pane/session changes remain distinct', async t => {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks)));
    res.end('{"code":200}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-idle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'herdr fake');
  const agentFile = path.join(dir, 'agent.json');
  const agent = { pane_id: 'w1:p2', workspace_id: 'w1', agent: 'pi', display_agent: 'Pi', agent_status: 'idle', completion_seq: 51, state_change_seq: 51, agent_session: { value: '/sessions/one.jsonl' } };
  await writeFile(agentFile, JSON.stringify(agent));
  await writeFile(bin, `#!/usr/bin/env node\nimport { readFileSync, appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(path.join(dir, 'calls'))}, process.argv.slice(2).join(' ') + '\\n');\nconst agent = JSON.parse(readFileSync(${JSON.stringify(agentFile)}, 'utf8'));\nconsole.log(JSON.stringify({ result: process.argv[2] === 'agent' ? { agent } : { pane: { ...agent, label: 'Focused Pi' } } }));`);
  await chmod(bin, 0o755);
  const event = JSON.parse(await readFile(new URL('../fixtures/idle.json', import.meta.url)));
  delete event.data.title;
  const env = { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_PLUGIN_STATE_DIR: path.join(dir, 'state'), HERDR_PLUGIN_EVENT: event.event, HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event), HERDR_PLUGIN_CONTEXT_JSON: '{}', HERDR_BIN_PATH: bin, HERDR_SOCKET_PATH: path.join(dir, 'herdr.sock') };
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ bark_url: `http://127.0.0.1:${server.address().port}/key` }));
  assert.match((await run([], env)).stdout, /sent \(done/);
  assert.match((await run([], env)).stdout, /duplicate/);
  agent.completion_seq = agent.state_change_seq = 52;
  await writeFile(agentFile, JSON.stringify(agent));
  await run([], env);
  agent.agent_session.value = '/sessions/two.jsonl';
  agent.completion_seq = agent.state_change_seq = 52;
  await writeFile(agentFile, JSON.stringify(agent));
  await run([], env);
  event.data.pane_id = 'w1:p3';
  agent.pane_id = 'w1:p3';
  await writeFile(agentFile, JSON.stringify(agent));
  await run([], { ...env, HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event) });
  agent.completion_seq = null;
  await writeFile(agentFile, JSON.stringify(agent));
  assert.match((await run([], { ...env, HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event) })).stdout, /Not a verified/);
  assert.equal(received.length, 4);
  assert.match(received[0].subtitle, /Focused Pi/);
});
