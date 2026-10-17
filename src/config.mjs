import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class UserError extends Error {}
export const VARIABLES = new Set([
  'agent', 'agent_id', 'display_agent', 'status', 'status_label', 'emoji',
  'workspace', 'workspace_id', 'tab', 'tab_id', 'pane', 'pane_id', 'message',
]);
const FIELDS = new Set(['title', 'subtitle', 'body', 'group', 'sound', 'icon', 'url', 'level', 'call', 'volume', 'badge', 'isArchive', 'copy']);
const ROOT = new Set(['bark_url', 'device_key', 'enabled', 'locale', 'statuses', 'notification', 'agents', 'timeout_ms', 'retries', 'uuremote']);
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function object(value, label) {
  if (!isObject(value)) throw new UserError(`${label} must be an object / 必须为对象`);
}
function keys(value, allowed, label) {
  object(value, label);
  // Do not echo user-provided names or values: config may contain credentials.
  if (Object.keys(value).some(key => !allowed.has(key))) throw new UserError(`${label}: unknown option / 存在未知配置项`);
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new UserError(`${label} must be an integer in ${min}..${max}`);
}
function string(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new UserError(`${label} must be a non-empty string / 必须为非空字符串`);
}
export function validateTemplate(value, label) {
  if (typeof value !== 'string') throw new UserError(`${label} must be a string`);
  for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
    if (!VARIABLES.has(match[1])) throw new UserError(`${label}: unknown template variable / 未知模板变量`);
  }
}
function notification(value, label) {
  keys(value, FIELDS, label);
  for (const [key, val] of Object.entries(value)) {
    if (val === null) continue; // Remove an inherited optional field.
    if (key === 'badge') integer(val, 0, 99999, `${label}.badge`);
    else if (key === 'isArchive') integer(val, 0, 1, `${label}.isArchive`);
    else if (key === 'call') {
      if (![0, 1, '0', '1'].includes(val)) throw new UserError(`${label}.call must be 0, 1, "0" or "1" / 必须为 0 或 1`);
    } else if (key === 'volume') {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 10) throw new UserError(`${label}.volume must be a number in 0..10 / 必须为 0 到 10 的数字`);
    } else if (key === 'level') {
      if (!['active', 'passive', 'timeSensitive', 'critical'].includes(val)) throw new UserError(`${label}.level is invalid`);
    } else validateTemplate(val, `${label}.${key}`);
  }
}
function statuses(value, label) {
  keys(value, new Set(['done', 'blocked']), label);
  for (const val of Object.values(value)) {
    keys(val, new Set(['enabled', 'notification']), `${label} entry`);
    if (val.enabled !== undefined && typeof val.enabled !== 'boolean') throw new UserError(`${label}.enabled must be boolean`);
    if (val.notification !== undefined) notification(val.notification, `${label}.notification`);
  }
}

function uuRemote(value) {
  keys(value, new Set(['enabled', 'anonymous_device_id', 'window_type', 'callback']), 'uuremote');
  const remote = { enabled: false, window_type: 0, ...value };
  if (typeof remote.enabled !== 'boolean') throw new UserError('uuremote.enabled must be boolean');
  integer(remote.window_type, 0, 1, 'uuremote.window_type');
  if (remote.anonymous_device_id !== undefined) {
    string(remote.anonymous_device_id, 'uuremote.anonymous_device_id');
    remote.anonymous_device_id = remote.anonymous_device_id.trim();
  }
  if (remote.enabled && remote.window_type === 1 && !remote.anonymous_device_id) {
    throw new UserError('uuremote.window_type=1 requires anonymous_device_id / 画中画需要绑定设备标识');
  }
  if (remote.callback !== undefined) {
    if (typeof remote.callback !== 'string') throw new UserError('uuremote.callback must be a string / 必须为字符串');
    // An explicit empty string preserves callback=; omission leaves it out.
    if (remote.callback !== '') {
      let callback;
      try { callback = new URL(remote.callback); } catch { /* Report a fixed error below. */ }
      if (!callback?.host || callback.username || callback.password || /\s/.test(remote.callback)) {
        throw new UserError('uuremote.callback must be a URL with scheme and host / 回调地址必须包含协议和主机');
      }
      if (remote.enabled && !remote.anonymous_device_id) {
        throw new UserError('uuremote.callback requires anonymous_device_id / 回调需要绑定设备标识');
      }
    }
  }
  return remote;
}

