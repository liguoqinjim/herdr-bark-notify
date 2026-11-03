# Validation / 验证记录

## Environment / 环境

- Date / 日期：2026-09-13 (Asia/Shanghai).
- macOS, Node.js `v24.20.0`, Herdr `0.9.0`, protocol `22`.
- No runtime npm dependencies / 无运行时 npm 依赖。

## Automated checks / 自动化检查

```sh
npm run check
npm test
```

30 tests pass. Coverage includes real HTTP requests to local mock servers and child-process execution of the plugin, not just mocked function calls.

30 项测试通过。包含向本地模拟服务发起真实 HTTP 请求，以及通过子进程运行插件入口，覆盖：

- Configuration defaults, type validation, secret-safe errors, environment overrides, `/push` and key-in-path endpoints.
- 配置默认值、类型校验、错误脱敏、环境变量覆盖、两种 Bark 端点。
- Chinese/English notifications, custom names, status filters, override precedence, independent panes, and foreign-focus protection.
- 中英文文案、自定义名称、状态过滤、覆盖顺序、不同 Pane 区分、焦点不一致处理。
- Herdr's snake_case plugin event JSON and dotted subscription/environment names.
- Herdr 插件 JSON 中的下划线事件名，以及订阅/环境变量中的点号事件名。
- User-assigned pane label lookup through an explicit ID; original event status and agent remain authoritative.
- 按明确 ID 查询手动 Pane 标签，仍以原事件的 Agent 和状态为准。
- UTF-8 payload limits, template substitution, HTTP and Bark application-level errors, retries, deadlines covering response bodies, and redirect refusal.
- UTF-8 长度限制、模板替换、HTTP 与 Bark 业务错误、重试、覆盖响应正文的超时、拒绝重定向。
- Config initialization without overwriting, command-line preview/check/test, and automatic event delivery.
- 配置初始化且不覆盖已有文件、预览/检查/测试命令、自动事件发送。

## Real Herdr integration / 真实 Herdr 集成

```sh
python3 scripts/verify_herdr.py
```

