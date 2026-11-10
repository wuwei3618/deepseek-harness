---
description: "audit（审计）组地图：命令行和桌面端的审计配置，供修改审计会话能力的维护者阅读。"
kind: "package-group"
---

# audit/ — 审计配置

[English](README.md) | 中文

## 概述

本组把随附的 profile 变成只能在会话工作目录内写入的审计 profile。`audit`、`audit-sdk` 和 `audit-acp` 模板在 headless、SDK 和 ACP 应用 bundle 之上叠加 `audit-org-defaults` 和 `audit-agent`；桌面端启动的 `audit-desktop` 模板在 Web 应用 bundle 之上叠加 `audit-org-defaults` 和 `audit-desktop`。这里的每个包都只按 id 新增行或关闭行，因此上游 bundle 及其录制会话保持不变。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`audit-org-defaults/`](audit-org-defaults/README.zh.md) | 在 `dsh-base` 行上把写入限制在工作目录内，并关闭账号、遥测和插件安装 | —（仅补丁） |
| [`audit-agent/`](audit-agent/README.zh.md) | 在命令行 profile 的根上提供审计 persona、不含编辑的文件工具和审计技能 | —（仅补丁） |
| [`audit-desktop/`](audit-desktop/README.zh.md) | 让 `audit` agent preset 成为桌面端唯一的 preset，并关闭创作、账号和分析相关的行 | —（仅补丁） |
| [`audit-skills/`](audit-skills/README.zh.md) | 内置的通用审计技能 | 注册到 `ctx.skills` |
| [`audit-plugin-pack/`](audit-plugin-pack/README.zh.md) | 在桌面审计 preset 内挂载解压在 Harness 主目录下的 audit-plugins 发布包中的 MCP 服务和技能 | —（loader 分组） |
| [`audit-workbench/`](audit-workbench/README.zh.md) | 桌面端审计工作台背后的 Host 读取：插件包的工作台清单、各工作区的项目档案和系统登录状态 | `ctx.auditWorkbench` |

-----

<a id="related-documentation"></a>
## 相关文档

- [Profile bundle](../bundle/README.zh.md) — 这些补丁层所修改的应用 bundle。
- [权限预设](../../docs/subsystems/permission-presets.zh.md)和[沙箱](../../docs/subsystems/sandbox.zh.md) — workspace-write 预设及其选用的隔离机制。
- [技能](../../docs/subsystems/skills.zh.md) — 提供审计技能的注册表和 `skill` 工具。
- [随附 profile 模板](../util/official-bundles/src/bundles.ts) — 每个审计 profile 的 bundle 顺序。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
