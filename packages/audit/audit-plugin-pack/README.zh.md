---
description: "挂载解压在 Harness 主目录下的 audit-plugins 发布包中 MCP 服务和技能的 loader 分组，供修改审计 preset 获取插件包方式的维护者阅读。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-plugin-pack`

[English](README.md) | 中文

## 概述

桌面端 `audit` preset 的 loader 分组。加载时它读取解压在 `$DSH_HOME/audit-plugins` 的 audit-plugins 发布包（`audit-plugins-<version>-dsh.zip`），并挂载该发布包的工具行：它的 Host 插件、技能提供方，以及每个审计 MCP 服务一条 [`dsh-mcp-client`](../../mcp/mcp-client/README.zh.md) 行。发布包与安装包分开分发，因此更新插件包只需替换该目录并重启，安装包里也不会带插件包的代码。没有该目录时，这一行不挂载任何内容，只记录一条警告。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

[`dsh-audit-desktop`](../audit-desktop/README.zh.md) 把这一行放在 `audit` preset 的最后。桌面端把 `DSH_HOME` 设为 `~/.cscec8b-audit-agent`，所以插件包目录在 macOS 上是 `~/.cscec8b-audit-agent/audit-plugins`，在 Windows 上是 `%USERPROFILE%\.cscec8b-audit-agent\audit-plugins`。解压发布包，把顶层目录 `audit-plugins-<version>-dsh` 改名为 `audit-plugins`，移到上述位置，使其 `package.json` 直接位于该目录下，然后重启。MCP 服务通过 `uv` 启动，需要先安装 `uv`；第一次进入审计会话时，会按插件包自己的安装说明在 `$DSH_HOME/audit-runtime/venvs` 下建立它们的 Python 环境。

```yaml
- id: audit-plugin-pack
  name: '@deepseek-ai/dsh-audit-plugin-pack'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `root` | `$DSH_HOME/audit-plugins` | 插件包目录；绝对路径或以 `~` 开头 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

发布包根目录的 `package.json` 声明 bundle 名（`audit-dsh`）、`dsh.bundle.patch` 和 `.` 导出。该 patch 插入一个 id 为 `audit` 的 agent preset，其 `plugins` 中有一个 `audit-toolkit` 分组行；本包只挂载这个分组，因此宿主自己的 `audit` preset 保留其 persona、工具和沙箱，插件包的 preset 不会注册。插件包没有安装到 profile 的 `node_modules` 中，所以指向 bundle 包名的行会被改写为其 `.` 导出的文件 URL；其他行指向 `dsh-audit-desktop` 已依赖的包。这些行保留 `!!js` 表达式，从插件包 Host 插件提供的 `auditDsh` 读取路径。

插件包在一个会话加载 preset 插件时读取一次。安装之前目录不存在是预期状态，不挂载任何内容。目录中没有 `package.json`、manifest 字段无效、patch 无法读取，或缺少 `audit` preset 及其 `audit-toolkit` 行时，这一行以注明目录的 `PluginPackError` 失败。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 审计插件包

#### 模型看到什么

插件包的 MCP 工具，名称为 `mcp__<server>__<tool>`；插件包的技能出现在会话技能目录中。没有插件包时两者都不出现。

#### Token 影响

约 180 个 MCP 工具定义，每个插件包技能在目录中占一行。

#### KV Cache 影响

MCP 服务连接后工具列表增长一次；晚连接的服务会改变之后请求的工具列表。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **只有桌面端挂载插件包** — 命令行审计 profile 不包含这一行。
- **安装需要手动解压** — 桌面端没有导入页面；缺少插件包的警告只出现在 Host 日志中。
- **不接管分组以外的行** — 如果新版本在其 preset 中 `audit-toolkit` 以外的位置加入工具，需要在 `dsh-audit-desktop` 中加入对应的行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
