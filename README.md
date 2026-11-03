# Herdr Bark Notify

[简体中文](README.zh-CN.md) · **English**

Send a Bark notification to your iPhone when a Herdr agent finishes work (`done`) or needs input (`blocked`). Each notification identifies the agent, workspace and pane, so multiple Claude Code or Codex sessions remain distinguishable.

This is an event-driven Herdr plugin: no polling, daemon, npm dependencies or build step. Configure your Bark endpoint once. Herdr launches the script for matching events.

```text
✓ Claude Code · Done
backend / Implement login API
Task complete. Ready for your review.
Agent: claude
Pane: w1:p2

⚠ Codex · Needs attention
backend / Fix database migration
The agent is waiting for your input or approval.
Agent: codex
Pane: w1:p3
```

## Requirements

- **Herdr 0.9.5 or newer** for automatic completion notifications. Older hosts do not provide the completion sequence required to distinguish work from initial idle/session changes.
- **Node.js 22 or newer**, available as `node` in the Herdr **server's** `PATH`.
- Bark installed on your iPhone, notifications allowed, and a valid device push key.
- Network access from the machine running Herdr to `api.day.app` or your self-hosted Bark server.

The implementation uses portable Node APIs and declares macOS, Linux and Windows support. Local verification was performed on macOS with Node 24 and Herdr 0.9.0; the repository includes a CI matrix for Node 22/24 on all three operating systems. A CI definition is not evidence that those remote jobs have already run.

## Quick start: local checkout

Run these commands from this repository's root directory. No `npm install` is required.

```sh
node --version
herdr --version
herdr plugin link .
herdr plugin list --plugin herdr.bark-notify
herdr plugin config-dir herdr.bark-notify
```

The plugin ID is **`herdr.bark-notify`**. Use this ID everywhere; `example.bark-notify` in the earlier discussion was a placeholder.

### macOS / Linux

```sh
bark_config_dir="$(herdr plugin config-dir herdr.bark-notify)"
node notify.mjs init --config "$bark_config_dir/config.json" --locale en
```

Open the resulting `config.json` in your editor and replace `YOUR_BARK_KEY` with the key shown in the Bark app:

```json
{
  "bark_url": "https://api.day.app/YOUR_BARK_KEY",
  "locale": "en"
}
```

`init` creates the directory if needed, uses `0600` permissions for the new file on Unix, and refuses to overwrite an existing file. For an existing config, edit it directly. Do not put your actual key in the source checkout.

### Windows PowerShell

```powershell
$barkConfigDir = (herdr plugin config-dir herdr.bark-notify).Trim()
$barkConfigFile = Join-Path $barkConfigDir 'config.json'
node .\notify.mjs init --config $barkConfigFile --locale en
notepad $barkConfigFile
```

The same JSON configuration applies. Windows file access is controlled by the directory's ACLs; Unix permission bits do not establish a private Windows ACL.

### Verify configuration and delivery

From the repository directory, these commands also work without an active Herdr session:

```sh
node notify.mjs check --config "$bark_config_dir/config.json"
node notify.mjs preview --config "$bark_config_dir/config.json"
node notify.mjs test --status done --config "$bark_config_dir/config.json"
node notify.mjs test --status blocked --config "$bark_config_dir/config.json"
```

In PowerShell, replace `"$bark_config_dir/config.json"` with `$barkConfigFile`.

- `check` validates configuration and the endpoint's presence; it makes **no network request**.
- `preview` prints notification JSON with sample data; it makes **no network request** and omits the endpoint and device key.
- `test` sends a real notification prefixed with `[TEST / 测试]`. It deliberately bypasses `enabled` and status switches so connectivity can be tested while notifications are disabled.

Inside a running Herdr session, the equivalent registered actions are:

