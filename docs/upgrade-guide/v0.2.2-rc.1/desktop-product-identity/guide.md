---
kind: upgrade-guide
description: "Desktop installs as CSCEC8B Audit Agent with application ID com.cscec8b.auditagent instead of DeepSeek Harness."
---

# Desktop installs as CSCEC8B Audit Agent

English | [中文](guide.zh.md)

## Change

Desktop previously installed as `DeepSeek Harness` with application ID `com.deepseek.harness` and artifacts named `deepseek-harness-<version>-<os>-<arch>`. It now installs as `CSCEC8B Audit Agent` with application ID `com.cscec8b.auditagent` and artifacts named `cscec8b-audit-agent-<version>-<os>-<arch>`. The welcome window offers API-key setup only.

The operating system treats the new build as a different application. It installs beside an existing DeepSeek Harness Desktop instead of replacing it, and Electron keeps Desktop settings in a new user data directory named after the product, for example `%APPDATA%\CSCEC8B Audit Agent` on Windows and `~/Library/Application Support/CSCEC8B Audit Agent` on macOS. Desktop settings include the update channel, keyboard shortcut overrides, and the background-close acknowledgement. Sessions, credentials, and settings under `DSH_HOME` (default `~/.dsh`) are unchanged.

## Migration

1. Quit DeepSeek Harness Desktop, then uninstall it from Programs and Features on Windows or move `DeepSeek Harness.app` to the Trash on macOS, so that only one Desktop registers the `dsh` command and the `dsh://` link handler.
2. To keep keyboard shortcut overrides, copy `keybindings.json` from the old user data directory to the new one before the first launch.
3. Launch CSCEC8B Audit Agent and confirm that existing Sessions appear in the sidebar and that `dsh --version` in a new terminal resolves to the new installation.
