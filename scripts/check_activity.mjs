// Optional self-check with simulated idle readings; no hardware or network access.
import assert from 'node:assert/strict';
import { isMacActive } from '../src/activity.mjs';
import { normalizeConfig } from '../src/config.mjs';

assert.equal(normalizeConfig({}).suppress_when_mac_active_seconds, 0);
assert.equal(normalizeConfig({ suppress_when_mac_active_seconds: 120 }).suppress_when_mac_active_seconds, 120);
for (const value of [-1, 86401, 1.5, '120', true, null]) {
  assert.throws(() => normalizeConfig({ suppress_when_mac_active_seconds: value }));
}
const unexpected = () => assert.fail('Disabled/non-Mac detection must not execute ioreg');
assert.equal(await isMacActive(0, 'darwin', unexpected), false);
assert.equal(await isMacActive(120, 'linux', unexpected), false);
assert.equal(await isMacActive(120, 'win32', unexpected), false);
for (const [idle, active] of [['0', true], ['119999999999', true], ['120000000000', false], ['9999999999999999999', false]]) {
  assert.equal(await isMacActive(120, 'darwin', async (bin, args, options) => {
    assert.equal(bin, '/usr/sbin/ioreg');
    assert.deepEqual(args, ['-r', '-c', 'IOHIDSystem', '-d', '1']);
    assert.equal(options.timeout, 1000);
    return { stdout: `  "HIDIdleTime" = ${idle}\n` };
  }), active);
}
assert.equal(await isMacActive(120, 'darwin', async () => ({ stdout: 'no idle reading' })), false);
assert.equal(await isMacActive(120, 'darwin', async () => { throw new Error('unavailable'); }), false);
console.log('Mac activity self-check passed.');