```sh
herdr plugin action invoke herdr.bark-notify.check
herdr plugin action invoke herdr.bark-notify.preview
herdr plugin action invoke herdr.bark-notify.test-done
herdr plugin action invoke herdr.bark-notify.test-blocked
herdr plugin log list --plugin herdr.bark-notify
```

Action execution may be asynchronous. Inspect the plugin command log for script output and exit status. Preview and test actions use synthetic sample context, rather than claiming to report an actual task completion.

Now run a normal agent task inside Herdr. When Herdr reports `done`, a verified completed `idle`, or `blocked`, the plugin automatically sends a notification. For completion events, it queries only the event pane with `herdr agent get` and requires a positive `completion_seq` equal to `state_change_seq`. Initial idle and session changes are ignored. It does not infer completion from a shell process exit or read terminal output.

Completion deliveries are claimed under `HERDR_PLUGIN_STATE_DIR` by pane, agent session (when available) and completion sequence. A file lock serializes concurrent hooks, so one round sends at most once while a later round can notify again. The state directory is supplied by Herdr; no state is written into this checkout. A completion without reliable sequence/state data is skipped rather than guessed.

## Installing from GitHub

Once this repository has been published to GitHub, other users can install it with:

```sh
herdr plugin install OWNER/herdr-bark-notify
herdr plugin config-dir herdr.bark-notify
```

`OWNER` is a placeholder, not an already published repository. Create `config.json` in the printed directory using the minimal JSON above, then use the registered `check` and test actions. The GitHub installation does not require `npm install` or a build command.

Herdr plugin registration and enable state are shared across the current user's sessions. Linking is supported while no server is running. For a running server, registration changes apply without restarting it. If Node was installed after the server started, its inherited `PATH` may still need to be refreshed.

## Default square avatars

Version 1.1.0 automatically attaches LobeHub square avatars for **19 of the 23 Herdr 0.9.0 agent kinds**, including corresponding brand avatars where a dedicated CLI avatar is unavailable. OMP, Droid, Maki and Muse retain Bark’s default icon. No extra configuration is required. See the [complete coverage table, sources and overrides](docs/AVATARS.md).

To disable default avatars, set `"notification": { "icon": null }`. Your existing custom `icon` takes precedence. The images are 640×640 PNG logos from LobeHub. They differ from the WebP Avatar package’s background styling; PNG is used because the WebP avatars failed device testing. The final notification mask is controlled by iOS.

## Configuration reference

Only the Bark endpoint is required. The default notification language is **`zh-CN`**; set `"locale": "en"` for English. See [config.example.json](config.example.json) for an extended, copyable example.

| Option | Default | Meaning |
| --- | --- | --- |
| `bark_url` | Required for sending | Full key endpoint, e.g. `https://api.day.app/KEY`, or a `/push` endpoint with `device_key`. |
| `device_key` | Omitted | Required for `/push`; rejected for a key-in-path endpoint. |
| `enabled` | `true` | Master switch for automatic notifications. |
| `locale` | `"zh-CN"` | `"zh-CN"` or `"en"`; controls default status labels and body text. |
| `timeout_ms` | `5000` | Per-attempt deadline, including reading the response body. Integer, 100–10000. |
| `retries` | `1` | Additional attempts after transient errors. Integer, 0–2. |
| `uuremote` | Disabled | UU Remote settings: `enabled`, `anonymous_device_id`, `window_type`, and optional `callback`. See below. |
| `notification` | Built-in templates | Global Bark fields and templates. |
| `statuses` | Both enabled | `done` and `blocked` settings, each with optional `enabled` and `notification`. |
| `agents` | Built-in names | Settings keyed by the exact event `data.agent` value. Each allows `name`, `notification`, `statuses`. |

Unknown options, unsupported template variables and invalid types are errors rather than silently ignored settings. JSON must not contain comments or trailing commas. UTF-8 BOMs, such as those produced by some Windows editors, are accepted.

### Notification fields

