#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { configPath, initConfig, loadConfig, requireEndpoint, UserError } from './src/config.mjs';
import { eventStatus, parseObject, buildNotification, sampleEvent, completionKey } from './src/message.mjs';
import { sendBark } from './src/bark.mjs';
import { enrichPaneTitle, resolveCompletion } from './src/herdr.mjs';
import { claimCompletion } from './src/dedupe.mjs';
import { isMacActive } from './src/activity.mjs';

const help = `Herdr Bark Notify / Herdr Bark 通知

node notify.mjs [event|init|check|preview|test] [options]
  event             Handle HERDR_PLUGIN_EVENT_JSON (default) / 处理事件
  init              Create config without overwriting / 创建配置，不覆盖已有文件
  check             Validate config, no network / 检查配置，不发请求
  preview           Print notification JSON, no network / 预览，不发请求
  test              Send a clearly labeled test, bypassing enable switches / 发送测试
  --config PATH     Explicit config.json path / 配置文件路径
  --event PATH      Event JSON fixture for event/preview / 事件 JSON 文件
  --status STATUS   done or blocked for preview/test (default: done)
  --locale LOCALE   zh-CN or en for init (default: zh-CN)
  --help            Show help / 帮助

Config defaults to HERDR_PLUGIN_CONFIG_DIR/config.json.
BARK_URL and BARK_DEVICE_KEY override credentials in config.
Preview without a config directory uses built-in defaults and sample data.
`;

function parseArgs(args) {
  const out = { command: 'event' };
  if (args[0] && !args[0].startsWith('--')) out.command = args.shift();
  if (!['event', 'init', 'check', 'preview', 'test'].includes(out.command)) throw new UserError('Unknown command; use --help / 未知命令');
  while (args.length) {
    const key = args.shift();
    if (key === '--help') { out.help = true; continue; }
    if (!['--config', '--event', '--status', '--locale'].includes(key) || !args[0] || args[0].startsWith('--')) throw new UserError('Invalid arguments; use --help / 参数错误');
    if (out[key.slice(2)] !== undefined) throw new UserError('Duplicate option / 重复参数');
    out[key.slice(2)] = args.shift();
  }
  if (out.event && !['event', 'preview'].includes(out.command)) throw new UserError('--event is only supported by event/preview');
  if (out.status && (!['preview', 'test'].includes(out.command) || !['done', 'blocked'].includes(out.status))) throw new UserError('--status requires preview/test and done/blocked');
  if (out.status && out.event) throw new UserError('Use either --status or --event');
  if (out.locale && out.command !== 'init') throw new UserError('--locale is only supported by init');
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(help);
  const env = process.env;
  const file = configPath(options.config, env);
  if (options.command === 'init') {
    await initConfig(file, options.locale);
    return console.log('Created config.json. Replace YOUR_BARK_KEY. / 已创建配置，请替换示例密钥。');
  }
  let event;
  if (options.event) {
    let raw;
    try { raw = await readFile(options.event, 'utf8'); }
    catch { throw new UserError('Cannot read event file / 无法读取事件文件'); }
    event = parseObject(raw, 'event file');
  } else if (options.command === 'event') {
    event = parseObject(env.HERDR_PLUGIN_EVENT_JSON, 'HERDR_PLUGIN_EVENT_JSON');
  } else event = sampleEvent(options.status);

  if (options.command === 'event' && !eventStatus(event, env)) return;
  let completion;
  let key;
  if (options.command === 'event') {
    const resolved = await resolveCompletion(event, env);
    if (resolved.skip) return console.log(`Skipped: ${resolved.skip}.`);
    event = resolved.event;
    completion = resolved.agent;
    key = completionKey(event, completion);
    if (event.data?.agent_status?.toLowerCase() === 'done' && !key) {
      return console.log('Skipped: completion has no reliable sequence. / 完成事件缺少可靠序号，已跳过。');
    }
  }
  const config = await loadConfig(file, env);
  if (options.command === 'check') {
    requireEndpoint(config);
    console.log(`Configuration valid; locale=${config.locale}; enabled=${config.enabled}. / 配置有效（未测试网络）。`);
    return;
  }
  const context = options.command === 'event' ? parseObject(env.HERDR_PLUGIN_CONTEXT_JSON, 'HERDR_PLUGIN_CONTEXT_JSON') : {};
  if (options.command === 'event' && config.enabled) event = await enrichPaneTitle(event, env);
  const notification = buildNotification(config, event, context, env, { force: options.command === 'test' });
  if (!notification) {
    if (options.command === 'preview') console.log('Skipped: event/status disabled or unsupported. / 事件不支持或已关闭。');
    return;
  }
  if (options.command === 'preview') return console.log(JSON.stringify(notification.payload, null, 2));
  if (options.command === 'event' && await isMacActive(config.suppress_when_mac_active_seconds)) {
    return console.log('Skipped: Mac recently active. / Mac 最近有键鼠操作，已跳过本次 Bark 通知。');
  }
  if (key && !await claimCompletion(env, key)) return console.log('Skipped: duplicate completion. / 重复完成事件，已跳过。');
  if (options.command === 'test') notification.payload.title = `[TEST / 测试] ${notification.payload.title ?? 'Herdr Bark'}`;
  const result = await sendBark(config, notification.payload);
  console.log(`Bark notification sent (${notification.variables.status}; attempts=${result.attempts}). / Bark 通知已发送。`);
  if (key) console.log(`Completion sequence: ${event.data.completion_seq}.`);
}

main().catch(error => {
  console.error(error instanceof UserError ? error.message : 'Unexpected plugin failure / 插件运行失败');
  process.exitCode = 1;
});
