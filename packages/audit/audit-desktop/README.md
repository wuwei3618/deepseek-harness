---
description: "The Desktop audit agent preset, for maintainers changing what a Desktop audit session offers."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-desktop`

English | [中文](README.zh.md)

## Summary

The audit agent of the `audit-desktop` profile that Desktop boots. The layer inserts the `audit` agent preset, makes it the registry default, and switches off the four shipped presets, so new sessions can only start in audit mode. It also switches off the Web rows for plugin and preset authoring, the DeepSeek Harness development context, the DeepSeek account settings page, and product analytics. It replaces the official brand artwork with the CSCEC8B seal.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Desktop reads the `audit-desktop` template from [`dsh-official-bundles`](../../util/official-bundles/src/bundles.ts) for its reserved profile and for crash recovery, so no configuration is needed. The template order is `dsh-base`, `dsh-web-app`, [`dsh-audit-org-defaults`](../audit-org-defaults/README.md), this bundle, then the optional session search and voice input bundles, which stay on because the plugin manager that would switch them is off.

| Row | Effect |
|---|---|
| `preset-audit` | inserted: the 审计模式 preset with the audit persona and file tools without edit |
| `agent-preset-registry` | `default: audit` |
| `preset-standard`, `preset-ptc`, `preset-minimal`, `preset-cordis` | switched off; without `cordis` the Creator entry points are unavailable |
| `ui-plugin-manager`, `ui-agent-preset`, `entry-customization`, `ui-cordis`, `cordis-host-runner`, `cordis-client-runner`, `cordis-inspect-providers` | switched off: no plugin or preset authoring |
| `harness-dev-context` | switched off |
| `ui-settings-account`, `account-controller` | switched off |
| `desktop-product-telemetry`, `product-analytics` | switched off |
| `system-prompt` | `includeHarnessIdentity: false` and the audit persona at the root |
| `browser-use`, `browser-use-playwright-mcp` | inserted: [Playwright MCP](../../experimental/browser-use-playwright-mcp/README.md) in `attach` mode on Desktop's per-Session Sidebar browser endpoint; both rows stay off when `DSH_DESKTOP_BROWSER_CDP_ENDPOINT` is unset, as outside Desktop |
| `ui-brand-official` → `ui-brand-cscec8b` | the official artwork is switched off; [`dsh-client-ui-brand-cscec8b`](../../client/ui-brand-cscec8b/README.md) shows the seal and 八局审计智能体 |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) patches [`dsh-web-app`](../../bundle/web-app/README.md) and `dsh-base` rows by id and inserts the preset row. The preset mounts the persona, workspace instructions, time context, the shell, `read`, `read_image`, and `write`, search, jobs, [`dsh-audit-skills`](../audit-skills/README.md) with the `skill` tool, compaction, ask-user, todo, web, and present tools. It mounts no edit, delegation, plan, schedule, or plugin tools.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Audit preset

#### What the model sees

The same audit persona as [`dsh-audit-agent`](../audit-agent/README.md), without the DeepSeek Harness identity line or the harness development context. The tool list holds only the tools the preset mounts plus, on Desktop, the Playwright MCP browser tools, and the skill catalog lists only the audit skills. The persona asks the model to describe and get confirmation for any action that submits, approves, pays, signs, or sends something on the user's behalf.

#### Token effect

One paragraph of persona text; fewer tool schemas than the standard preset.

#### KV Cache effect

Stable for a session. A changed preset revision applies to sessions created afterwards.

### Sidebar browser tools

#### What the model sees

The upstream Playwright MCP tools. They list and operate only the Browser tabs of the current Session's Sidebar, and a page the model opens appears there as a new visible tab with the sign-ins of the workspace.

#### Token effect

The Playwright MCP tool schemas; page snapshots and screenshots are ordinary tool results.

#### KV Cache effect

The tool list is fixed when the Session's browser connection initializes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Agent pages need the Session on screen** — a page the agent opens appears in the Session's Sidebar; while that Session is not open in the window, the request fails after 20 seconds.
- **Screenshots need an image-capable model** — with a text-only model the agent works from page snapshots.
- **Existing Desktop profiles keep their bundle list** — Desktop initializes its reserved profile only when it is absent, so a profile created by an earlier Web-based build keeps `dsh-web-app` alone.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
