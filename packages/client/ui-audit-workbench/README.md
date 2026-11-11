---
description: "The Desktop audit workbench page: System Login Status and the Project Archive of every audit project, with prompts that open new Sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-audit-workbench

English | [中文](README.zh.md)

## Summary

This package adds the 审计工作台 (audit workbench) entry to the left Sidebar and the page it opens. The page shows each pack system's System Login Status and one card per Workspace with its Project Archive. A project's detail view shows the archive, audit focus by section, Kickoff Tasks with outputs, the change log, and Sessions; an Auditee's organization scope view shows its organization tree. Actions that start audit work prepare a prompt and open a new Session with it in the input box; the page never sends a prompt. It reads through [`dsh-audit-workbench`](../../audit/audit-workbench/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Desktop `audit-desktop` profile already mounts this row with the Host row; a composition that mounts one mounts both. The row takes no configuration.

```yaml
- id: ui-audit-workbench
  name: '@deepseek-ai/dsh-client-ui-audit-workbench'
```

### What the user sees

- **Systems** — one card per system in the pack's workbench manifest with its reading: usable, login required with the system's own explanation, or why no reading was produced. **重新检查** checks again; **去登录** runs the system's login tool and checks again when it returns. Without a pack or a valid manifest the section shows why instead.
- **Audit projects** — one card per Workspace in Workspace order, titled by the Workspace title, with the audit type, auditees, audit period, and Kickoff Task progress. A Workspace without a Project Archive says so and offers **回填项目档案** when the manifest supplies that prompt. **新建审计项目** picks a directory, adds it as a Workspace, and opens a Session with the kickoff prompt.
- **Project detail** — the archive fields, each Auditee with its member code and profit center counts and **查看组织范围**, the audit focus grouped by section with the first three items of each, the Kickoff Task table with clickable outputs, which open in the desktop's default application, **重跑** on a failed task, **追加运行内置模型** listing the pack's Built-in Models, the change log newest first with five entries by default and each entry's basis on request, and the project's Sessions by last activity.
- **Organization scope** — the Auditee's organization tree from its Organization Scope file: count chips that also filter by ownership, search by name or code, a collapsible tree with every top-level node that renders at most 200 rows, and the chosen node's ownership, sources, children, and profit centers. Nodes the file could not place are listed above the tree; the rest show as usual. **打开名下编码表** opens the members table; without a file the view says how the project gets one.

The page reads everything on its first open, reads the Project Archives again on every later open and when the Workspace set changes, and has refresh buttons for both.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The row mounts the generated `@deepseek-ai/dsh-audit-workbench/remote` namespace on `ctx.remote`, then registers the `main` page and its `sidebar.panellist` entry once `remote.auditWorkbench`, `uiWorkspace`, and `workspaces` are present; a failed registration withdraws the namespace. [`source.ts`](src/client/source.ts) holds one snapshot store with the overview, the Project Archives, each Auditee's Organization Scope, and each system's reading; a newer Project Archive or Organization Scope read replaces an older one, a scope being read again keeps its last reading on screen, and disposing the row cancels every call in flight. The page component receives the store as a selector hook and the actions as callbacks, never the Context.

A prompt action asks the Host to fill the template, shows the result in a dialog with the Workspace it opens in, and on confirmation calls `uiWorkspace.startSession` with `whenDraftExists: 'append'`, so an existing draft keeps its text. The Session uses the Workspace's default agent preset, which is 审计模式 on Desktop.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [audit-workbench](../../audit/audit-workbench/README.md) — the workbench manifest format and the Host reads.
- [ui-workspace](../ui-workspace/README.md) — `startSession`, `openSession`, and the directory picker.
- [ui-sidebar](../ui-sidebar/README.md) — declares the `sidebar.panellist` entries.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package presents Host reads; a prepared prompt reaches a model only after the person sends it from the Session's input box, as an ordinary user message.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Desktop only** — the page needs the Host row and the directory picker, and only the `audit-desktop` profile mounts them.
- **The archive is not watched** — a Kickoff Task that finishes while the detail view is open shows after **刷新** or the next page open.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
