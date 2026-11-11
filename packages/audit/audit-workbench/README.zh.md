---
description: "桌面端审计工作台的 Host 一半：插件包的工作台清单、各工作区的项目档案和系统登录状态检查，供修改工作台页面读取内容的维护者阅读。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-workbench`

[English](README.md) | 中文

## 概述

桌面端审计工作台的 Host 一半。这一行提供 `ctx.auditWorkbench`，它的 Remote 方法读取审计插件包的工作台清单，读取每个工作区的项目档案 `审计方案/00_项目档案.json`，填充清单中的提示词模板，通过各系统自己的会话工具和登录工具检查并更新系统登录状态，读取每个被审计单位的组织范围文件，并打开开工任务记录的产物或组织范围对应的名下编码表。[`dsh-client-ui-audit-workbench`](../../client/ui-audit-workbench/README.zh.md) 在工作台页面上展示这些内容。本包只读取项目档案；项目档案由审计会话的主 agent 写入。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

[`dsh-audit-desktop`](../audit-desktop/README.zh.md) 把这一行与页面行一起插入 profile 的根上。它读取的插件包目录与 [`dsh-audit-plugin-pack`](../audit-plugin-pack/README.zh.md) 相同。

```yaml
- id: audit-workbench
  name: '@deepseek-ai/dsh-audit-workbench'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | `$DSH_HOME/audit-plugins` | 插件包目录；绝对路径或以 `~` 开头 |
| `checkTimeoutMs` | `120000` | 一次会话检查的时限，含服务启动时间 |
| `loginTimeoutMs` | `600000` | 一次登录工具调用的时限，其间等待用户完成登录 |

### 工作台清单

插件包根目录的 `package.json` 在 `dsh.auditWorkbench` 中给出清单文件相对插件包目录的路径。没有该字段时，页面只显示项目档案。清单无效时，页面显示其中第一个问题。

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

| 字段 | 含义 |
|---|---|
| `systems[].server` | 提供该系统的插件包 MCP 客户端行的 `serverName` |
| `systems[].check` | 会话工具及其参数；结构化结果中 `ready.path` 处的字段等于 `ready.equals` 时，该系统可用；`message` 是说明登录不可用原因的文本字段路径 |
| `systems[].login` | 可选的登录工具；没有时页面不提供登录按钮 |
| `models[]` | 内置模型；`prompt` 用于在新会话中启动该模型 |
| `prompts` | 可选的模板，分别用于新建审计项目、补建项目档案和重新运行失败的开工任务 |

id 只能使用字母、数字、`_` 和 `-`。模板使用 `{{name}}` 占位符；模板引用其类型不提供的占位符时，校验不通过：

| 类型 | 占位符 |
|---|---|
| `kickoff`、`backfill` | `projectDir` |
| `rerun` | `projectDir`、`auditType`、`auditees`、`periodFrom`、`periodTo`、`taskType`、`taskId`、`taskSummary` |
| `models[].prompt` | `projectDir`、`auditType`、`auditees`、`periodFrom`、`periodTo`、`model` |

### 组织范围文件

开工时，技能在 `工作区/开工/组织范围/` 下为每个机构类被审计单位写一份组织范围文件，并把相对项目目录的路径记入项目档案的 `被审计单位[].组织范围文件`。`orgScope` 读取它，供页面显示组织机构树；`openMembersTable` 打开其中记录的名下编码表。未知的键被忽略。文件头不符合下表，或第一个节点不是 `起点`，整份文件读为无法读取，页面说明原因。其余节点逐个读取：不符合格式或编码与前面重复的节点被略去，上一级不在前面节点中的节点按顶层显示，页面列出这两类节点。

| 字段 | 含义 |
|---|---|
| `格式版本` | 必须为 `1` |
| `起点` | 起点节点的 `编码` 与 `名称`；起点即第一个节点 |
| `导出时间`、`名下编码表` | 导出时间；名下编码表的文件名，位于组织范围文件所在目录，可选 |
| `节点[]` | 各节点排在其上一级之后：`编码`、`名称`、`上一级编码`（顶层节点为空串；不在起点组织树下的节点作顶层）、`归属`（`名下`、`别家`、`归不到` 或 `不纳入`），以及可选的 `所属二级单位`、`定归属的来源`、`来源不一致`、`利润中心`（仅本节点自己的）与 `说明` |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

这一行是一个 loader 分组。它先提供服务，再以 `audit-workbench-` 开头的 id 重新挂载插件包的 `audit-toolkit` 分组：保留插件包的 Host 插件，并把每条 stdio [`dsh-mcp-client`](../../mcp/mcp-client/README.zh.md) 行改写为 `@deepseek-ai/dsh-audit-workbench/server`，启动字段保持不变。因此 loader 会计算插件包自己的 `!!js` 表达式，每条改写后的行把服务的命令、参数、目录和环境记录到服务上，既不启动服务，也不注册工具。会话检查在任何会话之外按这些值启动服务，调用一个工具，然后关闭服务；中止调用（例如页面撤下时）会关闭服务。

每次读取概览、准备提示词和检查时都会重新读取清单和插件包，因此新导入的插件包在下次打开页面时即可显示。项目档案读取器保留已知字段，把缺失或类型不符的字段读为空值；`version` 高于已知档案版本的项目档案仍显示基本信息，页面同时说明部分字段可能缺失。不是 JSON 或不是对象的文件读为无法读取，并附原因。`openOutput` 只在记录的产物的真实路径是项目目录内的文件时才打开它，`openMembersTable` 对名下编码表作同样的检查。组织范围文件只在其真实路径位于项目目录内时才读取。

失败通过 Remote 传递为 `auditWorkbench/not-found`（工作区、项目档案、开工任务、产物、被审计单位、名下编码表或内置模型不存在）、`auditWorkbench/no-prompt`、`auditWorkbench/output-refused` 和 `auditWorkbench/open-failed`。会话检查从不拒绝：清单中没有该系统或没有挂载对应服务、超过时限、调用失败、结果无法读取，都返回一条带原因的失败读数。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无，本包为页面读取文件并调用插件包的会话工具，这里的内容都不会进入模型请求。页面准备的提示词只有在用户从会话输入框发送后，才作为普通用户消息到达模型。

#### KV Cache 影响

无；本包既不组装也不发送服务商请求。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **每次检查各自启动服务** — 每次会话检查或登录都会启动一个新的服务进程，因此启动后的第一次检查要等待服务的 Python 环境；会话中的服务是另外的进程。
- **只检查 stdio 服务** — 使用其他传输方式的插件包 MCP 客户端行没有启动参数行，对应系统显示为不可用。
- **清单由插件包提供** — 在 audit-plugins 发布包附带清单之前，页面不列出任何系统、内置模型或提示词。
- **组织范围文件由插件包提供** — 在 audit-plugins 的开工流程写出该文件之前，组织范围页说明该项目尚无组织范围文件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