export function normalizeConfig(raw, env = {}) {
  keys(raw, ROOT, 'config');
  const config = { enabled: true, locale: 'zh-CN', timeout_ms: 5000, retries: 1, notification: {}, statuses: {}, agents: {}, ...raw };
  if (typeof config.enabled !== 'boolean') throw new UserError('enabled must be boolean');
  if (!['zh-CN', 'en'].includes(config.locale)) throw new UserError('locale must be zh-CN or en');
  integer(config.timeout_ms, 100, 10000, 'timeout_ms');
  integer(config.retries, 0, 2, 'retries');
  config.uuremote = uuRemote(config.uuremote === undefined ? {} : config.uuremote);
  notification(config.notification, 'notification');
  statuses(config.statuses, 'statuses');
  object(config.agents, 'agents');
  for (const agent of Object.values(config.agents)) {
    keys(agent, new Set(['name', 'notification', 'statuses']), 'agents entry');
    if (agent.name !== undefined) string(agent.name, 'agents.name');
    if (agent.notification !== undefined) notification(agent.notification, 'agents.notification');
    if (agent.statuses !== undefined) statuses(agent.statuses, 'agents.statuses');
  }
  if (env.BARK_URL?.trim()) config.bark_url = env.BARK_URL.trim();
  if (env.BARK_DEVICE_KEY?.trim()) config.device_key = env.BARK_DEVICE_KEY.trim();
  if (config.device_key !== undefined) string(config.device_key, 'device_key');
  if (config.bark_url !== undefined) {
    string(config.bark_url, 'bark_url');
    let url;
    try { url = new URL(config.bark_url); } catch { throw new UserError('bark_url is not a valid URL / 地址无效'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname === '/') {
      throw new UserError('bark_url must be an HTTP(S) push endpoint without userinfo, query or fragment / 请填写推送端点');
    }
    const pushEndpoint = url.pathname.replace(/\/$/, '').endsWith('/push');
    if (pushEndpoint && !config.device_key) throw new UserError('/push requires device_key / 缺少设备密钥');
    if (!pushEndpoint && config.device_key) throw new UserError('device_key requires a /push endpoint');
    config.bark_url = url.href;
  }
  return config;
}

export function requireEndpoint(config) {
  if (!config.bark_url) throw new UserError('Missing bark_url: configure config.json or BARK_URL / 请配置 Bark 地址');
  if (/YOUR_BARK_KEY|REPLACE_ME|你的BarkKey/i.test(config.bark_url) || /YOUR_BARK_KEY|REPLACE_ME/i.test(config.device_key ?? '')) {
    throw new UserError('Replace the example Bark key before sending / 请替换示例密钥');
  }
}

export function configPath(explicitPath, env) {
  return explicitPath ? path.resolve(explicitPath) : env.HERDR_PLUGIN_CONFIG_DIR ? path.join(env.HERDR_PLUGIN_CONFIG_DIR, 'config.json') : undefined;
}

export async function loadConfig(file, env) {
  let raw = {};
  if (file) {
    let content;
    try { content = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT' || !env.BARK_URL?.trim()) throw new UserError('Cannot read config.json; create it in the plugin config directory / 无法读取配置文件');
    }
    if (content !== undefined) {
      try { raw = JSON.parse(content.replace(/^\uFEFF/, '')); }
      catch { throw new UserError('config.json is not valid JSON / 配置不是有效 JSON'); }
    }
  }
  return normalizeConfig(raw, env);
}

export async function initConfig(file, locale = 'zh-CN') {
  if (!file) throw new UserError('init requires --config PATH or HERDR_PLUGIN_CONFIG_DIR');
  if (!['zh-CN', 'en'].includes(locale)) throw new UserError('locale must be zh-CN or en');
  try {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify({ bark_url: 'https://api.day.app/YOUR_BARK_KEY', locale }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new UserError('config.json already exists; it was not overwritten / 配置已存在，未覆盖');
    throw new UserError('Cannot create config.json / 无法创建配置文件');
  }
}
