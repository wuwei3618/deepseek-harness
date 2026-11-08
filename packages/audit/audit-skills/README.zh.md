---
description: "以一个技能提供方注册的内置通用审计技能，供新增或编辑审计流程的维护者阅读。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-skills`

[English](README.md) | 中文

## 概述

审计 profile 的技能提供方。加载时它读取 `assets/` 目录下每个 `<name>/SKILL.md` 文件夹，并把目录注册到 [`dsh-skill`](../../skill/skill/README.zh.md)，由 [`dsh-tool-skill`](../../skill/tool-skill/README.zh.md) 列出这些技能并加载其指令。第一个技能 `audit-review` 是确定审查范围、收集证据和报告审计发现的通用流程。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

[`dsh-audit-agent`](../audit-agent/README.zh.md) 在 profile 根上挂载它，[`dsh-audit-desktop`](../audit-desktop/README.zh.md) 在 `audit` preset 内挂载它。新增技能时，添加一个以 kebab-case 技能名命名的文件夹，其 `SKILL.md` 带有含 `description` 的 YAML frontmatter。

```yaml
- id: audit-skills
  name: '@deepseek-ai/dsh-audit-skills'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `assetRoot` | 包内的 `assets/` | 其下 `<name>/SKILL.md` 文件夹构成技能目录的绝对路径 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

技能目录在插件加载时读取一次；文件夹名无效、缺少 frontmatter 或 description 为空都会使加载失败。这些技能按内置技能排序，模型和 `/name` 都可以调用，并以其文件夹作为资源根目录。`get()` 会重新读取文件，因此加载到的指令是加载该技能时的文件内容。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 审计技能目录

#### 模型看到什么

会话技能目录按名称和描述列出每个审计技能；加载技能时返回其 `SKILL.md` 的 Markdown 正文。

#### Token 影响

每个技能在目录中占一行；只有在模型或用户加载后才会带上技能正文。

#### KV Cache 影响

技能目录在一个进程内固定，因此不会在各轮之间改变缓存的前缀。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **技能目录不会重新加载** — 新增或编辑技能文件夹需要重启后生效。
- **只随附一个通用技能** — 针对具体审计类型的技能和 MCP 服务器以单独的插件包提供。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
