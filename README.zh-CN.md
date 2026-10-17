# Herdr Bark Notify

**简体中文** · [English](README.md)

当 Herdr 中的 Agent 完成工作（`done`）或需要输入（`blocked`）时，自动通过 Bark 向 iPhone 发送通知。通知包含 Agent、Workspace 和 Pane 信息，即使同时运行多个 Claude Code 或 Codex，也能区分是哪一个任务。

插件由 Herdr 事件驱动，无需轮询、常驻服务、npm 依赖或编译。配置一次 Bark 地址后即可使用。

```text
✓ Claude Code · 完成
backend / Implement login API
任务完成，等待查看。
Agent: claude
Pane: w1:p2

⚠ Codex · 需要处理
backend / Fix database migration
Agent 正在等待你的输入或确认。
Agent: codex
Pane: w1:p3
```

## 环境要求

- **Herdr 0.9.0 或更新版本**。清单最低版本取自本次实际核验的事件接口版本。
- **Node.js 22 或更新版本**，且 Herdr **服务端进程**的 `PATH` 能找到 `node`。
- iPhone 已安装 Bark、允许通知，并已获得有效的设备推送密钥。
- 运行 Herdr 的机器能够访问 `api.day.app` 或你的自建 Bark 服务。

代码使用跨平台 Node API，声明支持 macOS、Linux 和 Windows。本地验证环境为 macOS、Node 24 和 Herdr 0.9.0；仓库包含三种系统、Node 22/24 的 CI 矩阵。提供 CI 配置不代表远端工作流已经运行通过。

## 快速开始：加载本地插件

在本仓库根目录执行，无需 `npm install`：

```sh
node --version
herdr --version
herdr plugin link .
herdr plugin list --plugin herdr.bark-notify
herdr plugin config-dir herdr.bark-notify
```

本插件的固定 ID 为 **`herdr.bark-notify`**。之前对话里的 `example.bark-notify` 是示例占位符，使用本项目时请统一替换。

### macOS / Linux

```sh
bark_config_dir="$(herdr plugin config-dir herdr.bark-notify)"
node notify.mjs init --config "$bark_config_dir/config.json"
```

使用编辑器打开生成的 `config.json`，将 `YOUR_BARK_KEY` 替换为 Bark App 显示的设备密钥：

```json
{
  "bark_url": "https://api.day.app/YOUR_BARK_KEY",
  "locale": "zh-CN"
}
```

`init` 会按需创建目录，在 Unix 上为新配置文件设置 `0600` 权限，且不会覆盖已有文件。若提示配置已存在，直接编辑已有文件即可。真实密钥应保存在插件配置目录中，不要写入源码仓库。

### Windows PowerShell

```powershell
$barkConfigDir = (herdr plugin config-dir herdr.bark-notify).Trim()
$barkConfigFile = Join-Path $barkConfigDir 'config.json'
node .\notify.mjs init --config $barkConfigFile
notepad $barkConfigFile
```

配置内容与上方相同。Windows 文件访问权限由目录 ACL 决定，Unix 权限位不能替代 Windows ACL。

### 检查配置并测试通知

在仓库目录执行以下命令，不要求当前有运行中的 Herdr 会话：

```sh
node notify.mjs check --config "$bark_config_dir/config.json"
node notify.mjs preview --config "$bark_config_dir/config.json"
node notify.mjs test --status done --config "$bark_config_dir/config.json"
node notify.mjs test --status blocked --config "$bark_config_dir/config.json"
```

在 PowerShell 中，将 `"$bark_config_dir/config.json"` 替换为 `$barkConfigFile`。

- `check`：验证配置格式及是否填写推送地址，**不发送网络请求**。
- `preview`：使用示例数据打印通知 JSON，**不发送网络请求**，也不打印地址和设备密钥。
- `test`：向真实 Bark 服务发送带 `[TEST / 测试]` 前缀的通知。测试命令会绕过 `enabled` 和状态开关，方便在关闭自动通知时排查连通性。

在运行中的 Herdr 会话内，也可以调用已注册的动作：

```sh
herdr plugin action invoke herdr.bark-notify.check
herdr plugin action invoke herdr.bark-notify.preview
herdr plugin action invoke herdr.bark-notify.test-done
herdr plugin action invoke herdr.bark-notify.test-blocked
herdr plugin log list --plugin herdr.bark-notify
```

动作可能异步执行，请在插件命令日志中查看输出和退出码。预览及测试动作使用模拟上下文，不代表某个实际任务已完成。

