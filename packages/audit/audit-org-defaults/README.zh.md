---
description: "在 dsh-base 行上设置的审计部署默认值，供修改所有审计 profile 权限的维护者阅读。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-org-defaults`

[English](README.md) | 中文

## 概述

所有审计 profile 共用的部署默认设置。该层默认把写入限制在会话工作目录内并拒绝所有审批，提供 `workspace-write` 和 `danger-full-access` 两个权限预设，并关闭 DeepSeek 账号平台及其模型路由、会话遥测上报、会话日志和插件清单这两个请求扩展，以及插件安装。它只修改 [`dsh-base`](../../bundle/base/README.zh.md) 的行，因此在每个应用 bundle 之上都能原样生效。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

[`dsh-official-bundles`](../../util/official-bundles/src/bundles.ts) 中的 `audit`、`audit-sdk`、`audit-acp` 和 `audit-desktop` profile 模板把本 bundle 排在应用 bundle 之后。之后的层仍可替换它修改的任一行：profile 的 `cordis.patch.yml`、`$DSH_HOME/cordis.patch.yml` 和 `--patch` 叠加层都在它之后生效。

| 行 | 效果 |
|---|---|
| `sandbox-policy` | `mode: workspace-write`：默认只能写工作目录和私有临时目录；`DSH_PERMISSION_MODE` 和 `--add-dir` 不再放宽它 |
| `approval` | `policy: never`，被拒绝的命令不能通过审批在更宽的沙箱中重试 |
| `permission` | `workspace-write`（新会话的默认值）和 `danger-full-access`，`--permission-mode` 和权限菜单可以选择；桌面端选择完全权限前要求确认风险 |
| `deepseek-account`、`llm-deepseek-account` | 关闭：没有账号登录，也没有账号模型路由 |
| `session-telemetry-otel` | 关闭 |
| `session-log-deepseek`、`plugin-package-inventory-deepseek` | 关闭：官方 DeepSeek API 请求既不附带会话日志，也不附带插件包列表 |
| `plugin-manager`、`tool-plugin-manager` | 关闭：人和模型都不能安装插件 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[`cordis.patch.yml`](cordis.patch.yml) 是一组行补丁，没有 insert。补丁会替换所在行的整个 `config`，因此 `sandbox-policy`、`approval` 和 `permission` 行会重述它们保留的每个键。`config-editor` 行保持启用，因为 settings 服务要等待它。

</details>

-----

<a id="model-experience"></a>
## 模型体验

间接影响：[沙箱策略](../../sandbox/sandbox-policy/README.zh.md)和[用户审批](../../interaction/user-approval/README.zh.md)的运行时上下文段落说明当前沙箱模式和 `never` 审批策略，工作目录之外被拒绝的写入以工具结果的形式到达模型。

#### KV Cache 影响

该层本身不添加请求内容。策略段落在一个会话内保持稳定，因此缓存的前缀在各轮之间保持有效。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **审批一律拒绝，不会询问** — 每个审批请求都返回 `rejected`，包括以后的工具或 MCP 服务器为沙箱重试以外的操作发起的请求。
- **用户补丁层仍然生效** — 编辑 profile 补丁、`$DSH_HOME/cordis.patch.yml` 或传入 `--patch` 的人可以替换这些行；这由发行版启动器锁定和文件权限处理。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
