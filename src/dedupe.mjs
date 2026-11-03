import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const validKey = key => typeof key === 'string' && key.length > 0 && key.length <= 4096 && !key.includes('\u0000');

export async function claimCompletion(env, key) {
  if (!env.HERDR_PLUGIN_STATE_DIR) return true;
  if (!validKey(key)) return false;
  const file = path.join(env.HERDR_PLUGIN_STATE_DIR, 'completions.json');
  const lock = `${file}.lock`;
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle;
  let locked = false;
  try {
    await mkdir(env.HERDR_PLUGIN_STATE_DIR, { recursive: true });
    const deadline = Date.now() + 1000;
    while (!locked) {
      try {
        handle = await open(lock, 'wx', 0o600);
        locked = true;
      } catch (error) {
        if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
        // A crashed hook must not block every later completion.
        const info = await stat(lock).catch(() => undefined);
        if (info && Date.now() - info.mtimeMs > 30000) await rm(lock, { force: true });
        await sleep(10);
      }
    }
    await handle.close();
    handle = undefined;
    const raw = await readFile(file, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '{"keys":[]}';
      throw error;
    });
    const previous = JSON.parse(raw);
    if (!Array.isArray(previous.keys) || previous.keys.includes(key)) return false;
    const keys = [...previous.keys.filter(validKey), key].slice(-1000);
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ version: 1, keys }));
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    return true;
  } catch {
    console.warn('Completion state unavailable; notification skipped. / 完成状态不可用，已跳过通知。');
    return false;
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    if (locked) await rm(lock, { force: true }).catch(() => {});
  }
}