接下来正常在 Herdr 中启动 Agent 并完成任务。Herdr 报告 `done` 或 `blocked` 后，插件即自动发送通知。插件不以进程退出判断任务完成，也不读取终端输出；需要 Herdr 自身的 Agent 检测和集成功能能够正常产生状态事件。

## 从 GitHub 安装

将本仓库发布到 GitHub 后，其他用户可以执行：

```sh
herdr plugin install OWNER/herdr-bark-notify
herdr plugin config-dir herdr.bark-notify
```

`OWNER` 是占位符，不代表已经发布的仓库。按照前面的最小 JSON，在输出的配置目录创建 `config.json`，再执行插件 `check` 和测试动作。GitHub 安装同样不需要安装 npm 依赖或运行构建命令。

插件注册和启用状态对当前用户的 Herdr 会话全局生效，没有运行中的服务时也可加载。已有服务通常无需重启即可识别注册变化；如果在服务启动后才安装 Node，服务继承的旧 `PATH` 可能需要刷新。

## 默认方形头像

1.1.0 自动为 Herdr 0.9.0 的 **23 种 Agent 中的 19 种**附带 LobeHub 方形头像；没有独立 CLI 头像时采用对应品牌头像。OMP、Droid、Maki、Muse 保留 Bark 默认图标，无需新增配置。详见[完整覆盖清单、来源及覆盖方法](docs/AVATARS.md)。

设置 `"notification": { "icon": null }` 可关闭默认头像；已有自定义 `icon` 优先。源图片为 LobeHub 的 640×640 PNG 品牌图标，与 WebP Avatar 包的背景样式有所不同；由于 WebP 头像在真机测试中未显示，默认改用 PNG。最终通知头像的裁切形状由 iOS 决定。

## 配置项详解

只需填写 Bark 地址即可使用，默认通知语言为 **`zh-CN`**，设置 `"locale": "en"` 可改为英文。完整扩展示例见 [config.example.json](config.example.json)。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `bark_url` | 发送时必填 | 含设备密钥的完整地址，如 `https://api.day.app/KEY`；也可使用 `/push` 配合 `device_key`。 |
| `device_key` | 不设置 | `/push` 地址必须填写；密钥已在路径中的地址不能同时设置此项。 |
| `enabled` | `true` | 自动通知总开关。 |
| `locale` | `"zh-CN"` | 支持 `"zh-CN"`、`"en"`，控制默认状态标签和正文。 |
| `timeout_ms` | `5000` | 每次请求的超时毫秒数，包含读取响应正文；整数，100–10000。 |
| `retries` | `1` | 临时错误后额外重试次数；整数，0–2。 |
| `uuremote` | 关闭 | UU 远程跳转设置：`enabled`、`anonymous_device_id`、`window_type`、可选的 `callback`。详见下方。 |
| `notification` | 内置模板 | 全局 Bark 字段和通知模板。 |
| `statuses` | 两种状态均开启 | `done`、`blocked` 设置，每项可包含 `enabled` 和 `notification`。 |
| `agents` | 内置显示名称 | 以事件 `data.agent` 的真实值为键，每项可包含 `name`、`notification`、`statuses`。 |

未知字段、未知模板变量和错误类型会直接报错，避免拼写错误被静默忽略。配置必须是标准 JSON，不支持注释或末尾多余逗号；支持部分 Windows 编辑器生成的 UTF-8 BOM。

### 通知字段

| 字段 | 默认值 / 可选值 |
| --- | --- |
| `title` | `{emoji} {agent} · {status_label}` |
| `subtitle` | `{workspace} / {pane}` |
| `body` | `{message}\nAgent: {agent_id}\nPane: {pane_id}`；渲染后的正文必须含非空白内容。 |
| `group` | `herdr-{agent_id}`，按 Agent 在 Bark 中分组。 |
| `sound` | 默认不指定，由 Bark 决定。可设置 Bark 铃声名，例如 `bell`、`minuet`、`calypso`、`alarm`。 |
| `icon` | 默认使用匹配的 LobeHub 方形头像（若有），可用 URL 覆盖，或设为 `null` 关闭。 |
| `url` | 可选，点击通知跳转的 URL。显式设置会覆盖 UU 远程生成的链接，`null` 或 `""` 可移除跳转。 |
| `level` | 可选：`active`、`passive`、`timeSensitive`、`critical`，实际效果取决于 Bark 和 iOS 权限。 |
| `call` | 1.2.0 起支持：`"1"` 或 `1` 重复响铃约 30 秒；`"0"` 或 `0` 关闭重复。默认不设置。 |
| `volume` | 1.2.0 起支持：0–10 的数字，可用小数，仅控制 `critical` 重要警告音量。默认不设置（Bark 使用 5）；`0` 表示零音量。 |
| `badge` | 可选，整数，0–99999。 |
| `isArchive` | 可选，`0` 或 `1`。不设置时遵循 Bark App 设置。 |
| `copy` | 可选，从通知复制时使用的文本。 |

