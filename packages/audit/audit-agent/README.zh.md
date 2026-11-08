---
description: "命令行审计 profile 的审计智能体，供修改 CLI、SDK 或 ACP 审计 persona 和工具的维护者阅读。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-agent`

[English](README.md) | 中文

## 概述

`audit`、`audit-sdk` 和 `audit-acp` profile 的审计智能体。headless、SDK 和 ACP 应用在 profile 根上组合唯一的智能体，不使用 agent preset，因此本层修改 [`dsh-base`](../../bundle/base/README.zh.md) 的根级行：设置不含 DeepSeek Harness 身份行的审计 persona，去掉编辑工具和所有委派工具，并用 [`dsh-audit-skills`](../audit-skills/README.zh.md) 代替本地技能发现。在 [`dsh-audit-org-defaults`](../audit-org-defaults/README.zh.md) 设置的只能写工作目录的沙箱下，命令、新建文件和联网搜索仍然可用。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

用 `dsh audit "<任务>"` 运行一次审计任务，用 `dsh --profile audit-sdk` 提供 SDK 服务，用 `dsh --profile audit-acp` 提供 ACP 服务。每个模板都把本 bundle 排在最后，因此它的 `system-prompt` 行会替换应用 bundle 的编程智能体 persona。

| 行 | 效果 |
|---|---|
| `system-prompt` | `includeHarnessIdentity: false` 和审计 persona |
| `tool-fs` | `read`、`read_image` 和 `write`；没有 `edit` |
| `tool-subagent-control`、`tool-subagent`、`tool-subagent-fork`、`tool-agent-team`、`tool-workflow` | 关闭 |
| `skill-filesystem` | 关闭：不读取项目和用户的技能目录 |
| `audit-skills` | 插入：内置审计技能目录 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[`cordis.patch.yml`](cordis.patch.yml) 按 id 修改行并插入一行。persona 文本与 [`dsh-audit-desktop`](../audit-desktop/README.zh.md) 中 `preset-audit` 的 persona 完全相同；profile 测试会比较两者。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 审计 persona

#### 模型看到什么

系统提示词以审计 persona 开头：它把助手称为八局审计智能体（CSCEC8B Audit Agent），要求给出带确切位置的证据，禁止修改被审查的材料，允许把底稿和报告作为新文件写入工作目录，代用户提交、审批、付款、签署或发送任何内容之前必须先征得用户确认，并要求用请求的语言回答。没有 DeepSeek Harness 身份行。工具列表包含 shell、`read`、`read_image`、`write`、搜索、后台任务、todo、目标、联网和 `skill` 工具，技能目录中只有审计技能。

#### Token 影响

用一段 persona 文本代替一行的编程智能体 persona；去掉的工具定义会减小请求体积。

#### KV Cache 影响

在 profile、模型和工具列表固定时保持稳定。profile 的修改在下一个进程中生效。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **SDK 保留自己的帮助文本** — `dsh --profile audit-sdk --help` 仍然打印 `sdk` profile 名，因为 `sdk-app-startup` 行只存在于 SDK 应用中。
- **SDK 中仍可能出现内置 Office 技能** — 打包运行时提供 Office 技能时，`sdk-app` bundle 会挂载它们，它们与审计技能并列注册。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
