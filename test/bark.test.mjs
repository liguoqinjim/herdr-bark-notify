import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { sendBark } from '../src/bark.mjs';
import { normalizeConfig } from '../src/config.mjs';

async function server(t, handler) {
  const instance = createServer(handler);
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return `http://127.0.0.1:${instance.address().port}`;
}

test('posts UTF-8 JSON, optional device_key and requires Bark application success', async t => {
  const endpoint = await server(t, async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/push');
    assert.match(req.headers['content-type'], /application\/json/);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { title: '✓ 完成', body: '测试 😀', device_key: 'private' });
    res.end('{"code":200,"message":"success"}');
  });
  const result = await sendBark(normalizeConfig({ bark_url: `${endpoint}/push`, device_key: 'private' }), { title: '✓ 完成', body: '测试 😀' });
  assert.equal(result.attempts, 1);
});

test('retries 503 and application-level 500, stops on success', async t => {
  let count = 0;
  const endpoint = await server(t, (req, res) => {
    count++;
    if (count === 1) { res.writeHead(503); res.end('private'); }
    else res.end(JSON.stringify({ code: count === 2 ? 500 : 200 }));
  });
  const waits = [];
  const result = await sendBark(normalizeConfig({ bark_url: `${endpoint}/key`, retries: 2 }), { body: 'test' }, { sleepImpl: async ms => waits.push(ms) });
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [250, 500]);
});

test('does not retry permanent errors or trust HTTP 200 alone, and hides server body', async t => {
  for (const [status, body] of [[400, 'secret'], [200, '{"code":400,"message":"secret"}'], [200, 'secret'], [200, '{}']]) {
    let count = 0;
    const endpoint = await server(t, (req, res) => { count++; res.writeHead(status); res.end(body); });
    await assert.rejects(sendBark(normalizeConfig({ bark_url: `${endpoint}/key`, retries: 2 }), { body: 'test' }), error => !error.message.includes('secret'));
    assert.equal(count, 1);
  }
});

test('timeout covers stalled headers and stalled response body', async t => {
  for (const sendHeaders of [false, true]) {
    const endpoint = await server(t, (req, res) => { if (sendHeaders) { res.writeHead(200); res.write('{'); } });
    await assert.rejects(sendBark(normalizeConfig({ bark_url: `${endpoint}/key`, timeout_ms: 100, retries: 0 }), { body: 'test' }), /timed out/);
  }
});

test('redirects never transmit the notification to another endpoint', async t => {
  let leaked = false;
  const target = await server(t, (req, res) => { leaked = true; res.end('{"code":200}'); });
  const origin = await server(t, (req, res) => { res.writeHead(307, { location: `${target}/private` }); res.end(); });
  await assert.rejects(sendBark(normalizeConfig({ bark_url: `${origin}/key`, retries: 0 }), { body: 'private' }), /network/);
  assert.equal(leaked, false);
});

test('bounds response size and retries transient network failures without logging keys', async t => {
  const endpoint = await server(t, (req, res) => res.end('x'.repeat(70000)));
  await assert.rejects(sendBark(normalizeConfig({ bark_url: `${endpoint}/key` }), { body: 'test' }), /too large/);
  let count = 0;
  await assert.rejects(sendBark(normalizeConfig({ bark_url: 'https://api.day.app/private', retries: 1 }), { body: 'test' }, {
    fetchImpl: async () => { count++; throw new Error('https://api.day.app/private'); }, sleepImpl: async () => {},
  }), error => !error.message.includes('private'));
  assert.equal(count, 2);
});

test('sends distinct device keys once each and preserves the shared payload', async () => {
  const requests = [];
  const result = await sendBark(normalizeConfig({ bark_url: ['https://api.day.app/one', 'https://api.day.app/two', 'https://api.day.app/one'] }), { body: 'done' }, {
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response('{"code":200}');
    },
  });
  assert.deepEqual(requests, [
    { url: 'https://api.day.app/one', body: { body: 'done' } },
    { url: 'https://api.day.app/two', body: { body: 'done' } },
  ]);
  assert.deepEqual(result, { attempts: 2, endpoints: 2 });
});

test('tries every configured endpoint before reporting a safe failure', async () => {
  const urls = [];
  await assert.rejects(sendBark(normalizeConfig({ bark_url: ['https://api.day.app/private', 'https://api.day.app/two'], retries: 0 }), { body: 'done' }, {
    fetchImpl: async url => { urls.push(url); if (url.includes('private')) throw new Error(url); return new Response('{"code":200}'); },
  }), error => !error.message.includes('private'));
  assert.deepEqual(urls, ['https://api.day.app/private', 'https://api.day.app/two']);
});
