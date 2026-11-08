---
description: "Audit deployment defaults over dsh-base rows, for maintainers changing what every audit profile permits."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-audit-org-defaults`

English | [中文](README.zh.md)

## Summary

The deployment defaults every audit profile shares. The layer confines writes to the session workspace with approvals refused, offers `workspace-write` as the only permission preset, and switches off the DeepSeek account platform and its model route, session telemetry export, the session-log and plugin-inventory request extensions, and plugin installation. It addresses only [`dsh-base`](../../bundle/base/README.md) rows, so it applies unchanged over each application bundle.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `audit`, `audit-sdk`, `audit-acp`, and `audit-desktop` profile templates in [`dsh-official-bundles`](../../util/official-bundles/src/bundles.ts) list this bundle after their application bundle. A later layer can still replace any row it addresses: the profile `cordis.patch.yml`, `$DSH_HOME/cordis.patch.yml`, and `--patch` overlays apply after it.

| Row | Effect |
|---|---|
| `sandbox-policy` | `mode: workspace-write`: writes only inside the workspace and the private temporary directory; `DSH_PERMISSION_MODE` and `--add-dir` no longer widen it |
| `approval` | `policy: never`, so a denied command cannot be retried in a wider sandbox through approval |
| `permission` | the single `workspace-write` preset, which `--permission-mode` and the permission menu can select |
| `deepseek-account`, `llm-deepseek-account` | switched off: no account sign-in and no account model route |
| `session-telemetry-otel` | switched off |
| `session-log-deepseek`, `plugin-package-inventory-deepseek` | switched off: official DeepSeek API requests carry neither the session log nor the plugin package list |
| `plugin-manager`, `tool-plugin-manager` | switched off: no plugin installation by a person or the model |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[`cordis.patch.yml`](cordis.patch.yml) is a list of row patches with no insert. A patch replaces the whole `config` of its row, so the `sandbox-policy`, `approval`, and `permission` rows restate every key they keep. The `config-editor` row stays enabled because the settings service waits for it.

</details>

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the [sandbox policy](../../sandbox/sandbox-policy/README.md) and [user approval](../../interaction/user-approval/README.md) runtime-context sections, which state the workspace-write sandbox mode and the `never` approval policy, and through the tool result of a write refused outside the workspace.

#### KV Cache effect

The layer adds no request content of its own. The policy sections are stable for a session, so the cached prefix stays valid across turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Approvals are refused, not asked** — every approval request resolves `rejected`, including requests that a future tool or MCP server raises for an action other than a sandbox retry.
- **User patch layers still apply** — a person who edits the profile patch, `$DSH_HOME/cordis.patch.yml`, or passes `--patch` can replace these rows; the release launcher lock and file permissions address that.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
