import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function isMacActive(seconds, platform = process.platform, execImpl = exec) {
  if (!seconds || platform !== 'darwin') return false;
  try {
    const { stdout } = await execImpl('/usr/sbin/ioreg', ['-r', '-c', 'IOHIDSystem', '-d', '1'], {
      timeout: 1000, maxBuffer: 256 * 1024,
    });
    const match = /"HIDIdleTime"\s*=\s*(\d+)\b/.exec(stdout);
    if (match) return BigInt(match[1]) < BigInt(seconds) * 1_000_000_000n;
  } catch {
    // Unknown activity must not suppress a notification.
  }
  console.warn('Mac activity unavailable; sending normally. / 无法判断 Mac 活跃状态，照常通知。');
  return false;
}