除 `level`、`call` 只能使用规定值外，字符串字段均支持下方模板变量。用 `null` 可以移除继承的任意可选字段；空字符串 `""` 还可移除可选文本字段，但不能用于 `level`、`call` 或数字字段；不要移除或清空 `body`。插件只开放上述 Bark API 字段，不会直接透传任意额外 JSON。

### 点击通知跳转到 UU 远程

点击通知直接连接指定电脑时，将以下片段合并到已有 `config.json`，保留 Bark 地址和其他设置，并填写绑定流程返回的设备标识：

```json
{
  "uuremote": {
    "enabled": true,
    "anonymous_device_id": "绑定回调返回的原始设备标识",
    "window_type": 0,
    "callback": ""
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `enabled` | 布尔值，默认 `false`。设为 `false` 关闭自动生成的跳转链接。 |
| `anonymous_device_id` | 可选的非空字符串。省略时仅打开 App；填写后生成 `uuremote://external/device/control` 链接。插件自动编码参数，不要预先 URL 编码。 |
| `window_type` | 整数 `0`（默认，全屏）或 `1`（画中画）。启用画中画必须填写设备标识。 |
| `callback` | 可选字符串。不设置时省略该参数；显式 `""` 保留链接末尾的 `&callback=`。非空值必须是含协议和主机的回调 URL，例如 `myapp://controlresult`，插件自动编码。启用非空回调时必须填写设备标识。 |

例如原始设备标识为 `opaque+/=` 时，上述配置生成 `uuremote://external/device/control?anonymous_device_id=opaque%2B%2F%3D&window_type=0&callback=`。从已有链接复制设备标识时，先对该参数 URL 解码一次（如 `%2F` → `/`、`%2B` → `+`、`%3D` → `=`）；不要把整条链接或已经编码的参数直接填进 `anonymous_device_id`。如果已有完整链接，也可直接原样设置 `notification.url`。

只需要打开 App、暂不指定电脑时，可以简化为 `"uuremote": { "enabled": true }`，通知将使用 `uuremote://external`。

