import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Status events include agent metadata titles, but not user-assigned pane labels.
// Query only the event's pane and retain its original status/agent identity.
export async function enrichPaneTitle(event, env, execImpl = exec) {
  const data = event.data;
  if (data?.title?.trim?.() || data?.pane_title?.trim?.() || typeof data?.pane_id !== 'string' || !data.pane_id || !env.HERDR_BIN_PATH || !env.HERDR_SOCKET_PATH) return event;
  try {
    const { stdout } = await execImpl(env.HERDR_BIN_PATH, ['pane', 'get', data.pane_id], {
      env, timeout: 1000, maxBuffer: 256 * 1024, windowsHide: true,
    });
    const pane = JSON.parse(stdout)?.result?.pane;
    if (pane?.pane_id !== data.pane_id || pane.workspace_id !== data.workspace_id) return event;
    const title = [pane.label, pane.title, pane.terminal_title_stripped, pane.terminal_title].find(value => typeof value === 'string' && value.trim());
    if (title) return { ...event, data: { ...data, pane_title: title } };
  } catch {
    // Closed panes, unavailable servers and older hosts still get ID-based notifications.
  }
  return event;
}

const sameNumber = (a, b) => Number.isSafeInteger(a) && a > 0 && a === b;
const sameText = (a, b) => !a || !b || a === b;
const sameId = (a, b) => !b || a === b;

export async function resolveCompletion(event, env, execImpl = exec) {
  const status = event.data?.agent_status?.toLowerCase();
  if (!['idle', 'done'].includes(status)) return { event };
  if (status === 'done' && Number.isSafeInteger(event.data.completion_seq) && event.data.completion_seq > 0 && event.data.completion_seq === event.data.state_change_seq) return { event };
  const data = event.data;
  if (!data?.pane_id || !env.HERDR_BIN_PATH || !env.HERDR_SOCKET_PATH) return { skip: 'Completion has no pane/host lookup / 完成事件缺少 Pane 或主机查询信息' };
  let agent;
  try {
    const { stdout } = await execImpl(env.HERDR_BIN_PATH, ['agent', 'get', data.pane_id], {
      env, timeout: 1000, maxBuffer: 256 * 1024, windowsHide: true,
    });
    agent = JSON.parse(stdout)?.result?.agent;
  } catch {
    return { skip: 'Completion lookup failed / 完成状态查询失败' };
  }
  if (!agent || !['idle', 'done'].includes(agent.agent_status) || !sameId(agent.pane_id, data.pane_id) || !sameId(agent.workspace_id, data.workspace_id) ||
      !sameText(agent.agent, data.agent) || !sameNumber(agent.completion_seq, agent.state_change_seq)) {
    return { skip: 'Not a verified completion / 不是已确认的完成' };
  }
  return {
    event: { ...event, data: { ...data, agent_status: 'done', resolved_agent: agent.agent, resolved_display_agent: agent.display_agent, pane_title: agent.terminal_title_stripped || agent.terminal_title, completion_seq: agent.completion_seq ?? event.data.completion_seq, state_change_seq: agent.state_change_seq ?? event.data.state_change_seq } },
    agent,
  };
}
