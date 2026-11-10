---
description: "The audit group map: the audit profiles for the command line and Desktop, for maintainers changing what an audit session can do."
kind: "package-group"
---

# audit/ — audit profiles

English | [中文](README.zh.md)

## Summary

This group turns the shipped profiles into audit profiles that write only inside the session workspace. The `audit`, `audit-sdk`, and `audit-acp` templates stack `audit-org-defaults` and `audit-agent` over the headless, SDK, and ACP application bundles; the `audit-desktop` template, which Desktop boots, stacks `audit-org-defaults` and `audit-desktop` over the Web application bundle. Every package here adds rows or switches rows off by id, so the upstream bundles and their recorded sessions stay unchanged.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`audit-org-defaults/`](audit-org-defaults/README.md) | Workspace-only writes and no account, telemetry, or plugin installation, over `dsh-base` rows | — (patch only) |
| [`audit-agent/`](audit-agent/README.md) | Audit persona, file tools without edit, and audit skills at the profile root of the command-line profiles | — (patch only) |
| [`audit-desktop/`](audit-desktop/README.md) | The `audit` agent preset as the only Desktop preset, with authoring, account, and analytics rows switched off | — (patch only) |
| [`audit-skills/`](audit-skills/README.md) | Bundled general-purpose audit skills | registers on `ctx.skills` |
| [`audit-plugin-pack/`](audit-plugin-pack/README.md) | The MCP servers and skills of an audit-plugins release unpacked under the Harness home, inside the Desktop audit preset | — (loader group) |
| [`audit-workbench/`](audit-workbench/README.md) | Host reads behind the Desktop audit workbench: the pack's workbench manifest, each Workspace's Project Archive, and System Login Status | `ctx.auditWorkbench` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Profile bundles](../bundle/README.md) — the application bundles these layers patch.
- [Permission presets](../../docs/subsystems/permission-presets.md) and [sandbox](../../docs/subsystems/sandbox.md) — the workspace-write preset and the confinement it selects.
- [Skills](../../docs/subsystems/skills.md) — the registry and the `skill` tool that serve the audit skills.
- [Shipped profile templates](../util/official-bundles/src/bundles.ts) — the bundle order of each audit profile.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
