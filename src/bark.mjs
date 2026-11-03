import { setTimeout as sleep } from 'node:timers/promises';
import { UserError, requireEndpoint } from './config.mjs';

export async function sendBark(config, payload, options = {}) {
  requireEndpoint(config);
  if (!Array.isArray(config.bark_url)) return sendOne(config, config.bark_url, payload, options);
  let attempts = 0;
  // Continue independent devices when one endpoint is unavailable; never expose its key.
  const results = await Promise.allSettled(config.bark_url.map(url => sendOne(config, url, payload, options)));
  for (const result of results) {
    if (result.status === 'fulfilled') attempts += result.value.attempts;
    else if (result.reason instanceof UserError) throw result.reason;
    else throw new UserError('Unexpected Bark failure / Bark 发送失败');
  }
  return { attempts, endpoints: results.length };
}

async function sendOne(config, barkUrl, payload, { fetchImpl = fetch, sleepImpl = sleep } = {}) {
  const body = JSON.stringify({ ...payload, ...(config.device_key ? { device_key: config.device_key } : {}) });
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout_ms);
    let failure;
    let retry = false;
    try {
      const response = await fetchImpl(barkUrl, {
        method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
        body, signal: controller.signal, redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        failure = `Bark HTTP ${response.status}`;
        retry = response.status === 429 || response.status >= 500;
      } else {
        // Read a bounded body under the same request deadline. Never log the server's body.
        const reader = response.body?.getReader();
        const chunks = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65536) {
              await reader.cancel();
              throw new UserError('Bark response is too large / 服务端响应过长');
            }
            chunks.push(value);
          }
        }
        let result;
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new UserError('Bark returned invalid JSON / 服务端响应不是有效 JSON'); }
        if (result?.code === 200) return { attempts: attempt + 1 };
        failure = 'Bark rejected the notification / Bark 拒绝了通知';
        retry = result?.code === 429 || (Number.isInteger(result?.code) && result.code >= 500);
      }
    } catch (error) {
      if (error instanceof UserError) throw error;
      // Network errors may embed URLs (and keys); emit only our own fixed messages.
      failure = controller.signal.aborted ? 'Bark request timed out / 请求超时' : 'Bark network request failed / 网络请求失败';
      retry = true;
    } finally {
      clearTimeout(timer);
    }
    if (!retry || attempt === config.retries) throw new UserError(failure);
    await sleepImpl(250 * 2 ** attempt);
  }
}
