---
description: "Host half of the Desktop audit workbench: the pack's workbench manifest, each Workspace's Project Archive, and System Login Status checks, for maintainers changing what the workbench page reads."
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-workbench`

English | [中文](README.zh.md)

## Summary

The Host half of the Desktop 审计工作台 (audit workbench). The row provides `ctx.auditWorkbench`, whose Remote methods read the audit plugin pack's workbench manifest, read the Project Archive `审计方案/00_项目档案.json` of every Workspace, fill the manifest's prompt templates, check and renew System Login Status through each system's own session and login tools, read each Auditee's Organization Scope file, and open a recorded Kickoff Task output or an Organization Scope's members table. [`dsh-client-ui-audit-workbench`](../../client/ui-audit-workbench/README.md) shows these on the workbench page. The package reads the Project Archive only; the audit Session's main agent writes it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

[`dsh-audit-desktop`](../audit-desktop/README.md) inserts the row at the profile root beside the page row. It reads the same pack directory as [`dsh-audit-plugin-pack`](../audit-plugin-pack/README.md).

```yaml
- id: audit-workbench
  name: '@deepseek-ai/dsh-audit-workbench'
```

| Field | Default | Meaning |
|---|---|---|
| `root` | `$DSH_HOME/audit-plugins` | Pack directory; absolute or `~`-prefixed |
| `checkTimeoutMs` | `120000` | Deadline for one session check, server start included |
| `loginTimeoutMs` | `600000` | Deadline for one login tool call, which waits for the person to log in |

### Workbench manifest

The pack's root `package.json` names the manifest file in `dsh.auditWorkbench`, relative to the pack directory. Without the field the page shows the Project Archives only. An invalid manifest shows its first problem on the page.

```json
{
  "version": 1,
  "systems": [
    {
      "id": "dac",
      "title": "数字审计数据中心",
      "description": "",
      "server": "daudit",
      "check": { "tool": "check_session", "arguments": {}, "ready": { "path": ["valid"], "equals": true }, "message": ["message"] },
      "login": { "tool": "get_session", "arguments": {} }
    }
  ],
  "models": [
    { "id": "private-gain", "title": "化公为私排查", "description": "", "prompt": "在 {{projectDir}} 中启动内置模型「{{model}}」。" }
  ],
  "prompts": {
    "kickoff": "在 {{projectDir}} 中开始一个新的审计项目。",
    "backfill": "为 {{projectDir}} 补建项目档案。",
    "rerun": "重新运行开工任务 {{taskId}}（{{taskType}}）。"
  }
}
```

| Field | Meaning |
|---|---|
| `systems[].server` | `serverName` of the pack's MCP client row that serves the system |
| `systems[].check` | Session tool and arguments; the system is ready when the structured result field at `ready.path` equals `ready.equals`; `message` is the key path of the text that explains a login that is not usable |
| `systems[].login` | Optional login tool; without it the page offers no login button |
| `models[]` | Built-in Models; `prompt` starts one in a new Session |
| `prompts` | Optional templates for a new audit project, an archive backfill, and a failed Kickoff Task rerun |

Ids use letters, digits, `_`, and `-`. Templates use `{{name}}` placeholders, and a template that names a placeholder its kind does not supply fails validation:

| Kind | Placeholders |
|---|---|
| `kickoff`, `backfill` | `projectDir` |
| `rerun` | `projectDir`, `auditType`, `auditees`, `periodFrom`, `periodTo`, `taskType`, `taskId`, `taskSummary` |
| `models[].prompt` | `projectDir`, `auditType`, `auditees`, `periodFrom`, `periodTo`, `model` |

### Organization Scope file

The kickoff writes one Organization Scope file per organization Auditee under `工作区/开工/组织范围/` and records its path, relative to the Project Directory, in the archive's `被审计单位[].组织范围文件`. `orgScope` reads it for the page's organization tree; `openMembersTable` opens the members table it names. Unknown keys are ignored; a missing required key, another `格式版本`, an unknown `归属`, a first node other than `起点`, a repeated code, or a node listed before its parent makes the whole file unreadable, and the page shows why.

| Field | Meaning |
|---|---|
| `格式版本` | Must be `1` |
| `起点` | `编码` and `名称` of the starting node, which is the first node |
| `导出时间`, `名下编码表` | Export time; file name of the members table in the scope file's directory, optional |
| `节点[]` | The whole subtree in preorder: `编码`, `名称`, `上一级编码`, `归属` (`名下`, `别家`, `归不到`, or `不纳入`), and optional `所属二级单位`, `定归属的来源`, `来源不一致`, `利润中心` (the node's own), and `说明` |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The row is a loader group. It provides the service, then mounts the pack's `audit-toolkit` group again under `audit-workbench-` ids, keeping the pack's Host plugin and rewriting each stdio [`dsh-mcp-client`](../../mcp/mcp-client/README.md) row to `@deepseek-ai/dsh-audit-workbench/server` with the same launch fields. The loader therefore evaluates the pack's own `!!js` expressions, and each rewritten row records the server's command, arguments, directory, and environment on the service without starting the server or registering a tool. A session check starts the server with those values outside any Session, calls one tool, and closes the server; aborting the call, as when the page withdraws, closes the server.

The manifest and the pack are read again on every overview, prompt, and check, so a newly imported pack shows on the next page open. The Project Archive reader keeps the fields it knows and reads a missing or mistyped field as empty; an archive whose `version` is newer than the known Archive Version still shows its basic information, and the page says that some fields may be missing. A file that is not JSON or not an object reads as unreadable with the cause. `openOutput` opens a recorded output only when its real path is a file inside the Project Directory, and `openMembersTable` applies the same check to a members table. An Organization Scope file is read only when its real path lies inside the Project Directory.

Failures cross the Remote as `auditWorkbench/not-found` (a missing Workspace, archive, Kickoff Task, output, Auditee, members table, or Built-in Model), `auditWorkbench/no-prompt`, `auditWorkbench/output-refused`, and `auditWorkbench/open-failed`. A session check never rejects: a system missing from the manifest or without a mounted server, a deadline, a failed call, and an unreadable result each return a failed reading with the reason.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the package reads files and calls the pack's session tools for the page; nothing here reaches a model request. A prompt the page prepares reaches a model only after the person sends it from a Session's input box, as an ordinary user message.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Each check starts its own server** — a session check or login starts a fresh server process, so the first check after a launch waits for the server's Python environment; servers inside Sessions are separate processes.
- **Only stdio servers are checked** — a pack MCP client row with another transport gets no launch-value row, and its system reads as unavailable.
- **The manifest comes from the pack** — the page lists no systems, Built-in Models, or prompts until the audit-plugins release ships a manifest.
- **Organization Scope files come from the pack** — until the audit-plugins kickoff writes them, the organization scope view says that the project has none.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
