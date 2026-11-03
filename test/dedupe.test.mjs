import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { claimCompletion } from '../src/dedupe.mjs';

test('persists completion keys and accepts a later completion', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-dedupe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { HERDR_PLUGIN_STATE_DIR: dir };
  assert.equal(await claimCompletion(env, 'pane|51'), true);
  assert.equal(await claimCompletion(env, 'pane|51'), false);
  assert.equal(await claimCompletion(env, 'pane|52'), true);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'completions.json'), 'utf8')).keys, ['pane|51', 'pane|52']);
});

test('concurrent hooks claim one completion', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-dedupe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { HERDR_PLUGIN_STATE_DIR: dir };
  const claims = await Promise.all(Array.from({ length: 20 }, () => claimCompletion(env, 'pane|51')));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await claimCompletion(env, 'pane|52'), true);
});

test('corrupt or unwritable state skips the send rather than duplicating an uncertain completion', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bark-dedupe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'completions.json'), 'not JSON');
  assert.equal(await claimCompletion({ HERDR_PLUGIN_STATE_DIR: dir }, 'pane|51'), false);
  assert.equal(await claimCompletion({}, 'pane|51'), true);
});
