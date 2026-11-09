---
description: "Loader group that mounts the MCP servers and skills of an audit-plugins release unpacked under the Harness home, for maintainers changing how the audit preset gets its plugin pack."
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-plugin-pack`

English | [中文](README.zh.md)

## Summary

A loader group for the Desktop `audit` preset and the command-line audit profiles. At load it reads the audit-plugins release (`audit-plugins-<version>-dsh.zip`) unpacked at `$DSH_HOME/audit-plugins` and mounts the toolkit rows of that release: its Host plugin, its skill provider, and one [`dsh-mcp-client`](../../mcp/mcp-client/README.md) row per audit MCP server. The release is distributed apart from the installer, which never carries the pack's code; `./install` stages a release zip beside the directory and swaps it in before the next Host start. Without the directory the row mounts nothing and logs a warning.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

[`dsh-audit-desktop`](../audit-desktop/README.md) lists the row last in the `audit` preset, and [`dsh-audit-agent`](../audit-agent/README.md) inserts it at the root of the command-line audit profiles with `root: ~/.cscec8b-audit-agent/audit-plugins`, so one unpacked pack serves both. Desktop sets `DSH_HOME` to `~/.cscec8b-audit-agent`, so the pack directory is `~/.cscec8b-audit-agent/audit-plugins` on macOS and `%USERPROFILE%\.cscec8b-audit-agent\audit-plugins` on Windows. In Desktop, **Import audit plugin pack…** in the application menu installs a release zip there and keeps the replaced pack as `audit-plugins.previous` ([Desktop import](../../../apps/desktop/README.md#audit-plugin-pack)). Without Desktop, unpack the release zip, rename its top directory `audit-plugins-<version>-dsh` to `audit-plugins`, move it there so that its `package.json` sits directly inside, and restart. The MCP servers start through `uv`, which must be installed; the first audit session builds their Python environments under `$DSH_HOME/audit-runtime/venvs`, as the pack's own installation guide describes.

```yaml
- id: audit-plugin-pack
  name: '@deepseek-ai/dsh-audit-plugin-pack'
```

| Field | Default | Meaning |
|---|---|---|
| `root` | `$DSH_HOME/audit-plugins` | Pack directory; absolute or `~`-prefixed |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The release root `package.json` names the bundle (`audit-dsh`), its `dsh.bundle.patch`, and its `.` export. The patch inserts an agent preset with id `audit` whose `plugins` hold an `audit-toolkit` group row; this package mounts only that group, so the host's own `audit` preset keeps its persona, tools, and sandbox and the pack's preset never registers. Rows naming the bundle package are rewritten to the file URL of its `.` export, because the pack is not installed in the profile's `node_modules`; the other rows name packages that `dsh-audit-desktop` depends on. The rows keep their `!!js` expressions, which read the paths that the pack's Host plugin provides as `auditDsh`.

`stagePluginPack(zip, root)` from `@deepseek-ai/dsh-audit-plugin-pack/install` unpacks the zip to `<root>.pending`, dropping the single top directory when `package.json` is not at the zip root, and runs the same read on it; an entry outside the directory, a zip without `package.json`, or a failed read removes the staged directory and throws. `applyPendingPluginPack(root)` renames `<root>` to `<root>.previous`, replacing an older one, and `<root>.pending` to `<root>`, moving the old pack back when the second rename fails; callers run it while no Host uses the pack, because Windows refuses to rename a directory that a running MCP server holds open.

The pack is read once when the preset's plugins load for a session. A missing directory is an expected state before installation and mounts nothing. A directory without `package.json`, with invalid manifest fields, with an unreadable patch, or without the `audit` preset and its `audit-toolkit` row fails the row with a `PluginPackError` that names the directory.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Audit plugin pack

#### What the model sees

The pack's MCP tools as `mcp__<server>__<tool>`, and the pack's skills in the session skill catalog. Without the pack, neither appears.

#### Token effect

About 180 MCP tool schemas and one catalog line per pack skill.

#### KV Cache effect

The tool list grows once when the MCP servers connect; a server that connects late changes the tool list of later requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Import is local only** — Desktop imports a zip the person already has and never checks for newer releases, because the audit-plugins repository is private; the command line has no import command and reads the directory Desktop installs.
- **Rows outside the toolkit are not taken over** — a release that adds tools to its preset outside `audit-toolkit` needs a matching row in `dsh-audit-desktop`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
