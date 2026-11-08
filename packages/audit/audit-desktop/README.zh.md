---
description: "桌面端审计 agent preset，供修改桌面审计会话功能的维护者阅读。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-desktop`

[English](README.md) | 中文

## 概述

桌面端启动的 `audit-desktop` profile 的审计智能体。该层插入 `audit` agent preset，把它设为注册表的默认值，并关闭随附的四个 preset，因此新会话只能以审计模式启动。它还关闭插件和 preset 创作、DeepSeek Harness 开发上下文、DeepSeek 账号设置页和产品分析相关的 Web 行。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

桌面端为自己的保留 profile 和崩溃恢复读取 [`dsh-official-bundles`](../../util/official-bundles/src/bundles.ts) 中的 `audit-desktop` 模板，因此无需配置。模板顺序是 `dsh-base`、`dsh-web-app`、[`dsh-audit-org-defaults`](../audit-org-defaults/README.zh.md)、本 bundle，最后是可选的会话搜索和语音输入 bundle；插件管理已关闭，所以这两项始终开启。

| 行 | 效果 |
|---|---|
| `preset-audit` | 插入：带审计 persona 和不含编辑的文件工具的「审计模式」preset |
| `agent-preset-registry` | `default: audit` |
| `preset-standard`、`preset-ptc`、`preset-minimal`、`preset-cordis` | 关闭；没有 `cordis` 时创作者模式入口不可用 |
| `ui-plugin-manager`、`ui-agent-preset`、`entry-customization`、`ui-cordis`、`cordis-host-runner`、`cordis-client-runner`、`cordis-inspect-providers` | 关闭：不能创作插件或 preset |
| `harness-dev-context` | 关闭 |
| `ui-settings-account`、`account-controller` | 关闭 |
| `desktop-product-telemetry`、`product-analytics` | 关闭 |
| `system-prompt` | 根上设置 `includeHarnessIdentity: false` 和审计 persona |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[`cordis.patch.yml`](cordis.patch.yml) 按 id 修改 [`dsh-web-app`](../../bundle/web-app/README.zh.md) 和 `dsh-base` 的行，并插入 preset 行。该 preset 挂载 persona、工作区指令、时间上下文、shell、`read`、`read_image` 和 `write`、搜索、后台任务、[`dsh-audit-skills`](../audit-skills/README.zh.md) 及 `skill` 工具、上下文压缩、ask-user、todo、联网和 present 工具。它不挂载编辑、委派、计划、定时或插件工具。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 审计 preset

#### 模型看到什么

与 [`dsh-audit-agent`](../audit-agent/README.zh.md) 相同的审计 persona，没有 DeepSeek Harness 身份行，也没有 harness 开发上下文。工具列表只包含 preset 挂载的工具，技能目录中只有审计技能。

#### Token 影响

一段 persona 文本；工具定义比标准 preset 少。

#### KV Cache 影响

在一个会话内保持稳定。preset 修订只对之后新建的会话生效。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **品牌位置仍显示官方内容** — 在八局品牌插件替换它之前，`ui-brand-official` 仍然挂载。
- **已有的桌面 profile 保留原来的 bundle 列表** — 桌面端只在保留 profile 不存在时才初始化它，因此早先基于 Web 的版本创建的 profile 仍只有 `dsh-web-app`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