| Field | Default / accepted values |
| --- | --- |
| `title` | `{emoji} {agent} · {status_label}` |
| `subtitle` | `{workspace} / {pane}` |
| `body` | `{message}\nAgent: {agent_id}\nPane: {pane_id}`; rendered body must contain visible text. |
| `group` | `herdr-{agent_id}`; separates agents in Bark. |
| `sound` | Omitted, letting Bark use its default. Set a Bark sound name, e.g. `bell`, `minuet`, `calypso`, `alarm`. |
| `icon` | Defaults to the matching LobeHub square avatar when available. Override with a URL or disable with `null`. |
| `url` | Optional tap destination. Explicit values override the generated UU Remote link; `null` or `""` removes it. |
| `level` | Optional: `active`, `passive`, `timeSensitive`, `critical`. Availability depends on Bark and iOS permissions. |
| `call` | Since 1.2.0: `"1"` or `1` repeats the ringtone for about 30 seconds; `"0"` or `0` disables repetition. Omitted by default. |
| `volume` | Since 1.2.0: number from 0 to 10, including decimals; controls `critical` alert volume only. Omitted by default (Bark uses 5); `0` is zero volume. |
| `badge` | Optional integer, 0–99999. |
| `isArchive` | Optional `0` or `1`. Omitted means Bark app settings decide. |
| `copy` | Optional text to copy from the notification. |

String fields support the variables below, except `level` and `call`, which accept only their listed values. Use `null` to remove any inherited optional field; `""` also removes optional text fields, but is not accepted for `level`, `call` or numeric fields. Do not remove or empty `body`. This plugin intentionally exposes a subset of Bark's API; arbitrary extra JSON fields are not forwarded.

### Open UU Remote from a notification

To connect directly to a particular computer when tapping a notification, merge this fragment into your existing `config.json`, preserving your Bark endpoint and other settings. Supply the identifier returned by device authorization:

```json
{
  "uuremote": {
    "enabled": true,
    "anonymous_device_id": "RAW_ID_FROM_BINDING_CALLBACK",
    "window_type": 0,
    "callback": ""
  }
}
```

| Field | Meaning |
| --- | --- |
| `enabled` | Boolean, default `false`. Disables generated links when false. |
| `anonymous_device_id` | Optional non-empty string. Omit to open the app; supply to generate a `uuremote://external/device/control` link. Supply the raw value; the plugin encodes it. |
| `window_type` | Integer `0` (default, fullscreen) or `1` (picture-in-picture). Enabling PiP requires a device identifier. |
| `callback` | Optional string. Omission leaves the parameter out; explicit `""` preserves a trailing `&callback=`. Non-empty values must be URLs with scheme and host, e.g. `myapp://controlresult`; the plugin encodes them. Enabling a non-empty callback requires a device identifier. |

For example, the raw identifier `opaque+/=` produces `uuremote://external/device/control?anonymous_device_id=opaque%2B%2F%3D&window_type=0&callback=` with the configuration above. When copying an identifier from an existing link, URL-decode that parameter once (`%2F` → `/`, `%2B` → `+`, `%3D` → `=`). Do not put an entire link or an already encoded value in `anonymous_device_id`. An existing complete link can also be used unchanged as `notification.url`.

For app-only navigation without a specific computer, use `"uuremote": { "enabled": true }`; notifications will use `uuremote://external`.

