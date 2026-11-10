---
description: "桌面端审计工作台页面：系统登录状态和每个审计项目的项目档案，并可准备提示词新开会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-audit-workbench

[English](README.md) | 中文

## 概述

本包在左侧栏加入「审计工作台」入口及其打开的页面。页面显示审计插件包列出的各系统的系统登录状态，并为每个工作区显示一张带项目档案内容的卡片；项目的详情视图显示开工信息、取数范围、开工任务及其产物、档案的变更记录和该项目的会话。开始审计工作的操作会准备提示词、展示给用户，并新开一个会话，把提示词放进输入框；页面从不发送提示词。读取经由 [`dsh-audit-workbench`](../../audit/audit-workbench/README.zh.md) 完成。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

桌面端的 `audit-desktop` profile 已经把这一行与 Host 行一起挂载；挂载其中一行的组合需要同时挂载两行。该行没有配置项。

```yaml
- id: ui-audit-workbench
  name: '@deepseek-ai/dsh-client-ui-audit-workbench'
```

### 用户看到的内容

- **系统登录** — 插件包工作台清单中的每个系统一张卡片，显示其读数：可用、需要登录（附该系统自己的说明），或未能取得读数的原因。**重新检查** 再检查一次；**去登录** 运行该系统的登录工具，返回后再检查一次。没有插件包或清单无效时，该区域改为说明原因。
- **审计项目** — 按工作区顺序每个工作区一张卡片，标题为工作区标题，显示审计类型、被审计单位、审计期间和开工任务进度。没有项目档案的工作区会说明这一点，并在清单提供相应提示词时显示 **回填项目档案**。**新建审计项目** 选择一个目录，把它添加为工作区，并用开工提示词新开一个会话。
- **项目详情** — 档案字段、开工任务表（产物可点击，用桌面端的默认应用打开）、失败任务上的 **重跑**、列出插件包内置模型的 **追加运行内置模型**、变更记录，以及按最近活动排序的该项目会话。

页面第一次打开时读取全部内容，此后每次打开以及工作区集合变化时重新读取项目档案，两者都有刷新按钮。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

浏览器一半是 [`src/client/index.ts`](src/client/index.ts)；node 一半是一个空的 Loader 座位。这一行先在 `ctx.remote` 上挂载生成的 `@deepseek-ai/dsh-audit-workbench/remote` 命名空间，待 `remote.auditWorkbench`、`uiWorkspace` 和 `workspaces` 就绪后注册 `main` 页面及其 `sidebar.panellist` 入口；注册失败时撤回该命名空间。[`source.ts`](src/client/source.ts) 持有一个快照存储，其中有概览、项目档案和每个系统的读数；较新的项目档案读取结果替换较旧的结果，撤下这一行会取消所有进行中的调用。页面组件以选择器 hook 的形式接收该存储，以回调接收各项操作，从不接触 Context。

提示词操作请 Host 填充模板，在对话框中展示结果及其将要打开的工作区，确认后以 `whenDraftExists: 'append'` 调用 `uiWorkspace.startSession`，因此已有草稿的文本会保留。会话使用工作区的默认 agent preset，在桌面端即审计模式。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [audit-workbench](../../audit/audit-workbench/README.zh.md) — 工作台清单格式与 Host 读取。
- [ui-workspace](../ui-workspace/README.zh.md) — `startSession`、`openSession` 和目录选择器。
- [ui-sidebar](../ui-sidebar/README.zh.md) — 声明 `sidebar.panellist` 入口。

-----

<a id="model-experience"></a>
## 模型体验

无，本包只展示 Host 读取的内容；准备好的提示词只有在用户从会话输入框发送后，才作为普通用户消息到达模型。

#### KV Cache 影响

无；本包既不组装也不发送服务商请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅限桌面端** — 页面需要 Host 行和目录选择器，只有 `audit-desktop` profile 挂载它们。
- **不监视项目档案** — 详情视图打开期间完成的开工任务，要在 **刷新** 或下次打开页面后才显示。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
