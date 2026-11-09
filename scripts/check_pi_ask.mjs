// Optional event-only self-check; does not connect to Herdr or send notifications.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import herdrAskNotify from '../extensions/herdr-ask-notify.js';

Object.assign(process.env, { HERDR_ENV: '1', HERDR_SOCKET_PATH: 'unused', HERDR_PANE_ID: 'w1:p1' });
const hooks = new Map();
const events = new EventEmitter();
const reports = [];
events.on('herdr:blocked', data => reports.push(data.active));
herdrAskNotify({ events, on: (name, handler) => hooks.set(name, handler) });
const blocked = data => events.emit('rpiv:ask-user:blocked', data);

hooks.get('session_start')({}, { mode: 'rpc' });
blocked({ active: true, toolCallId: 'headless' });
assert.deepEqual(reports, []);

hooks.get('session_start')({}, { mode: 'tui' });
blocked(null);
blocked({ active: 'true' });
blocked({ active: true, toolCallId: {} });
blocked({ active: false, toolCallId: 'unknown' });
assert.deepEqual(reports, []);

blocked({ active: true, toolCallId: 'a' });
blocked({ active: true, toolCallId: 'a' });
blocked({ active: true, toolCallId: 'b' });
blocked({ active: false, toolCallId: 'a' });
blocked({ active: false, toolCallId: 'a' });
assert.deepEqual(reports, [true, true, false]);
hooks.get('session_shutdown')();
blocked({ active: true, toolCallId: 'late' });
assert.deepEqual(reports, [true, true, false, false]);

hooks.get('session_start')({}, { mode: 'tui' });
blocked({ active: true });
blocked({ active: false });
assert.deepEqual(reports.slice(-2), [true, false]);

process.env.HERDR_ENV = '0';
herdrAskNotify({ on: () => assert.fail('Must stay inactive outside Herdr') });
console.log('Pi ask event bridge self-check passed.');
