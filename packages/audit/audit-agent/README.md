---
description: "The audit agent of the command-line audit profiles, for maintainers changing the CLI, SDK, or ACP audit persona and tools."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-agent`

English | [中文](README.zh.md)

## Summary

The audit agent of the `audit`, `audit-sdk`, and `audit-acp` profiles. The headless, SDK, and ACP applications compose their one agent at the profile root without agent presets, so this layer edits [`dsh-base`](../../bundle/base/README.md) root rows: it sets the audit persona without the DeepSeek Harness identity line, removes the edit tool and every delegation tool, and replaces local skill discovery with [`dsh-audit-skills`](../audit-skills/README.md). Commands, new files, and web search stay available under the workspace-only write sandbox that [`dsh-audit-org-defaults`](../audit-org-defaults/README.md) sets.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run one audit task with `dsh audit "<task>"`, serve the SDK with `dsh --profile audit-sdk`, or serve ACP with `dsh --profile audit-acp`. Each template lists this bundle last, so its `system-prompt` row replaces the coding-agent persona of the application bundle.

| Row | Effect |
|---|---|
| `system-prompt` | `includeHarnessIdentity: false` and the audit persona |
| `tool-fs` | `read`, `read_image`, and `write`; no `edit` |
| `tool-subagent-control`, `tool-subagent`, `tool-subagent-fork`, `tool-agent-team`, `tool-workflow` | switched off |
| `skill-filesystem` | switched off: no project or user skill directories |
| `audit-skills` | inserted: the bundled audit skill catalog |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) patches rows by id and inserts one row. The persona text is identical to the `preset-audit` persona in [`dsh-audit-desktop`](../audit-desktop/README.md); the profile tests compare the two.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Audit persona

#### What the model sees

The system prompt starts with the audit persona, which names the assistant 八局审计智能体 (CSCEC8B Audit Agent), asks for evidence with exact locations, forbids changing the material under review, allows working papers and reports as new workspace files, and asks for answers in the language of the request. The DeepSeek Harness identity line is absent. The tool list contains the shell, `read`, `read_image`, `write`, search, jobs, todo, goal, web, and `skill` tools, and the skill catalog lists only the audit skills.

#### Token effect

One paragraph of persona text in place of the one-line coding-agent persona; the removed tool schemas reduce the request size.

#### KV Cache effect

Stable for a fixed profile, model, and tool list. A profile change takes effect in the next process.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The SDK keeps its own help text** — `dsh --profile audit-sdk --help` still prints the `sdk` profile name, because the `sdk-app-startup` row exists only in the SDK application.
- **Bundled Office skills can still appear in the SDK** — the `sdk-app` bundle mounts its Office skills when a packaged runtime supplies them; they register beside the audit skills.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
