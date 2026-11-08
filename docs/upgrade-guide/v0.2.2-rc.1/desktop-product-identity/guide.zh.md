---
kind: upgrade-guide
description: "Desktop 以 CSCEC8B Audit Agent 和应用 ID com.cscec8b.auditagent 安装，不再是 DeepSeek Harness。"
---

# Desktop 以 CSCEC8B Audit Agent 安装

[English](guide.md) | 中文

## 变更

Desktop 原先以 `DeepSeek Harness` 安装，应用 ID 为 `com.deepseek.harness`，安装包名为 `deepseek-harness-<version>-<os>-<arch>`。现在以 `CSCEC8B Audit Agent` 安装，应用 ID 为 `com.cscec8b.auditagent`，安装包名为 `cscec8b-audit-agent-<version>-<os>-<arch>`。欢迎窗口只提供 API Key 设置。

操作系统把新版本视为另一个应用。它会和已有的 DeepSeek Harness Desktop 并存安装，不会覆盖旧版；Electron 把 Desktop 设置保存在以产品名命名的新用户数据目录中，例如 Windows 上的 `%APPDATA%\CSCEC8B Audit Agent` 和 macOS 上的 `~/Library/Application Support/CSCEC8B Audit Agent`。Desktop 设置包括更新通道、快捷键覆盖和关闭到后台的确认记录。`DSH_HOME`（默认 `~/.dsh`）下的会话、凭证和设置不变。

## 迁移

1. 退出 DeepSeek Harness Desktop，然后在 Windows 的「程序和功能」中卸载，或在 macOS 上把 `DeepSeek Harness.app` 移到废纸篓，确保只有一个 Desktop 注册 `dsh` 命令和 `dsh://` 链接处理程序。
2. 如需保留快捷键覆盖，在首次启动前把旧用户数据目录中的 `keybindings.json` 复制到新目录。
3. 启动 CSCEC8B Audit Agent，确认已有会话出现在侧边栏，并在新终端中确认 `dsh --version` 指向新安装。