The smoke test passed against the installed Herdr 0.9.0 binary. It uses fresh `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `HERDR_CONFIG_PATH`, and `HERDR_SOCKET_PATH` values, an isolated headless server, and a loopback-only HTTP mock.

本机 Herdr 0.9.0 集成测试通过。通过临时配置与状态目录、单独 API socket、隔离的无界面服务和仅监听本机的 HTTP 模拟服务进行验证，没有修改日常 Herdr 插件注册，也没有向真实 Bark 服务推送。

Verified / 已验证：

1. Herdr accepts `herdr-plugin.toml`, links the checkout, lists the plugin and all four actions.
   Herdr 接受清单、本地加载成功，并列出插件和四个动作。
2. `check` and `preview` actions finish with exit code `0` and make no push requests.
   检查和预览动作以 `0` 退出，不发推送请求。
3. Both test actions send correctly labeled requests to the local mock.
   两个测试动作向本地模拟服务发送带测试标识的请求。
4. A background test pane reports `working → blocked → working → idle` through the real socket API. Herdr generates `blocked` and unseen `done` notifications; working events exit without sending.
   后台测试 Pane 通过真实 socket API 上报状态；Herdr 产生待处理及未查看的完成事件，工作中事件不发送通知。
5. Both automatic notifications contain the expected Agent, workspace label, and manually assigned pane label.
   两类自动通知都含有正确 Agent、工作区名称和手动设置的 Pane 标签。
6. Plugin logs report success. The test server and temporary files are cleaned up.
   插件日志显示成功，测试服务和临时文件已清理。

## Limits / 验证边界

- The initial implementation was tested only with a local mock. Subsequent authorized device tests used the existing user configuration; avatar results are recorded below.
- 初始实现仅使用本地模拟服务测试。后续经授权使用用户已有配置进行了真机对照，头像结果见下文。
- The Herdr smoke test reports synthetic agent states through the official API; it does not launch Claude Code, Codex, or Gemini to test their own terminal detection/integrations.
- Herdr 集成测试通过官方 API 模拟上报 Agent 状态，没有启动真实 Claude Code、Codex 或 Gemini 来验证各自的终端检测/集成。
- Linux, Windows and Node 22 are covered by the committed CI matrix, but no remote CI result is claimed here. The optional Python smoke test uses Unix sockets and is for macOS/Linux only.
- 已编写 Linux、Windows、Node 22 的 CI 矩阵，本记录不声称远端 CI 已运行。可选 Python 集成脚本使用 Unix socket，仅适用于 macOS/Linux。
- The isolated smoke test did not change the normal Herdr profile. During later avatar diagnosis, the user’s normal profile was confirmed to link this local checkout. No repository was published or pushed to GitHub.
- 隔离集成测试没有修改日常 Herdr 配置；后续头像排查确认用户的日常配置已链接本地源码。没有发布或推送 GitHub 仓库。

## Version 1.1.0 avatars / 1.1.0 头像

Default avatars use LobeHub's 640×640 PNG logos. All 19 mapped CDN URLs returned HTTP 200 with valid PNG signatures and 640×640 dimensions. Three regression tests cover inventory coverage, aliases and override/disable behavior. See [AVATARS.md](AVATARS.md).

默认头像使用 LobeHub 的 640×640 PNG 品牌图标。19 个 CDN 地址全部返回 HTTP 200，且文件签名和尺寸正确。三项回归测试验证覆盖清单、别名、覆盖和关闭行为；详见 [AVATARS.md](AVATARS.md)。

Authorized device comparisons on 2026-09-13, with user-reported iOS 27 and Bark 1.6.3:

2026-09-13 经授权发送对照通知，用户报告系统为 iOS 27、Bark 1.6.3：

| Test / 测试 | Image / 图片 | User-observed avatar / 用户观察到的头像 |
| --- | --- | --- |
| A | Bark official example JPEG, `day.app` | Displayed / 已显示 |
| B | Codex WebP, Avatar 1.14.0, UNPKG | Not displayed / 未显示 |
| C | Codex PNG, PNG 1.97.0, UNPKG | Displayed / 已显示 |
| D | Same Codex WebP as B, jsDelivr | Not displayed / 未显示 |

All four requests were accepted by the configured Bark backend. The results support changing defaults to PNG; they do not identify the exact internal iOS/Bark failure or verify display for all 19 images. The tests did not change the user's saved configuration.

四次请求均被配置中的 Bark 后端接受。结果支持将默认图片改为 PNG，但没有定位 iOS/Bark 内部具体失败点，也不代表 19 张图片均通过真机显示验证。测试没有修改用户保存的配置。

## Version 1.2.0 call and volume / 1.2.0 重复响铃与音量

Configuration tests cover valid values, invalid types and ranges, and all four notification override locations. Rendering tests verify zero volume, repetition off, fractional volume, omission, inheritance and removal. CLI tests read a real temporary config, validate and preview it, then send a critical repeated-ring notification to a local HTTP mock and verify `call` and `volume` arrive as strings. No real phone notification is sent by these automated tests.

配置测试覆盖合法值、错误类型和范围，以及四种通知配置位置。渲染测试验证零音量、关闭重复、小数音量、默认省略、继承和移除。CLI 测试读取真实临时配置，执行检查及预览，并向本地 HTTP 模拟服务发送重要警告，核实 `call` 和 `volume` 均以字符串送达。自动化测试不向真实手机发送通知。

Earlier manually requested critical/call tests at volumes 2 and 5 were accepted by the configured backend. No measured sound level or guaranteed ringing duration is claimed from those responses.

此前按用户要求发送的音量 2、5 的重要警告与重复响铃测试均被配置中的后端接受；不能仅凭成功响应认定实际音量或响铃时长已测量验证。

## UU Remote links / UU 远程跳转

On 2026-10-16, `npm run check` and all 37 tests passed. New coverage checks opt-in defaults, app launch links, fullscreen/PiP device links, opaque ID encoding, optional/empty/nested callback URLs, invalid settings, URL overrides/removal at every notification layer, and the existing payload size limit. CLI checks verify that configuration validation does not print the identifier or callback, preview contains the encoded link, and both automatic events and explicit tests deliver that link (including explicit `callback=`) to a local HTTP mock.

2026-10-16，`npm run check` 和全部 37 项测试通过。新增覆盖默认关闭、App 拉起、全屏/画中画远控链接、设备标识编码、可选/空值/嵌套回调 URL、配置校验、各层 URL 覆盖与移除，以及原有通知大小限制。CLI 验证检查配置时不输出标识或回调地址、预览包含正确编码的链接，自动事件和显式测试均向本地 HTTP 模拟服务发送该链接（含显式的 `callback=`）。

These automated checks did not send a real push or perform mobile device binding, app launching or remote control. In a separate user-requested test on the same date, Bark accepted a notification with the supplied device's fullscreen link and empty callback, and the user reported that the test worked normally. The working device parameters were then saved to the active local configuration.

这些自动化检查没有发送真实推送，也没有执行手机设备绑定、App 跳转或远控。同日按用户要求另行发送了一条带指定设备全屏链接和空回调的真实通知，Bark 接受请求，用户确认测试一切正常；随后已将验证过的设备参数写入当前本地配置。

The Chinese and English Webhook.site walkthrough commands were executed locally with synthetic callback data. Checks covered authorization link construction, matching nonce values, successful and failed result extraction, decoding exactly once (including a literal `%2F` inside an identifier), and valid plugin JSON that renders the expected control link. No actual Webhook.site authorization round trip was performed for these documentation checks.

中英文 Webhook.site 教程中的命令已使用模拟回调在本地执行，验证绑定链接构造、nonce 对应、成功与失败结果提取、只解码一次（包括标识内部含字面量 `%2F` 的情况），以及配置 JSON 可被插件接受并生成预期直连链接。本次文档校验未实际执行 Webhook.site 手机绑定回调流程。

## Version 1.3.0 verified completion / 1.3.0 完成状态修复

On 2026-11-03, Herdr 0.9.5 confirmed that real plugin event JSON contains `pane_agent_status_changed` and no completion/state-change sequences; those fields are available from `agent get`. Focused Pi completion was `idle` with matching sequences. `npm run check` and all 44 tests passed, including focused/background completion, initial idle, missing fields, duplicate events, consecutive rounds, pane/session changes and 20 concurrent claims. The isolated real-Herdr smoke test passed with two test pushes, one blocked push and one verified completion push to its local HTTP mock. No real Bark notification was sent by these automated checks. iPhone lock-screen/Termius and cmux behavior still require device observation.

2026-11-03 使用 Herdr 0.9.5 确认：真实插件事件 JSON 使用 `pane_agent_status_changed`，不含完成/状态序号；序号需通过 `agent get` 获取。聚焦 Pi 的完成状态为 `idle`，两个序号一致。`npm run check` 与 44 项测试通过，覆盖聚焦/后台完成、初始空闲、缺字段、重复事件、连续轮次、Pane/会话更换和 20 个并发去重。真实 Herdr 隔离集成测试通过，本地 HTTP 模拟服务收到两条测试、一条待处理和一条经核验的完成通知。这些自动化检查没有向真实 Bark 推送；iPhone 锁屏/Termius 与 cmux 表现仍需真机观察。

## Version 1.4.0 multiple devices / 1.4.0 多设备推送

All 47 tests passed. New tests verify distinct key-in-path endpoints, duplicate removal, shared payloads, continued delivery after another endpoint fails, credential-safe errors, and compatibility with the existing single string and `/push` formats. No user configuration or real Bark endpoint was changed.

47 项测试通过。新增测试覆盖不同含 Key 地址、重复地址去除、共享通知内容、单地址失败后继续发送、错误脱敏，以及原单字符串和 `/push` 配置兼容。没有修改用户配置或请求真实 Bark 地址。
