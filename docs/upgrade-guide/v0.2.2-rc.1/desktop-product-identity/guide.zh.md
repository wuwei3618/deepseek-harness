---
kind: upgrade-guide
description: "Desktop 以 CSCEC8B Audit Agent、应用 ID com.cscec8b.auditagent 和终端命令 cscec8b-audit 安装，不再是 DeepSeek Harness 和 dsh。"
---

# Desktop 以 CSCEC8B Audit Agent 安装

[English](guide.md) | 中文

## 变更

Desktop 原先以 `DeepSeek Harness` 安装，应用 ID 为 `com.deepseek.harness`，安装包名为 `deepseek-harness-<version>-<os>-<arch>`。现在以 `CSCEC8B Audit Agent` 安装，应用 ID 为 `com.cscec8b.auditagent`，安装包名为 `cscec8b-audit-agent-<version>-<os>-<arch>`。欢迎窗口只提供 API Key 设置。

操作系统把新版本视为另一个应用。它会和已有的 DeepSeek Harness Desktop 并存安装，不会覆盖旧版；Electron 把 Desktop 设置保存在以产品名命名的新用户数据目录中，例如 Windows 上的 `%APPDATA%\CSCEC8B Audit Agent` 和 macOS 上的 `~/Library/Application Support/CSCEC8B Audit Agent`。Desktop 设置包括更新通道、快捷键覆盖和关闭到后台的确认记录。Desktop 及其终端命令默认把 `DSH_HOME` 设为 `~/.cscec8b-audit-agent`，不再使用 `~/.dsh`，因此 DeepSeek Harness 的会话、凭证和设置原地保留，不会出现在新应用中。

终端命令是 `cscec8b-audit`，不再是 `dsh`。**管理 cscec8b-audit 命令…**在 macOS 上创建 `/usr/local/bin/cscec8b-audit`，在 Windows 上把只含 `cscec8b-audit.cmd` 的目录注册到用户 PATH；它从不读取、修复或移除 DeepSeek Harness 的 `dsh` 命令。

## 迁移

1. DeepSeek Harness Desktop 可以继续保留，它保留自己的 `dsh` 命令。两个应用都注册 `dsh://open` 链接，该链接聚焦最后注册它的应用。
2. 如需保留快捷键覆盖，在首次启动前把旧用户数据目录中的 `keybindings.json` 复制到新目录。
3. 启动 CSCEC8B Audit Agent，在应用菜单中选择**管理 cscec8b-audit 命令…**并点击“安装”，然后在新终端中确认 `cscec8b-audit --version` 可以运行。需要使用审计应用的脚本把 `dsh` 换成 `cscec8b-audit`。
