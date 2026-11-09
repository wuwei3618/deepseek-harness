---
description: "桌面端审计 agent preset，供修改桌面审计会话功能的维护者阅读。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-desktop`

[English](README.md) | 中文

## 概述

桌面端启动的 `audit-desktop` profile 的审计智能体。该层插入 `audit` agent preset，把它设为注册表的默认值，并关闭随附的四个 preset，因此新会话只能以审计模式启动。它还关闭插件和 preset 创作、DeepSeek Harness 开发上下文、DeepSeek 账号设置页和产品分析相关的 Web 行。它用八局印章替换官方品牌图形。

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
| `preset-audit` | 插入：带审计 persona、不含编辑的文件工具、新建子代理和 workflow，以及[审计插件包](../audit-plugin-pack/README.zh.md)的「审计模式」preset |
| `agent-preset-registry` | `default: audit` |
| `preset-standard`、`preset-ptc`、`preset-minimal`、`preset-cordis` | 关闭；没有 `cordis` 时创作者模式入口不可用 |
| `ui-plugin-manager`、`ui-agent-preset`、`entry-customization`、`ui-cordis`、`cordis-host-runner`、`cordis-client-runner`、`cordis-inspect-providers` | 关闭：不能创作插件或 preset |
| `harness-dev-context` | 关闭 |
| `ui-settings-account`、`account-controller` | 关闭 |
| `desktop-product-telemetry`、`product-analytics` | 关闭 |
| `system-prompt` | 根上设置 `includeHarnessIdentity: false` 和审计 persona |
| `browser-use`、`browser-use-playwright-mcp` | 插入：以 `attach` 模式连接桌面端按 Session 区分的侧栏浏览器端点的 [Playwright MCP](../../experimental/browser-use-playwright-mcp/README.zh.md)；未设置 `DSH_DESKTOP_BROWSER_CDP_ENDPOINT` 时（即不在桌面端时）两行都关闭 |
| `ui-brand-official` → `ui-brand-cscec8b` | 关闭官方品牌图形；由 [`dsh-client-ui-brand-cscec8b`](../../client/ui-brand-cscec8b/README.zh.md) 显示印章和八局审计智能体 |
| `ui-settings-plugin-inventory` | `showModuleName: false`：设置里的插件列表不显示 `@deepseek-ai/dsh-*` 包名 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[`cordis.patch.yml`](cordis.patch.yml) 按 id 修改 [`dsh-web-app`](../../bundle/web-app/README.zh.md) 和 `dsh-base` 的行，并插入 preset 行。该 preset 挂载 persona、工作区指令、时间上下文、shell、`read`、`read_image` 和 `write`、搜索、后台任务、[`dsh-audit-skills`](../audit-skills/README.zh.md) 及 `skill` 工具、上下文压缩、新建子代理和 workflow、ask-user、todo、联网和 present 工具，最后挂载 [`dsh-audit-plugin-pack`](../audit-plugin-pack/README.zh.md)，由它加入解压在 `$DSH_HOME/audit-plugins` 的 audit-plugins 发布包中的 MCP 服务和技能。插件包的技能把具名角色交给新建的子代理并运行 workflow，最长的 `SKILL.md` 约 33,000 个字符，因此该 preset 挂载新建子代理和 workflow 工具，并把工具结果裁剪阈值提高到 40,000 个字符，保留开头 20,000 个和结尾 8,000 个。子代理继承该 preset 和只能写工作目录的沙箱。它不挂载编辑、分叉或选择模型的子代理、计划、定时或插件工具。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 审计 preset

#### 模型看到什么

与 [`dsh-audit-agent`](../audit-agent/README.zh.md) 相同的审计 persona，没有 DeepSeek Harness 身份行，也没有 harness 开发上下文。工具列表只包含 preset 挂载的工具、已解压插件包时的插件包 MCP 工具，在桌面端还有 Playwright MCP 浏览器工具；技能目录中只有内置审计技能和插件包技能。persona 要求模型在代用户提交、审批、付款、签署或发送任何内容之前先说明该操作并征得确认。

#### Token 影响

一段 persona 文本。没有插件包时工具定义比标准 preset 少；有插件包时多出约 180 个 MCP 工具定义。

#### KV Cache 影响

在一个会话内保持稳定。preset 修订只对之后新建的会话生效。

### 侧栏浏览器工具

#### 模型看到什么

上游 Playwright MCP 工具。它们只列出和操作当前 Session 侧栏中的 Browser tab；模型打开的页面会作为新的可见 tab 出现在那里，并带有该工作区的登录状态。

#### Token 影响

Playwright MCP 的工具定义；页面快照和截图是普通工具结果。

#### KV Cache 影响

工具列表在该 Session 的浏览器连接初始化时确定。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **agent 打开页面需要该 Session 在屏幕上** — agent 打开的页面出现在该 Session 的侧栏中；该 Session 没有在窗口中打开时，请求会在 20 秒后失败。
- **截图需要支持图像的模型** — 使用纯文本模型时，agent 依靠页面快照工作。
- **已有的桌面 profile 保留原来的 bundle 列表** — 桌面端只在保留 profile 不存在时才初始化它，因此早先基于 Web 的版本创建的 profile 仍只有 `dsh-web-app`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