按照 [UU 远程官方集成指南](https://github.com/netease-uuyc/uuremote-integration-guide)，手机需要安装并登录 **4.42.0 或更新版本**的 UU 远程；直连目标仅支持 Windows/macOS。iPhone 画中画需要 iOS 18+ 且设备支持 PiP。

设备标识必须来自官方 `device/authorize` 绑定流程返回的 `anonymous_device_id`，不能使用普通设备码、连接密码或 Herdr Pane ID 代替。本插件运行在 Herdr 主机上，不接收手机 App 回调；可以按下方教程借助 Webhook.site 接收绑定结果，也可以自行实现官方指南中的回调接收 App。

生成的链接作为默认 `url`，仍遵循全局、状态、Agent、Agent 状态的通知覆盖顺序。如果已有 `notification.url`，请删除它以使用自动生成的链接；设置 `"url": null` 或 `"url": ""` 可为特定通知移除跳转。官方协议中的 `callback` 是可选项，仅画中画模式且提供有效回调地址时才返回结果，全屏模式不会回调；无需回调时可直接省略该配置。插件只将配置的回调放入链接，不接收或等待手机端远控结果。Bark 发送成功只代表推送服务接受请求，实际跳转和远控需要在手机上验证。远控进入指定电脑，不会自动选中 Herdr Pane。

可用 `check` 检查配置、`preview` 查看生成的 `url`。启用直连后，预览、通知及 Bark 服务会包含加密设备标识，请按设备配置数据保管。设置保存后下次插件调用即生效。

#### 借助 Webhook.site 提取设备直连参数：完整教程

下面将 [UU 远程的绑定回调协议](https://github.com/netease-uuyc/uuremote-integration-guide#2-设备绑定)与 [Webhook.site 的 HTTP 请求查看功能](https://docs.webhook.site/#what-is-webhooksite)组合使用：把 HTTPS 接收地址放进绑定链接的 `callback`，在手机选择电脑后，通过浏览器访问回调地址，将设备标识带到请求记录中。无需部署回调服务器。

```text
Webhook.site 接收地址 → 手机打开绑定链接 → UU 远程选择电脑
→ 浏览器访问回调 → 提取 anonymous_device_id → 写入插件配置 → 点击 Bark 通知直连
```

准备好已登录的 UU 远程手机端、账号下可选择的 Windows/macOS 电脑，以及安装了 Node.js 22+ 的电脑。先确认手机能在 UU 远程内正常连接目标电脑。以下 `YOUR_WEBHOOK_UUID`、`YOUR_NONCE` 和 `opaque+/=` 都是演示值，不是可用的设备参数。

**1. 获取临时 HTTPS 接收地址**

在电脑浏览器打开 [Webhook.site](https://webhook.site/)，复制页面 **Your unique URL** 下的接收地址，并保留这个请求查看页面。例如：

```text
https://webhook.site/YOUR_WEBHOOK_UUID
```

应复制上面的接收地址，不要复制浏览器地址栏中带 `#!/view/` 的管理页面地址，也不要复制 unique email address。Webhook.site 的 UUID 只标识这个临时收件箱，不是 UU 设备 ID。[官方 FAQ 也说明了这两种地址的区别](https://docs.webhook.site/#im-getting-a-405-method-not-allowed-whats-wrong)。

绑定结果会发送到 Webhook.site。免费地址的请求记录可被知道该地址 ID 的人查看，因此不要公开接收地址、完整回调链接或设备标识，也不要向其中填入 Bark 密钥或远控密码。[Webhook.site 隐私说明](https://docs.webhook.site/#is-my-data-private)。

**2. 生成设备绑定链接**

在电脑终端执行下面命令，先将 `YOUR_WEBHOOK_UUID` 替换为刚才接收地址中的实际 UUID。命令只在本地生成文本，不发送请求；macOS、Linux 和 Windows PowerShell 均可使用：

```sh
node -e "const callback = 'https://webhook.site/YOUR_WEBHOOK_UUID'; const nonce = require('node:crypto').randomUUID(); console.log('nonce=' + nonce); console.log('uuremote://external/device/authorize?callback=' + encodeURIComponent(callback) + '&nonce=' + nonce);"
```

保存第一行的 `nonce`，复制第二行完整的 `uuremote://` 链接。生成结果形如：

```text
uuremote://external/device/authorize?callback=https%3A%2F%2Fwebhook.site%2FYOUR_WEBHOOK_UUID&nonce=YOUR_NONCE
```

这里必须使用 **`device/authorize`**，因为此时还没有设备标识。`callback` 必须填写且只编码一次；`nonce` 用于识别这一次绑定结果，不需要写入最终插件配置。不要提前把接收地址改成 `%3A%2F...` 再交给命令编码。

**3. 在 iPhone 上打开链接并选择电脑**

把完整绑定链接复制到 iPhone。在“快捷指令”中新建一个临时快捷指令，按顺序添加 **URL** 和 **打开 URL（Open URLs）** 两个操作：将绑定链接粘贴进 URL 操作，让“打开 URL”使用上一操作的结果，然后运行。出现系统打开 App 提示时允许打开 UU 远程。这是 Apple 文档支持的 [URL Scheme 调用方式](https://support.apple.com/guide/shortcuts/apd68802640c/ios)。

在 UU 远程的设备选择界面选择要直连的电脑并确认。HTTPS 回调应由手机浏览器打开；若出现打开浏览器的确认提示，允许继续。浏览器中的空白页或接收成功提示不是设备参数查看界面，接下来回到电脑上的 Webhook.site 请求列表查看。此流程需要手机能访问 Webhook.site；不要在电脑终端用 `curl` 请求 `uuremote://` 链接。

**4. 从回调请求中读取设备 ID**

在 Webhook.site 左侧请求列表中找到刚收到的请求，打开详情，查看请求 URL 或查询参数区域。正常回调通常是一个 **GET** 请求，正文为空也正常。确认 `nonce` 与第 2 步相同，再读取结果：

| 回调参数 | 如何处理 |
| --- | --- |
| `anonymous_device_id` | 成功时返回的加密设备标识，保存其原始值。 |
| `nonce` | 与本次生成的值核对，防止使用旧请求或另一台电脑的结果。 |
| `error` | 绑定失败原因；出现此项时先处理错误，不要把它当作设备 ID。 |

成功请求的 URL 可能如下（仅演示）：

```text
https://webhook.site/YOUR_WEBHOOK_UUID?anonymous_device_id=opaque%2B%2F%3D&nonce=YOUR_NONCE
```

如果查询参数区域已显示 `opaque+/=`，直接复制该值。如果拿到的是完整请求 URL，可以在本地用下面命令提取；将 `PASTE_FULL_CALLBACK_REQUEST_URL` 替换为请求详情中的完整 HTTPS URL，而不是 `#!/view/` 管理页面地址：

```sh
node -e "const p = new URL('PASTE_FULL_CALLBACK_REQUEST_URL').searchParams; console.log(JSON.stringify({ nonce: p.get('nonce'), error: p.get('error'), anonymous_device_id: p.get('anonymous_device_id') }, null, 2));"
```

检查输出中的 `nonce` 是否匹配、`error` 是否为 `null`、`anonymous_device_id` 是否非空。`URL.searchParams` 已解码一次，复制输出的设备标识即可，**不要再次调用 `decodeURIComponent`**。保留 `+`、`/`、`=`；如果标识出现了不应有的空格，请从原始请求 URL 重新提取，不要凭猜测修改字符。

**5. 合并到实际使用的插件配置**

在安装本插件的电脑上执行：

```sh
herdr plugin config-dir herdr.bark-notify
```

打开输出目录中的 `config.json`，将以下 `uuremote` 对象合并进去，用提取到的真实原始值替换演示 ID，保留已有 Bark 地址、密钥、铃声和 Agent 设置：

```json
{
  "uuremote": {
    "enabled": true,
    "anonymous_device_id": "opaque+/=",
    "window_type": 0,
    "callback": ""
  }
}
```

这里的 `window_type: 0` 表示全屏直连；需要画中画时改为 `1` 并满足前面的系统要求。注意两个 `callback` 的用途不同：**绑定链接的 `callback` 必须是 Webhook.site 接收地址；插件配置中的 `callback` 是远控结果回调，本教程留空，也可省略。** 获取 ID 后，日常直连不再依赖 Webhook.site，无需将临时接收地址长期保存在插件中。

如果已有任意层级的 `notification.url`，它会覆盖生成的链接；删除该字段以使用 `uuremote` 设置。获取 ID 只需按设备执行一次；设备解绑、切换账号后旧标识失效时，再重新绑定获取。

**6. 检查并发送一次验证通知**

回到本仓库目录。macOS / Linux：

```sh
bark_config_dir="$(herdr plugin config-dir herdr.bark-notify)"
node notify.mjs check --config "$bark_config_dir/config.json"
node notify.mjs preview --config "$bark_config_dir/config.json"
```

Windows PowerShell：

```powershell
$barkConfigFile = Join-Path (herdr plugin config-dir herdr.bark-notify).Trim() 'config.json'
node .\notify.mjs check --config $barkConfigFile
node .\notify.mjs preview --config $barkConfigFile
```

预览中的 `url` 应含 `/device/control`、编码后的设备标识和 `window_type=0`；显式设置空回调时末尾还有 `&callback=`。前两个命令不发网络请求。确认后，使用下面命令发送一次**真实测试通知**；PowerShell 将配置路径参数替换为 `$barkConfigFile`：

```sh
node notify.mjs test --status done --config "$bark_config_dir/config.json"
```

点击 iPhone 上的测试通知，确认进入的是预期电脑。保存配置后，下次自动通知即使用此链接，无需重启。提取和验证完成后，可删除临时快捷指令并在 Webhook.site 清理请求记录；免费地址存在有效期和请求数量限制，过期后如需重新绑定，应创建新地址。[Webhook.site 保留规则](https://docs.webhook.site/#how-long-is-data-stored-on-webhooksite)。

**常见问题**

| 现象 | 排查方法 |
| --- | --- |
| 没有出现 UU 远程设备选择界面 | 检查客户端版本和登录状态；使用手机“URL → 打开 URL”，确认链接是 `device/authorize`，复制时未断行。 |
| 浏览器打开了 Webhook.site，但列表里没有绑定结果 | 检查是否误用了 `#!/view/` 地址、是否查看同一个 UUID、接收地址是否过期或达到请求上限。只有普通访问、没有 ID/错误参数的请求不是绑定结果。 |
| `error=no_device` | 确认当前账号下存在支持的 Windows/macOS 电脑。 |
| `error=user_cancel`、`timeout` 或 `superseded` | 分别对应取消、等待超时、被后续绑定请求替代；完成登录后重新生成链接，逐次操作并核对新 `nonce`。 |
| 返回的 `nonce` 不匹配 | 选择与本次绑定一致的请求；必要时重新绑定，不要继续保存旧结果。 |
| 点击通知只打开 App，没有直连 | 检查实际配置目录、设备 ID 是否填写，以及 `notification.url` 是否覆盖了生成链接。 |
| 直连提示设备不存在或无法连接 | 检查复制/编码、账号、设备在线和允许被控状态；解绑或换账号后重新获取标识。绑定成功不等于设备此刻可以连接。 |

### 重复响铃与重要警告音量（1.2.0）

将以下片段合并到已有 `config.json`，即可为两类通知启用约 30 秒响铃，音量设为 5：

```json
{
  "notification": {
    "level": "critical",
    "call": "1",
    "sound": "alarm",
    "volume": 5
  }
}
```

如果只想让待处理通知这样提醒，将这四个字段放进 `statuses.blocked.notification`。也可在 `agents.<id>.notification` 或 `agents.<id>.statuses.blocked.notification` 下设置，遵循原有覆盖优先级。请合并已有字段，保留地址、密钥及其他设置；保存后下次插件运行即读取新配置。

`volume` 使用 JSON 数字，`"2"` 这样的字符串会被拒绝。`call` 支持字符串或数字形式的 0/1，不接受布尔值及模板变量。发送时插件将两者转为字符串，以匹配 Bark 通知扩展的读取方式。在更高优先级配置中设置 `call: "0"` 可关闭继承的重复响铃；`call: null`、`volume: null` 则移除继承字段。音量设置不控制普通 `active` 通知。升级不会自动启用重要警告、重复响铃或指定默认音量。扩展示例中的 `call: "0"` 表示不重复，`volume: 5` 仅在你同时选择 `critical` 后生效。

Bark 的 `call` 将铃声延长到约 30 秒，不会无限响铃直到点开通知。`critical` 的效果取决于 Bark 的“重要警告”权限；插件没有增加定时重发或确认服务。参见 [Bark 参数文档](https://github.com/Finb/Bark/blob/master/docs/tutorial.md)、[重复响铃实现](https://github.com/Finb/Bark/blob/master/NotificationServiceExtension/Processor/CallProcessor.swift)和[重要警告音量处理](https://github.com/Finb/Bark/blob/master/NotificationServiceExtension/Processor/LevelProcessor.swift)。

### 模板变量

| 变量 | 含义 |
| --- | --- |
| `{agent}` | 配置指定名称 → 事件 `display_agent` → 内置友好名称 → 原始 Agent ID → `Agent`。 |
| `{agent_id}` | Agent 原始标识，缺失时为 `unknown`。 |
| `{display_agent}` | 事件提供的显示名称，缺失时为空。 |
| `{status}` | `done` 或 `blocked`。 |
| `{status_label}` | `完成` / `需要处理`，英文为 `Done` / `Needs attention`。 |
| `{emoji}` | `✓` 或 `⚠`。 |
| `{message}` | 对应语言和状态的默认说明句。 |
| `{workspace}` | 事件工作区名称（若有）→ ID 匹配的上下文名称 → 工作区 ID → 对应语言的兜底文本。 |
| `{workspace_id}` | 事件中的工作区 ID，缺失时回退到 Herdr 环境变量。 |
| `{pane}` | 事件 `title` / `pane_title` → 向 Herdr 查询且 ID 匹配的 Pane 标签、标题或终端标题 → Pane ID → 对应语言的兜底文本。 |
| `{pane_id}` | 事件中的 Pane ID，缺失时回退到 Herdr 环境变量。 |
| `{tab}` / `{tab_id}` | 事件字段或 Pane ID 匹配的焦点上下文字段，缺失时为空。 |

模板只做一次文本替换，不执行表达式；名称中出现的模板样式文本不会二次展开。`title`、`subtitle`、`group` 各限制为 240 个 UTF-8 字节，`body` 限制为 1600 字节，超长部分以省略号截断，不会截坏中文或 emoji。渲染后的通知字段 JSON 不得超过 3000 字节，为 APNs 封装预留空间；这属于插件的保守限制，并不保证所有服务端最终封装都满足其限制。

工作区名称仅在上下文工作区 ID 与事件相同时使用；焦点 Agent 和 Tab 信息仅在 Pane ID 相同时使用。缺失时显示 ID，避免误用当前焦点所在的另一个任务。自动事件没有标题时，通过 `HERDR_BIN_PATH pane get <事件的-pane-id>` 只查询对应 Pane，设置 1 秒超时并核对返回 ID；失败后仍使用 ID。Pane 标题来自 Herdr，插件不会读取对话、总结任务或虚构名称。

### 按 Agent、状态定制

通知字段按以下顺序合并，后面的覆盖前面的：

1. 内置默认值（包含启用时生成的 UU 远程链接）。
2. 全局 `notification`。
3. `statuses.<状态>.notification`。
4. `agents.<agent_id>.notification`。
5. `agents.<agent_id>.statuses.<状态>.notification`。

状态开关优先采用 Agent 单独设置，其次采用全局状态设置，最后默认为 `true`。顶层 `enabled: false` 始终关闭所有自动通知。

例如：默认关闭完成通知，但保留 Codex 的完成通知，并为 Codex 的待处理状态设置单独铃声：

```json
{
  "bark_url": "https://api.day.app/YOUR_BARK_KEY",
  "locale": "zh-CN",
  "notification": { "group": "herdr-{workspace_id}-{agent_id}" },
  "statuses": { "done": { "enabled": false } },
  "agents": {
    "codex": {
      "name": "Codex",
      "notification": { "sound": "bell" },
      "statuses": {
        "done": { "enabled": true },
        "blocked": { "notification": { "sound": "alarm" } }
      }
    }
  }
}
```

Agent 配置键精确匹配且区分大小写。内置显示名称覆盖 Herdr 0.9.0 的全部 23 种 Agent，[头像/名称别名](docs/AVATARS.md) **不会合并用户配置项**。设置 `agents` 键时，以实际通知正文中的 `Agent:` 值为准。若想保留 Herdr 自定义的 `display_agent`，不要设置 `agents.<id>.name`。

### 自建 Bark 和环境变量

```json
{
  "bark_url": "https://bark.example.com/push",
  "device_key": "YOUR_BARK_KEY",
  "locale": "zh-CN"
}
```

支持反向代理路径前缀，例如 `https://example.com/bark/push`。请填写最终推送端点，不要使用会重定向的地址。路径携带密钥时，地址应截止于密钥，不能直接粘贴 Bark 示例中的 `/KEY/title/body`。不接受查询参数、URL 用户名密码和 fragment；通知参数请放在 `notification` 中。推荐 HTTPS；允许自建和本地开发使用 HTTP，但 HTTP 会明文传输密钥和通知内容。

非空的 `BARK_URL`、`BARK_DEVICE_KEY` 会覆盖 JSON 中对应字段。提供 `BARK_URL` 后可以不创建配置文件；如果配置文件存在，它仍必须有效。插件不读取 `.env` 文件。环境变量必须被 **Herdr 服务端进程**继承，在某个 Pane 内事后 `export` 不一定能影响插件。通常使用 `config.json` 更方便，修改后下次执行立即读取。

## 启停、更新和卸载

```sh
herdr plugin disable herdr.bark-notify
herdr plugin enable herdr.bark-notify
herdr plugin action list --plugin herdr.bark-notify
herdr plugin log list --plugin herdr.bark-notify
herdr plugin unlink herdr.bark-notify
```

Herdr 的 `disable` 会停止自动事件执行。也可以在 `config.json` 中设置 `enabled: false`，保留插件动作注册，但停止自动通知。显式测试命令会绕过配置开关。

`unlink` 取消本地插件注册，保留源码。GitHub 管理的安装使用 `herdr plugin uninstall herdr.bark-notify`，Herdr 会删除托管的源码副本。Herdr 保留插件配置和状态；若需完整清理，请手动删除配置目录中的密钥。

本地 link 后，JavaScript 和配置变更在下次执行生效。修改 `herdr-plugin.toml` 后，重新运行 `herdr plugin link .` 注册清单。由本地加载改为 GitHub 安装时，先 unlink。GitHub 托管安装通过重新 install 更新，Herdr 插件 v1 没有独立的 `plugin update`；重新安装前先备份托管源码中自行修改的内容。

## 故障排查

| 现象 | 检查方法 |
| --- | --- |
| 无法启动 `node` | 确认服务端 `PATH` 中存在 Node 22+；远程机器也需要安装。版本管理器可能只在交互式 shell 初始化。 |
| 列表中没有插件 | 在本仓库执行 `herdr plugin link .`，检查 Herdr 版本是否满足要求。 |
| 无法读取配置 / 缺少地址 | 用 `herdr plugin config-dir herdr.bark-notify` 获取目录，在该目录创建 `config.json`，不要放到源码目录。 |
| 提示示例密钥未替换 | 将 `YOUR_BARK_KEY` 替换成真实设备密钥。 |
| JSON 或字段错误 | 使用标准 JSON、文档中的字段名和类型，并运行 `check`。错误消息不会输出原始配置值。 |
| 测试能收到，自动通知收不到 | 检查插件启用状态、`enabled`、状态过滤，并确认 Herdr 实际产生了 `done` / `blocked`。仅退出进程不是触发条件。对于已查看或聚焦的完成状态，Herdr 可能报告 `idle`，插件不会把 `idle` 自行解释成 `done`。 |
| 只显示工作区 / Pane ID | 主机没有提供匹配的名称或 Pane 标题。可在 Herdr 中为 Pane 设置清晰名称。 |
| HTTP 4xx | 检查密钥和端点；`/push` 必须配合 `device_key`。HTTP 429 会重试。 |
| HTTP 5xx / 网络失败 / 超时 | 检查 Bark、DNS、防火墙和 HTTPS 证书信任；插件拒绝重定向，应配置最终地址。 |
| Bark 拒绝通知 | HTTP 成功，但 Bark JSON 的 `code` 不是 `200`。检查端点、密钥及服务端。 |
| 显示发送成功，但手机没响 | Bark 接受请求不等于手机已收到。检查 iOS 通知权限、专注模式、网络和 Bark 铃声设置。 |
| 重复收到通知 | 每个匹配事件都可能发送，没有持久化去重；若首次已送达但响应丢失，网络重试可能重复推送。 |
| 远程 Agent 没通知 | 在运行对应 Herdr 服务的机器上安装 Node、安装插件并配置 Bark。本地配置不会自动同步到远程。 |

网络错误、超时、HTTP 429/5xx，以及 Bark 响应中整数类型的 429/5xx 错误码会重试。其他拒绝响应和无效 JSON 立即失败。重试间隔依次为 250、500 毫秒，不解析 `Retry-After`。所有网络尝试的最大配置用时约为 30.75 秒，另加进程开销。没有持久化消息队列，不保证失败后最终送达；设置 `retries: 0` 可以禁用自动重发。

自动通知成功、忽略事件和通知已关闭时退出码为 `0`；配置或输入错误、发送失败时为 `1`。常规错误日志不包含端点、密钥和 Bark 原始响应。预览会输出通知正文，可能被 Herdr 写入插件日志。插件会将名称、ID 和你配置的内容发送到指定 Bark 服务，不读取终端对话或选中文本。

## 开发和验证

```sh
npm run check
npm test
npm run test:coverage
node notify.mjs preview --event fixtures/done.json
node notify.mjs preview --event fixtures/blocked.json
node notify.mjs --help
```

测试使用本地 HTTP 服务和模拟事件，不需要真实密钥或 iPhone，也不会向外部发送通知。覆盖配置校验、模板优先级、焦点与事件身份区分、Unicode、请求内容、HTTP 与业务错误、重试、超时、禁止重定向、CLI 入口和日志脱敏。实际验证结果及限制见 [docs/VALIDATION.md](docs/VALIDATION.md)。

```text
herdr-plugin.toml       插件注册、事件钩子、动作
notify.mjs             命令行及事件入口
src/config.mjs         配置读取、初始化与校验
src/message.mjs        身份解析、中英文文案、模板
src/agents.mjs         Herdr Agent 名称与默认方形头像地址
src/bark.mjs           HTTP 发送、超时与重试
src/herdr.mjs          缺失 Pane 标签的只读查询
config.example.json    扩展配置示例
fixtures/              示例事件
test/                  Node 内置测试
```

可选的真实主机集成测试需要 Python 3，以及 macOS/Linux 上的 Herdr：

```sh
python3 scripts/verify_herdr.py
```

该脚本使用独立临时配置、状态目录和无界面测试服务，验证动作及后台 Agent 状态变化，结束后清理自己创建的服务和文件，不会将插件注册到日常使用的 Herdr 配置中。

## 接口依据

实现核对了本机 Herdr 0.9.0 的 schema（`herdr api schema --json`）、[Herdr 插件文档](https://herdr.dev/docs/plugins/)、[Socket API](https://herdr.dev/docs/socket-api/) 和 [Bark HTTP API 文档](https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md)。[Telegram 通知示例](https://github.com/ogulcancelik/herdr-plugin-examples/tree/main/agent-telegram-notify)用于参考事件集成方式，本仓库自行实现 Bark 配置与发送逻辑。

使用 [MIT 许可证](LICENSE)。
