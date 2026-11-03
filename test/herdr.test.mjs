import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichPaneTitle, resolveCompletion } from '../src/herdr.mjs';
import { sampleEvent } from '../src/message.mjs';
import { readFile } from 'node:fs/promises';

const env = { HERDR_BIN_PATH: '/path with spaces/herdr', HERDR_SOCKET_PATH: '/tmp/test.sock' };
test('reads explicit pane label with argv; does not replace historical status or agent', async () => {
  const event = sampleEvent();
  delete event.data.title;
  const result = await enrichPaneTitle(event, env, async (bin, args, options) => {
    assert.equal(bin, env.HERDR_BIN_PATH);
    assert.deepEqual(args, ['pane', 'get', 'w1:p2']);
    assert.equal(options.timeout, 1000);
    return { stdout: JSON.stringify({ result: { pane: { pane_id: 'w1:p2', workspace_id: 'w1', label: 'User pane title', agent_status: 'working', agent: 'gemini' } } }) };
  });
  assert.equal(result.data.pane_title, 'User pane title');
  assert.equal(result.data.agent_status, 'done');
  assert.equal(result.data.agent, 'codex');
});

test('falls back to the terminal title when Herdr reports no pane name', async () => {
  const event = sampleEvent();
  delete event.data.title;
  const result = await enrichPaneTitle(event, env, async (bin, args) => {
    assert.deepEqual(args, ['pane', 'get', 'w1:p2']);
    return { stdout: JSON.stringify({ result: { pane: { pane_id: 'w1:p2', workspace_id: 'w1', terminal_title: '\u25d1 Build the API', terminal_title_stripped: 'Build the API' } } }) };
  });
  assert.equal(result.data.pane_title, 'Build the API');
});

test('an explicit pane name still wins over the terminal title', async () => {
  const event = sampleEvent();
  delete event.data.title;
  for (const pane of [
    { pane_id: 'w1:p2', workspace_id: 'w1', label: 'User pane title', terminal_title_stripped: 'Build the API' },
    { pane_id: 'w1:p2', workspace_id: 'w1', title: 'User pane title', terminal_title_stripped: 'Build the API' },
  ]) {
    const result = await enrichPaneTitle(event, env, async () => ({ stdout: JSON.stringify({ result: { pane } }) }));
    assert.equal(result.data.pane_title, 'User pane title');
  }
});

test('retains event title and ignores foreign, failed or unavailable lookups', async () => {
  const event = sampleEvent();
  await enrichPaneTitle(event, env, async () => assert.fail('event already has title'));
  delete event.data.title;
  for (const execute of [
    async () => { throw new Error('timeout'); },
    async () => ({ stdout: 'bad JSON' }),
    async () => ({ stdout: JSON.stringify({ result: { pane: { pane_id: 'w9:p9', workspace_id: 'w9', label: 'Wrong' } } }) }),
  ]) assert.equal(await enrichPaneTitle(event, env, execute), event);
  assert.equal(await enrichPaneTitle(event, {}, async () => assert.fail('no host context')), event);
});

test('converts a focused idle only when the same pane and agent have a verified completion', async () => {
  const event = JSON.parse(await readFile(new URL('../fixtures/idle.json', import.meta.url)));
  const result = await resolveCompletion(event, env, async (bin, args) => {
    assert.deepEqual(args, ['agent', 'get', 'w1:p2']);
    return { stdout: JSON.stringify({ result: { agent: { pane_id: 'w1:p2', workspace_id: 'w1', agent: 'pi', display_agent: 'Pi', agent_status: 'idle', completion_seq: 51, state_change_seq: 51, agent_session: { value: '/private/session.jsonl' } } } }) };
  });
  assert.equal(result.event.data.agent_status, 'done');
  assert.equal(result.event.data.completion_seq, 51);
  assert.equal(result.agent.agent_session.value, '/private/session.jsonl');
});

test('rejects startup idle, missing sequences, stale states and identity mismatches', async () => {
  const event = JSON.parse(await readFile(new URL('../fixtures/idle.json', import.meta.url)));
  const agents = [
    { agent_status: 'idle' },
    { agent_status: 'idle', completion_seq: 0, state_change_seq: 0 },
    { agent_status: 'idle', completion_seq: 51 },
    { agent_status: 'working', completion_seq: 51, state_change_seq: 51 },
    { agent_status: 'idle', agent: 'codex', completion_seq: 51, state_change_seq: 51 },
    { agent_status: 'idle', pane_id: 'w9:p9', completion_seq: 51, state_change_seq: 51 },
    { agent_status: 'idle', workspace_id: 'w9', completion_seq: 51, state_change_seq: 51 },
  ];
  for (const agent of agents) {
    agent.pane_id ??= 'w1:p2'; agent.workspace_id ??= 'w1'; agent.agent ??= 'pi';
    const result = await resolveCompletion(event, env, async () => ({ stdout: JSON.stringify({ result: { agent } }) }));
    assert.match(result.skip, /Not a verified completion/);
  }
  assert.match((await resolveCompletion(event, env, async () => { throw new Error('timeout'); })).skip, /lookup failed/);
  assert.match((await resolveCompletion(event, {})).skip, /no pane\/host/);
});
