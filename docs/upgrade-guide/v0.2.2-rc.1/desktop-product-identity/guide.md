---
kind: upgrade-guide
description: "Desktop installs as CSCEC8B Audit Agent with application ID com.cscec8b.auditagent and the cscec8b-audit terminal command instead of DeepSeek Harness and dsh."
---

# Desktop installs as CSCEC8B Audit Agent

English | [中文](guide.zh.md)

## Change

Desktop previously installed as `DeepSeek Harness` with application ID `com.deepseek.harness` and artifacts named `deepseek-harness-<version>-<os>-<arch>`. It now installs as `CSCEC8B Audit Agent` with application ID `com.cscec8b.auditagent` and artifacts named `cscec8b-audit-agent-<version>-<os>-<arch>`. The welcome window offers API-key setup only.

The operating system treats the new build as a different application. It installs beside an existing DeepSeek Harness Desktop instead of replacing it, and Electron keeps Desktop settings in a new user data directory named after the product, for example `%APPDATA%\CSCEC8B Audit Agent` on Windows and `~/Library/Application Support/CSCEC8B Audit Agent` on macOS. Desktop settings include the update channel, keyboard shortcut overrides, and the background-close acknowledgement. Desktop and its terminal command default `DSH_HOME` to `~/.cscec8b-audit-agent` instead of `~/.dsh`, so sessions, credentials, and settings of DeepSeek Harness stay where they are and do not appear in the new application.

The terminal command is `cscec8b-audit` instead of `dsh`. **Manage cscec8b-audit Command…** creates `/usr/local/bin/cscec8b-audit` on macOS, or registers a directory containing only `cscec8b-audit.cmd` in the user PATH on Windows; it never reads, repairs, or removes a DeepSeek Harness `dsh` command.

## Migration

1. DeepSeek Harness Desktop can stay installed; it keeps its own `dsh` command. Both applications register the `dsh://open` link, which focuses the application that registered it last.
2. To keep keyboard shortcut overrides, copy `keybindings.json` from the old user data directory to the new one before the first launch.
3. Launch CSCEC8B Audit Agent, choose **Manage cscec8b-audit Command…** in the application menu, select Install, and confirm that `cscec8b-audit --version` in a new terminal runs. Replace `dsh` with `cscec8b-audit` in scripts that should use the audit application.