The [official UU Remote guide](https://github.com/netease-uuyc/uuremote-integration-guide) requires mobile client **4.42.0+** and supports Windows/macOS control targets. iPhone PiP requires iOS 18+ and PiP support.

Obtain `anonymous_device_id` through the guide's `device/authorize` flow. A normal device code, password or Herdr pane ID cannot replace it. This host-side plugin does not receive mobile callbacks; follow the Webhook.site walkthrough below to capture the result, or implement a callback receiver using the official client examples.

The generated link is a default `url`, subject to global, status, agent and agent-status notification overrides. Remove an existing `notification.url` to use the generated link, or set `url` to `null` or `""` to remove navigation for selected notifications. The protocol's `callback` is optional: only PiP with a valid callback URL returns results; fullscreen never calls back. Omit it when no callback is needed. This plugin includes configured callbacks in links but does not receive or wait for remote-control results. Bark acceptance does not verify a phone launch or connection. The link targets a computer without selecting a Herdr pane.

Use `check` to validate settings and `preview` to inspect the generated `url`. Direct-connect identifiers are included in previews and notifications sent to your Bark service; treat those outputs as device configuration data. Saved settings take effect on the next invocation.

#### Capture device parameters with Webhook.site: complete walkthrough

This workflow combines the [UU Remote authorization callback protocol](https://github.com/netease-uuyc/uuremote-integration-guide#2-设备绑定) with [Webhook.site's HTTP request inspector](https://docs.webhook.site/#what-is-webhooksite). Use an HTTPS receiver as the authorization callback; after choosing a computer, the phone's browser visits that URL with the device identifier in its query string. No callback server deployment is needed.

```text
Webhook.site receiver → open authorization link on phone → choose computer in UU Remote
→ browser visits callback → extract anonymous_device_id → configure plugin → tap Bark notification
```

Have a signed-in mobile client, a supported Windows/macOS computer in the account, and a computer with Node.js 22+. First confirm that the phone can connect to the target through UU Remote normally. `YOUR_WEBHOOK_UUID`, `YOUR_NONCE` and `opaque+/=` below are demonstration values.

**1. Copy a temporary HTTPS receiver**

Open [Webhook.site](https://webhook.site/) on your computer, copy **Your unique URL**, and keep the request inspector open:

```text
https://webhook.site/YOUR_WEBHOOK_UUID
```

Use this receiver, not the address bar's `#!/view/` dashboard URL or the unique email address. Its UUID identifies the temporary inbox, not your computer. See the [official explanation of the two URL formats](https://docs.webhook.site/#im-getting-a-405-method-not-allowed-whats-wrong).

This sends the device identifier to Webhook.site. Anyone who knows a free receiver's ID can view its data. Keep the receiver, callback request and identifier private; do not enter Bark keys or remote-control passwords there. See [Webhook.site's privacy explanation](https://docs.webhook.site/#is-my-data-private).

**2. Generate an authorization link**

Replace `YOUR_WEBHOOK_UUID` with the UUID from your receiver and run this locally in macOS/Linux or Windows PowerShell. It prints text without making a request:

```sh
node -e "const callback = 'https://webhook.site/YOUR_WEBHOOK_UUID'; const nonce = require('node:crypto').randomUUID(); console.log('nonce=' + nonce); console.log('uuremote://external/device/authorize?callback=' + encodeURIComponent(callback) + '&nonce=' + nonce);"
```

Keep the first line's nonce and copy the entire second line. Its shape is:

```text
uuremote://external/device/authorize?callback=https%3A%2F%2Fwebhook.site%2FYOUR_WEBHOOK_UUID&nonce=YOUR_NONCE
```

Use **`device/authorize`** at this stage. The callback is required and must be encoded once; do not pre-encode the receiver before putting it in the command. The nonce correlates this attempt with its result and is not part of the final plugin configuration.

**3. Open it on the iPhone and choose a computer**

Copy the complete link to your phone. Create a temporary shortcut with a **URL** action containing the link, followed by **Open URLs** using the first action's output. Run it and accept the prompt to open UU Remote. Apple documents this [URL scheme invocation method](https://support.apple.com/guide/shortcuts/apd68802640c/ios).

Select the intended computer in UU Remote and confirm. Allow the browser to open the HTTPS callback if prompted. A blank response page or receipt message is not the request inspector; return to Webhook.site on your computer. The phone needs network access to Webhook.site. Do not try to fetch the `uuremote://` link with desktop `curl`.

**4. Extract the identifier from the callback request**

Select the new request in Webhook.site's left-hand list and inspect its URL/query parameters. Expect a **GET**; an empty body is normal. Match its nonce to step 2 before using the result:

| Parameter | Meaning |
| --- | --- |
| `anonymous_device_id` | The encrypted identifier returned on success; retain its raw value. |
| `nonce` | Correlates the result with this attempt rather than an older request. |
| `error` | Authorization failed; resolve the error instead of treating it as an identifier. |

For example, a successful request might look like this:

```text
https://webhook.site/YOUR_WEBHOOK_UUID?anonymous_device_id=opaque%2B%2F%3D&nonce=YOUR_NONCE
```

If the query-parameter display already shows `opaque+/=`, copy it directly. Alternatively, replace `PASTE_FULL_CALLBACK_REQUEST_URL` below with the complete HTTPS request URL from the request details, not the dashboard URL:

```sh
node -e "const p = new URL('PASTE_FULL_CALLBACK_REQUEST_URL').searchParams; console.log(JSON.stringify({ nonce: p.get('nonce'), error: p.get('error'), anonymous_device_id: p.get('anonymous_device_id') }, null, 2));"
```

Confirm the nonce matches, `error` is `null`, and the identifier is non-empty. `URL.searchParams` decodes once: **do not call `decodeURIComponent` again**. Preserve `+`, `/` and `=`. If unexpected spaces appear, extract again from the original request URL instead of guessing replacements.

**5. Merge the settings into the active configuration**

Find the directory on the machine running this plugin:

```sh
herdr plugin config-dir herdr.bark-notify
```

Edit its `config.json` and merge this object, replacing the demonstration ID with the extracted raw value. Keep existing Bark credentials, sounds and agent settings:

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

Use `window_type: 0` for fullscreen, or `1` for PiP subject to the requirements above. The callbacks have different purposes: **the authorization link needs the Webhook.site receiver; the plugin's callback is for remote-control results and is left empty or omitted here.** Normal direct connections no longer depend on Webhook.site after extraction.

Remove any `notification.url` override that should give way to the generated link. Obtain an identifier for each target; repeat authorization if account changes or device unbinding invalidate the saved identifier.

**6. Validate and send one test notification**

From the repository directory, on macOS/Linux:

```sh
bark_config_dir="$(herdr plugin config-dir herdr.bark-notify)"
node notify.mjs check --config "$bark_config_dir/config.json"
node notify.mjs preview --config "$bark_config_dir/config.json"
```

On Windows PowerShell:

```powershell
$barkConfigFile = Join-Path (herdr plugin config-dir herdr.bark-notify).Trim() 'config.json'
node .\notify.mjs check --config $barkConfigFile
node .\notify.mjs preview --config $barkConfigFile
```

The preview's `url` should contain `/device/control`, the encoded identifier and `window_type=0`, plus `&callback=` when explicitly configured empty. These checks make no network request. Once satisfied, send one **real test notification** below; in PowerShell replace the config path argument with `$barkConfigFile`:

```sh
node notify.mjs test --status done --config "$bark_config_dir/config.json"
```

Tap the notification and confirm the correct computer opens. Subsequent automatic notifications read the saved settings without a restart. You can then remove the temporary shortcut and clear the captured requests in Webhook.site. Free receivers have expiry and request limits; create a new one if needed for later authorization. See [Webhook.site retention](https://docs.webhook.site/#how-long-is-data-stored-on-webhooksite).

**Troubleshooting**

| Symptom | Check |
| --- | --- |
| No device picker | Check client version and login; use the phone's URL → Open URLs actions, `device/authorize`, and an unbroken link. |
| Browser opens but no binding result appears | Check receiver versus `#!/view/` URL, matching UUID, expiry and request limits. A plain visit without ID/error parameters is not a result. |
| `error=no_device` | The current account needs a supported Windows/macOS target. |
| `error=user_cancel`, `timeout` or `superseded` | Cancellation, timeout or a replacement request; finish login and retry one attempt at a time with a new nonce. |
| Nonce mismatch | Select the matching request or authorize again before saving anything. |
| Notification only opens the app | Check the active config directory, missing identifier, and `notification.url` overrides. |
| Device missing or connection fails | Check copying/encoding, account, online status and permission to control; reauthorize after unbinding/account changes. Binding does not prove current connectivity. |

### Repeated ringing and critical volume (1.2.0)

Merge this fragment into your existing `config.json` to enable about 30 seconds of ringing at volume 5 for both notification statuses:

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

For blocked notifications only, place these four fields under `statuses.blocked.notification` instead. The same fields work under `agents.<id>.notification` and `agents.<id>.statuses.blocked.notification`; normal override precedence applies. Merge with existing fields rather than replacing your endpoint, key or other settings. The next plugin invocation reads the saved configuration.

`volume` is a JSON number; quoted numbers such as `"2"` are rejected. `call` accepts `0`/`1` as strings or numbers, not booleans or templates. Both are sent as strings because Bark's notification extension reads strings. A higher-priority `call: "0"` disables inherited repetition; `call: null` and `volume: null` omit the inherited fields. Volume is not a control for ordinary `active` notifications. No new default volume, critical level or repeated ringing is enabled by upgrading. The extended example sets `call: "0"` and `volume: 5`; that volume takes effect only if you also select `critical`.

Bark's `call` creates an approximately 30-second ringtone; it does not ring indefinitely until you open the notification. `critical` behavior depends on the app's Critical Alerts permission. The plugin does not add a reminder loop or an acknowledgement service. See [Bark parameters](https://github.com/Finb/Bark/blob/master/docs/tutorial.md), [ringtone implementation](https://github.com/Finb/Bark/blob/master/NotificationServiceExtension/Processor/CallProcessor.swift) and [critical volume handling](https://github.com/Finb/Bark/blob/master/NotificationServiceExtension/Processor/LevelProcessor.swift).

### Template variables

| Variable | Meaning |
| --- | --- |
| `{agent}` | Configured name → event `display_agent` → built-in friendly name → raw agent ID → `Agent`. |
| `{agent_id}` | Raw agent identifier; `unknown` when unavailable. |
| `{display_agent}` | Event's display label, or empty. |
| `{status}` | `done` or `blocked`. |
| `{status_label}` | `完成` / `需要处理`, or `Done` / `Needs attention`. |
| `{emoji}` | `✓` or `⚠`. |
| `{message}` | Localized default status sentence. |
| `{workspace}` | Event workspace label if present → matching context label → workspace ID → localized fallback. |
| `{workspace_id}` | Event workspace ID, with Herdr environment fallback. |
| `{pane}` | Event `title` / `pane_title` → matching pane label, title or terminal title from Herdr → pane ID → localized fallback. |
| `{pane_id}` | Event pane ID, with Herdr environment fallback. |
| `{tab}` / `{tab_id}` | Event fields or matching focused-pane context; empty when unavailable. |

Templates use literal replacement, not executable expressions. Substitution happens once: text inside an agent or pane name is never evaluated as another template. Each `title`, `subtitle` and `group` is capped at 240 UTF-8 bytes; `body` is capped at 1600 bytes with an ellipsis. The rendered notification fields must fit within 3000 bytes of JSON to leave room for APNs overhead. This is a conservative plugin limit, not a guarantee about every server's final APNs envelope.

Workspace context is used only when its workspace ID matches the event. Focused-agent and tab context is used only when its pane ID matches. If information is missing, IDs are shown rather than guessing from another focused pane. If an automatic event has no title, the plugin queries only that pane using `HERDR_BIN_PATH pane get <event-pane-id>`, with a one-second deadline and matching-ID checks. Failure falls back to the ID. Pane names are supplied by Herdr; the plugin does not summarize or invent task titles.

### Agent and status customization

Notification fields merge in this order, with later settings overriding earlier ones:

1. Built-in defaults, including the UU Remote link when enabled.
2. Global `notification`.
3. `statuses.<status>.notification`.
4. `agents.<agent_id>.notification`.
5. `agents.<agent_id>.statuses.<status>.notification`.

Status enable switches use the agent-specific value first, then the global status value, then `true`. The top-level `enabled: false` always blocks automatic notifications.

For example, disable completion notifications globally, keep Codex completions, and use a distinct alarm for blocked Codex tasks:

```json
{
  "bark_url": "https://api.day.app/YOUR_BARK_KEY",
  "locale": "en",
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

Agent keys are exact and case-sensitive. Built-in display names cover all 23 Herdr 0.9.0 kinds; [avatar/name aliases](docs/AVATARS.md) do **not** merge configuration entries. Use the raw `Agent:` value from your notification when choosing an `agents` key. To preserve custom Herdr `display_agent` labels, omit `agents.<id>.name`.

### Self-hosted Bark and environment variables

```json
{
  "bark_url": "https://bark.example.com/push",
  "device_key": "YOUR_BARK_KEY",
  "locale": "en"
}
```

Reverse-proxy path prefixes are supported, for example `https://example.com/bark/push`. Use the final endpoint, not a URL that redirects. Key-in-path URLs must stop at the key: do not paste Bark's sample `/KEY/title/body` URL. Query strings, URL userinfo and fragments are rejected; put notification options in `notification` instead. HTTPS is recommended. HTTP is allowed for self-hosted or local development, but transmits the key and notification without TLS.

`BARK_URL` and `BARK_DEVICE_KEY`, when non-empty, override the corresponding JSON fields. A config file is optional if `BARK_URL` is supplied; if a config file exists, it must still be valid. The plugin does not load `.env` files. Environment variables must be inherited by the **Herdr server**, so exporting them later inside an individual pane does not necessarily change plugin execution. A `config.json` file is usually easier and takes effect on the next invocation.

## Managing the plugin

```sh
herdr plugin disable herdr.bark-notify
herdr plugin enable herdr.bark-notify
herdr plugin action list --plugin herdr.bark-notify
herdr plugin log list --plugin herdr.bark-notify
herdr plugin unlink herdr.bark-notify
```

Disable stops automatic hook execution through Herdr. You can also set `enabled: false` in `config.json`, which leaves the plugin actions registered. Explicit `test` commands bypass the config switches.

`unlink` unregisters a local checkout and leaves its source files intact. For a GitHub-managed installation, use `herdr plugin uninstall herdr.bark-notify`; Herdr removes its managed checkout. Herdr preserves plugin configuration and state; remove your credentials there manually if you want a complete cleanup.

Linked JavaScript and config changes apply on the next invocation. After editing `herdr-plugin.toml`, re-register with `herdr plugin link .`. To switch a linked checkout to a GitHub installation, unlink first. To update a GitHub-managed installation, reinstall it; Herdr v1 has no separate `plugin update` command. Back up custom changes in managed checkouts before reinstalling.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node` cannot be launched | Node 22+ must be on the server's `PATH`, including on remote hosts. A shell version manager may only initialize in interactive shells. |
| No plugin listed | Run `herdr plugin link .` from this checkout and check Herdr's version. |
| Cannot read config / missing endpoint | Get the path with `herdr plugin config-dir herdr.bark-notify`; create `config.json` there, not in the checkout. |
| Example key error | Replace `YOUR_BARK_KEY` with your actual Bark key. |
| Invalid JSON or unknown option | Use strict JSON, the documented names and types, and run `check`. Errors omit raw values to protect credentials. |
| Test succeeds, automatic notifications do not | Use Herdr 0.9.5+, check plugin enable state and `enabled`, then inspect plugin logs. Focused completions may arrive as `idle`; they notify only after the event pane's `agent get` confirms matching completion/state-change sequences. Startup idle, session changes, missing fields and failed lookups are intentionally skipped. |
| Only workspace/pane IDs are shown | The host did not provide matching labels, or no pane title was available. Set a meaningful pane title in Herdr. |
| HTTP 4xx | Check the key and endpoint; use `/push` only with `device_key`. HTTP 429 is retried. |
| HTTP 5xx / network error / timeout | Check Bark availability, DNS, firewall, and HTTPS trust. Redirects are refused; configure the final endpoint. |
| Bark rejected the notification | HTTP succeeded but Bark's JSON `code` was not `200`. Check the endpoint/key/server. |
| Notification sent but phone is quiet | Bark acceptance is not proof of iPhone delivery. Check iOS notification permissions, Focus mode, connectivity and Bark sound settings. |
| Repeated notifications | Completion hooks deduplicate by pane/session and sequence. Network retries can still duplicate a push if the first delivery succeeded but its acknowledgement was lost. |
| Remote agents do not notify | Install Node, link/install the plugin, and configure Bark on the machine running that Herdr server. Local configuration is not copied to remote hosts. |

Requests retry network errors, timeouts, HTTP 429/5xx, and integer Bark response codes 429/5xx. Other rejections and invalid response JSON fail immediately. Retries wait 250 ms, then 500 ms; `Retry-After` is not interpreted. Maximum configured runtime for network attempts is roughly 30.75 seconds plus process overhead. There is no durable queue or eventual-delivery guarantee. Set `retries: 0` to avoid automatic retransmission.

Automatic hook success, ignored events and disabled notifications exit `0`; invalid input/configuration and failed sends exit `1`. Ordinary errors contain neither the endpoint/key nor raw Bark response text. Preview output intentionally contains the notification itself and may be recorded in Herdr logs. The plugin sends labels, IDs and configured content to your chosen Bark service; it does not read terminal transcripts or selected text.

## Development and validation

```sh
npm run check
npm test
npm run test:coverage
node notify.mjs preview --event fixtures/done.json
node notify.mjs preview --event fixtures/blocked.json
node notify.mjs --help
```

Tests use local HTTP servers and synthetic events, so they need neither real keys nor an iPhone and do not send notifications externally. They cover configuration, template precedence, identity/focus separation, Unicode, request payloads, HTTP and application failures, retries, deadlines, redirect refusal, CLI invocation and credential-safe errors. See [docs/VALIDATION.md](docs/VALIDATION.md) for actual verification results and limits.

```text
herdr-plugin.toml       Host registration, event hook, actions
notify.mjs             CLI and event entrypoint
src/config.mjs         Config loading, initialization, validation
src/message.mjs        Identity resolution, localization, templates
src/agents.mjs         Herdr agent names and default square avatar URLs
src/bark.mjs           Bounded HTTP delivery and retries
src/herdr.mjs          Read-only pane/completion lookups
src/dedupe.mjs         Locked, persistent completion claims
config.example.json    Extended configuration example
fixtures/              Sample Herdr events
test/                  Node built-in test suite
```

The optional real-host smoke test requires Python 3 and Herdr on macOS/Linux:

```sh
python3 scripts/verify_herdr.py
```

It creates an isolated temporary config/state directory and headless test server, exercises actions and background agent transitions, then removes its own test server and files. It does not register the plugin in your normal Herdr profile.

## Sources

The implementation was checked against the installed Herdr 0.9.0 schema (`herdr api schema --json`), [Herdr plugin documentation](https://herdr.dev/docs/plugins/), [Herdr socket API](https://herdr.dev/docs/socket-api/), and [Bark's HTTP API documentation](https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md). The [Telegram notification example](https://github.com/ogulcancelik/herdr-plugin-examples/tree/main/agent-telegram-notify) informed the integration approach; this repository implements its own Bark configuration and delivery logic.

Licensed under [MIT](LICENSE).
