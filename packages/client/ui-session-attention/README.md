---
description: "Desktop system notifications when a Session asks a question, requests approval, awaits plan confirmation, or finishes a turn, with two General settings switches."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-attention

English | [中文](README.zh.md)

## Summary

In Desktop, a system notification reports when the agent needs the user or has finished a task. **The agent needs your attention** appears when a Session asks a question, requests approval, or waits for plan confirmation; **The agent has finished the task** appears when a turn ends. The body names the conversation. Clicking a notification brings the window to the front and opens that conversation. While the window is not focused, the Windows taskbar button flashes and the macOS Dock icon bounces once. Two switches in **Settings → General** turn each kind off. Outside Desktop the plugin registers nothing.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the entry in a Desktop profile; the `audit-desktop` profile inserts it as `ui-session-attention`:

```yaml
- id: ui-session-attention
  name: '@deepseek-ai/dsh-client-ui-session-attention'
```

The entry id names the configuration form, so the General settings switches appear only under the id `ui-session-attention`. Both preferences, `attention` and `completion`, are live fields that default to `true`; a profile can set either to `false` in the entry's `config`.

A Session does not notify while it is on screen and the window has focus. An attention request withheld for that reason notifies when the window loses focus while the request is still open. Subagent Sessions never notify. A notification closes when its request is answered, when its Session comes on screen with the window focused, or when a newer notification for the same Session replaces it. After a reload, requests and turns that already existed do not notify again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The browser entry reads the `ui-session-status` snapshot (`uiSession.sessionStatus`) for pending interactions and running state, the Session list for titles, subagent origins, and main-view retention, and window focus events. [`AttentionEngine`](src/client/engine.ts) turns those inputs into notify and withdraw actions: a pending interaction with a new key notifies, and a running-to-stopped edge without a pending interaction reports a finished turn. The entry localizes each action and passes it to `dshDesktop.sessionAttention`, which the Desktop preload exposes only to the application frame.

The Desktop main process validates every notice, keeps at most one Electron `Notification` per Session, and plays the system notification sound. A click focuses the window and sends the Session back to the page, which opens it through `uiWorkspace.openSession`. The types of the bridge live in [`src/types.ts`](src/types.ts) and are exported as `./types`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session UI status](../ui-session-status/README.md) — pending interactions and running state.
- [Settings forms](../ui-settings/README.md) — accepted Host values and ordered writes.
- [Desktop application](../../../apps/desktop/README.md) — the Electron shell and its preload bridge.

<a id="model-experience"></a>
## Model Experience

None, as the notifications contribute no model-visible content.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Notifications need the operating system's permission for the application. An unsigned macOS build may be refused by Notification Center; the failure is logged and the Dock icon still bounces.
- The Web and command-line applications get no notifications, because the plugin relies on the Desktop bridge.
- A notification carries no answer or approval buttons; the request is answered in the conversation.

<a id="dev-note"></a>
### Dev Note

None.
