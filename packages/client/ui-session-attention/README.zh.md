---
description: "会话提出问题、请求审批、等待确认方案或完成一轮任务时，桌面端发送系统通知；常规设置中有两个开关。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-attention

[English](README.md) | 中文

## 概述

在桌面端，智能体需要用户处理或完成任务时发送系统通知。会话提出问题、请求审批或等待确认方案时显示**智能体需要您处理**；一轮任务结束时显示**智能体已完成任务**。通知正文写明会话名称。点击通知会把窗口调到前台并打开该会话。窗口未获得焦点时，Windows 任务栏按钮闪烁，macOS 程序坞图标跳动一次。**设置 → 通用**中的两个开关分别关闭这两类通知。在桌面端以外，本插件不注册任何内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在桌面端 profile 中挂载本条目；`audit-desktop` profile 以 `ui-session-attention` 插入它：

```yaml
- id: ui-session-attention
  name: '@deepseek-ai/dsh-client-ui-session-attention'
```

条目 id 即配置表单的名称，因此只有 id 为 `ui-session-attention` 时，通用设置中才显示两个开关。`attention` 与 `completion` 两项偏好都是实时字段，默认值为 `true`；profile 可以在条目的 `config` 中把任一项设为 `false`。

会话显示在屏幕上且窗口获得焦点时不发送通知。因此被暂缓的处理请求，在请求仍未处理而窗口失去焦点时发送通知。子代理会话从不发送通知。请求得到处理、会话在窗口获得焦点时显示到屏幕上，或同一会话的新通知替换旧通知时，通知关闭。页面重新加载后，已经存在的请求和已结束的轮次不会再次通知。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器条目读取 `ui-session` 状态快照中的待处理交互与运行状态，读取会话列表中的标题、子代理来源与主视图持有计数，并监听窗口焦点事件。[`AttentionEngine`](src/client/engine.ts) 把这些输入转换为发送与撤回动作：出现新键的待处理交互发送通知；从运行变为停止且没有待处理交互时，报告一轮任务结束。条目把每个动作本地化后交给 `dshDesktop.sessionAttention`，桌面端 preload 只向应用页面提供这一接口。

桌面端主进程校验每条通知，每个会话最多保留一个 Electron `Notification`，并播放系统通知音。点击通知会聚焦窗口，并把会话发回页面，页面通过 `uiWorkspace.openSession` 打开它。接口类型位于 [`src/types.ts`](src/types.ts)，以 `./types` 导出。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [会话 UI 状态](../ui-session/README.zh.md)——待处理交互与运行状态。
- [设置表单](../ui-settings/README.zh.md)——Host 已接受的值与有序写入。
- [桌面端应用](../../../apps/desktop/README.zh.md)——Electron 外壳及其 preload 接口。

<a id="model-experience"></a>
## 模型体验

无；通知不贡献模型可见内容。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- 通知需要操作系统允许本应用发送通知。未签名的 macOS 安装包可能被通知中心拒绝；失败会记入日志，程序坞图标仍会跳动。
- Web 端和命令行应用没有通知，因为本插件依赖桌面端接口。
- 通知上没有回答或审批按钮；请在会话中处理请求。

<a id="dev-note"></a>
### 开发备注

无。
