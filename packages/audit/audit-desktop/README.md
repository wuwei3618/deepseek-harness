---
description: "The Desktop audit agent preset, for maintainers changing what a Desktop audit session offers."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-desktop`

English | [中文](README.zh.md)

## Summary

The audit agent of the `audit-desktop` profile that Desktop boots. The layer inserts the `audit` agent preset, makes it the registry default, and switches off the shipped presets except Creator mode (`cordis`), so new sessions start in audit mode or Creator mode. Creator mode, the plugin manager, and the Cordis runners stay on so that an agent inside Desktop can inspect and change the running plugins, such as the audit workbench. The layer switches off the DeepSeek Harness development context, the DeepSeek account settings page, and product analytics. It replaces the official brand artwork with the CSCEC8B seal.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Desktop reads the `audit-desktop` template from [`dsh-official-bundles`](../../util/official-bundles/src/bundles.ts) for its reserved profile and for crash recovery, so no configuration is needed. The template order is `dsh-base`, `dsh-web-app`, [`dsh-audit-org-defaults`](../audit-org-defaults/README.md), this bundle, then the optional session search and voice input bundles, which are on by default and can be switched in the plugin settings.

| Row | Effect |
|---|---|
| `preset-audit` | inserted: the 审计模式 preset with the audit persona, file tools without edit, spawned subagents and workflows, and the [audit plugin pack](../audit-plugin-pack/README.md) |
| `agent-preset-registry` | `default: audit` |
| `preset-standard`, `preset-ptc`, `preset-minimal` | switched off |
| `plugin-manager` | switched on again after [`dsh-audit-org-defaults`](../audit-org-defaults/README.md) switches it off: Creator mode persists plugins and profile changes through it |
| `harness-dev-context` | switched off |
| `ui-settings-account`, `account-controller` | switched off |
| `desktop-product-telemetry`, `product-analytics` | switched off |
| `system-prompt` | `includeHarnessIdentity: false` and the audit persona at the root |
| `browser-use`, `browser-use-playwright-mcp` | inserted: [Playwright MCP](../../experimental/browser-use-playwright-mcp/README.md) in `attach` mode on Desktop's per-Session Sidebar browser endpoint; both rows stay off when `DSH_DESKTOP_BROWSER_CDP_ENDPOINT` is unset, as outside Desktop |
| `ui-brand-official` → `ui-brand-cscec8b` | the official artwork is switched off; [`dsh-client-ui-brand-cscec8b`](../../client/ui-brand-cscec8b/README.md) shows the seal and 八局审计智能体 |
| `ui-settings-plugin-inventory` | `showModuleName: false`: the Settings Plugin list hides the `@deepseek-ai/dsh-*` package names |
| `audit-workbench`, `ui-audit-workbench` | inserted: the 审计工作台 Sidebar page with System Login Status and every audit project's Project Archive ([Host](../audit-workbench/README.md), [page](../../client/ui-audit-workbench/README.md)) |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) patches [`dsh-web-app`](../../bundle/web-app/README.md) and `dsh-base` rows by id and inserts the preset row. The preset mounts the persona, workspace instructions, time context, the shell, `read`, `read_image`, and `write`, search, jobs, [`dsh-audit-skills`](../audit-skills/README.md) with the `skill` tool, compaction, spawned subagents and workflows, ask-user, todo, web, and present tools, then [`dsh-audit-plugin-pack`](../audit-plugin-pack/README.md), which adds the MCP servers and skills of the audit-plugins release unpacked at `$DSH_HOME/audit-plugins`. The pack skills hand their named roles to spawned subagents and run workflows, and their longest `SKILL.md` is about 33,000 characters, so the preset mounts the spawn subagent and workflow tools and raises the tool result pruner threshold to 40,000 characters, keeping the first 20,000 and the last 8,000. Subagents inherit the preset and its workspace-only sandbox. It mounts no edit, forked or model-selecting subagent, plan, schedule, or plugin tools.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Audit preset

#### What the model sees

The same audit persona as [`dsh-audit-agent`](../audit-agent/README.md), without the DeepSeek Harness identity line or the harness development context. The tool list holds only the tools the preset mounts, the audit plugin pack MCP tools when the pack is unpacked, and, on Desktop, the Playwright MCP browser tools; the skill catalog lists only the bundled audit skills and the pack skills. The persona asks the model to describe and get confirmation for any action that submits, approves, pays, signs, or sends something on the user's behalf.

#### Token effect

One paragraph of persona text. Without the pack, fewer tool schemas than the standard preset; with the pack, about 180 MCP tool schemas more.

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
