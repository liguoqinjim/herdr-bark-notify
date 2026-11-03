import { isObject, UserError } from './config.mjs';
import { agentDefaults } from './agents.mjs';

export const EVENT = 'pane.agent_status_changed';
const text = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() ?? '';
const own = (value, key) => Object.hasOwn(value ?? {}, key) ? value[key] : undefined;
const messages = {
  'zh-CN': { done: ['完成', '任务完成，等待查看。'], blocked: ['需要处理', 'Agent 正在等待你的输入或确认。'], workspace: '未命名工作区', pane: '未命名窗格' },
  en: { done: ['Done', 'Task complete. Ready for your review.'], blocked: ['Needs attention', 'The agent is waiting for your input or approval.'], workspace: 'Unnamed workspace', pane: 'Unnamed pane' },
};

export function parseObject(raw, label) {
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new UserError(`${label}: invalid JSON / JSON 无效`); }
  if (!isObject(value)) throw new UserError(`${label}: expected an object / 必须为对象`);
  return value;
}

export function eventStatus(event, env = {}) {
  // Never infer completion from focused_pane_status: it may belong to another pane.
  // Plugin EventEnvelope uses snake_case; socket subscriptions use dot notation.
  if ((event.event && ![EVENT, 'pane_agent_status_changed'].includes(event.event)) || (env.HERDR_PLUGIN_EVENT && ![EVENT, 'pane_agent_status_changed'].includes(env.HERDR_PLUGIN_EVENT))) return undefined;
  const status = typeof event.data?.agent_status === 'string' ? event.data.agent_status.toLowerCase() : undefined;
  return ['done', 'idle', 'blocked'].includes(status) ? status : undefined;
}

function uuRemoteUrl(remote) {
  if (!remote?.enabled) return undefined;
  if (!remote.anonymous_device_id) return 'uuremote://external';
  // Encode the opaque ID as one query value, including literal +, /, = and &.
  const params = new URLSearchParams({ anonymous_device_id: remote.anonymous_device_id, window_type: remote.window_type });
  if (remote.callback !== undefined) params.set('callback', remote.callback);
  return `uuremote://external/device/control?${params.toString().replace(/\+/g, '%20')}`;
}

export function buildNotification(config, event, context = {}, env = {}, { force = false } = {}) {
  const status = eventStatus(event);
  if (!status) return undefined;
  const data = isObject(event.data) ? event.data : {};
  const paneId = text(data.pane_id, env.HERDR_PANE_ID);
  const workspaceId = text(data.workspace_id, env.HERDR_WORKSPACE_ID);
  // Context describes focus on some host versions. Only use its labels when IDs match.
  const sameWorkspace = Boolean(workspaceId && context.workspace_id === workspaceId);
  const samePane = Boolean(paneId && context.focused_pane_id === paneId);
  const agentId = text(data.agent, data.resolved_agent, samePane && context.focused_pane_agent, 'unknown');
  const defaults = agentDefaults(agentId);
  const agentConfig = own(config.agents, agentId) ?? {};
  const statusConfig = own(config.statuses, status) ?? {};
  const agentStatus = own(agentConfig.statuses, status) ?? {};
  if (!force && (!config.enabled || !(agentStatus.enabled ?? statusConfig.enabled ?? true))) return undefined;
  const locale = messages[config.locale];
  const displayAgent = text(data.resolved_display_agent, data.display_agent);
  const variables = {
    agent: text(agentConfig.name, displayAgent, defaults?.name, agentId === 'unknown' ? 'Agent' : agentId),
    agent_id: agentId,
    display_agent: displayAgent,
    status,
    status_label: locale[status][0],
    emoji: status === 'done' ? '✓' : '⚠',
    message: locale[status][1],
    workspace: text(data.workspace_label, sameWorkspace && context.workspace_label, workspaceId, locale.workspace),
    workspace_id: workspaceId,
    tab: text(data.tab_label, samePane && context.tab_label),
    tab_id: text(data.tab_id, samePane && context.tab_id),
    pane: text(data.title, data.pane_title, paneId, locale.pane),
    pane_id: paneId,
    completion_seq: data.completion_seq,
  };
  const remoteUrl = uuRemoteUrl(config.uuremote);
  const options = {
    title: '{emoji} {agent} · {status_label}',
    subtitle: '{workspace} / {pane}',
    body: '{message}\nAgent: {agent_id}\nPane: {pane_id}',
    group: 'herdr-{agent_id}',
    ...(defaults?.icon ? { icon: defaults.icon } : {}),
    ...(remoteUrl ? { url: remoteUrl } : {}),
    ...config.notification,
    ...statusConfig.notification,
    ...agentConfig.notification,
    ...agentStatus.notification,
  };
  const payload = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === null || value === '') continue;
    // Bark's notification extension reads call and volume as strings.
    payload[key] = key === 'call' || key === 'volume' ? String(value)
      : typeof value === 'string' ? value.replace(/\{([^{}]+)\}/g, (_, name) => variables[name] ?? '') : value;
  }
  if (!payload.body?.trim()) throw new UserError('Rendered notification body is empty / 通知正文不能为空');
  // Leave room for APNs envelope; never truncate a UTF-8 character.
  for (const key of ['title', 'subtitle', 'body', 'group']) {
    if (payload[key]) payload[key] = truncate(payload[key], key === 'body' ? 1600 : 240);
  }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3000) throw new UserError('Notification payload exceeds 3000 bytes / 通知内容过长');
  return { payload, variables };
}

function truncate(value, limit) {
  if (Buffer.byteLength(value, 'utf8') <= limit) return value;
  let result = '';
  let bytes = 0;
  for (const char of value) {
    bytes += Buffer.byteLength(char, 'utf8');
    if (bytes > limit - 3) break;
    result += char;
  }
  return result + '…';
}

export function sampleEvent(status = 'done') {
  return {
    event: EVENT,
    data: { workspace_id: 'w1', workspace_label: 'my-project', pane_id: 'w1:p2', agent: 'codex', display_agent: 'Codex', title: 'Implement Bark notifications', agent_status: status, ...(status === 'done' ? { completion_seq: 1, state_change_seq: 1 } : {}) },
  };
}

export function completionKey(event, agent = {}) {
  if (eventStatus(event) !== 'done') return undefined;
  const data = event.data ?? {};
  const completionSeq = data.completion_seq ?? agent.completion_seq;
  const stateChangeSeq = data.state_change_seq ?? agent.state_change_seq;
  if (!Number.isSafeInteger(completionSeq) || completionSeq <= 0 || completionSeq !== stateChangeSeq) return undefined;
  const paneId = text(data.pane_id, agent.pane_id);
  const session = agent.agent_session?.value;
  const identity = text(typeof session === 'string' ? session : undefined, data.agent, agent.agent, paneId, 'unknown');
  return `${paneId}|${identity}|${completionSeq}`;
}
