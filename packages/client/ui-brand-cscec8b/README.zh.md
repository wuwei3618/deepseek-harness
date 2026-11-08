---
description: "在侧栏和空白首页展示八局审计智能体的印章品牌，并在点击时盖下印章。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-cscec8b

[English](README.md) | 中文

## 概述

本包在侧栏显示「審」字印章和「八局审计智能体」字标，把印章放在空白首页标题前，并在用户点击首页空白处时盖下一个逐渐淡出的印章。[`dsh-audit-desktop`](../../audit/audit-desktop/README.zh.md) bundle 用它替代 [`dsh-client-ui-brand-official`](../ui-brand-official/README.zh.md)。它在所有客户端构建 profile 中注册相同的内容，不产生模型请求。

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

桌面端的 `audit-desktop` profile 已经挂载本插件并关闭 `ui-brand-official`。其他组合需要挂载 `@deepseek-ai/dsh-client-ui-brand-cscec8b` 行并关闭 `ui-brand-official`，因为两个包占用相同的侧栏 slot 和首页 frame 层。该行没有配置项。

### 用户看到的内容

- **侧栏** — 镂空圆环和「審」字的实心印章，后接「八局审计智能体」。两者都跟随侧栏文字颜色，因此适配浅色和深色主题。收起侧栏时只显示印章。
- **空白首页** — 印章位于标题前，鼠标悬停时轻轻摆动，沿用宿主为该标志提供的悬停动画。
- **首页盖章** — 在首页空白处按下主键时，会在点击位置用蓝色印泥（`--dsw-alias-label-primary-bluish`）盖下印章：印章落下时阴影逐渐收拢，落定时轻微回弹，边缘泛开两圈印泥并溅出八滴墨点，带颗粒感的印迹停留后淡出，全程 2.4 秒。连续盖章时每次倾斜角度不同，最多同时显示三个。点击控件、输入卡片、portal 浮层，或在 frame 内结束文本选择的点击都不会盖章。开启减少动态效果时不显示印章。离开空白首页时清除所有印章。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器部分是 [`src/client/index.ts`](src/client/index.ts)；node 部分是一个空的 Loader 占位。侧栏标志和名称作为一组感知声明的注册安装：嵌套的 `ctx.slots.inject()` 调用等待侧栏声明，因此无论本行在声明方之前还是之后激活都能生效，并一起撤回。`conversation.hero.brand.mark` 和 `conversation.hero.frame` 层各自等待自己的声明。frame 层渲染一个 `display: contents` 外框，并在 `hero` 为 true 时渲染一个负 `z-index` 的绝对定位层来承载印章；frame 约定把该层放在 Conversation 背景之上、内容之下。每个印章由一组 CSS 动画组成；印章元素自身的动画结束时移除，内层动画结束时不移除。层内的一个 SVG 滤镜让印迹边缘粗糙并加上印泥颗粒。[`src/client/artwork.ts`](src/client/artwork.ts) 中的图形由已确认的印章 logo 以 24 单位坐标描摹而来；字标是转成路径的 Noto Sans SC Medium，因此不依赖网页字体。浏览器标题属于构建环境（`DSH_CLIENT_TITLE`），不在 slot 系统中。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md) — 声明 `sidebar.brand.mark` 和 `sidebar.brand.name`，并渲染它们的 fallback。
- [ui-conversation](../ui-conversation/README.zh.md) — 声明 `conversation.hero.brand.mark` 和 `conversation.hero.frame` 层。
- [ui-chat](../ui-chat/README.zh.md) — 负责运行状态的印章动画，不在 slot 系统中。

-----

<a id="model-experience"></a>
## 模型体验

无，本包只提供浏览器展示，不会进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只能有一组占用者** — 本包与 `ui-brand-official` 占用相同的 slot；一个组合只挂载其中之一。
- **减少动态效果时保留隐藏条目** — 开启减少动态效果时印章不会播放动画，因此最多三个隐藏条目会保留到首页关闭。
- **字标在所有语言下都是中文** — 无论界面语言如何，侧栏都显示「八局审计智能体」。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>
