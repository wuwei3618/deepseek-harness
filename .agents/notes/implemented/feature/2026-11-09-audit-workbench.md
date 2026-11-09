# Agent Note: Audit workbench reads the pack and the Project Archive

Status: implemented

English | [中文](2026-11-09-audit-workbench.zh.md)

## Problem

Desktop audit mode opens on the conversation view, so a person running several audit projects cannot see which external systems still need a login, which projects exist, or how far each project's Kickoff Tasks have run without opening Sessions one by one. The facts already exist in two places this repository does not own: the private audit plugin pack, whose services know each system's login state, and the Project Archive `审计方案/00_项目档案.json` that the pack's audit-issue-workflow skill writes in every Project Directory. The fork is public and the pack is private, so the fork cannot carry the pack's system list, tool names, or prompts.

## Decision

The 审计工作台 page is split into a Host package, [`dsh-audit-workbench`](../../../../packages/audit/audit-workbench/README.md), and a browser package, [`dsh-client-ui-audit-workbench`](../../../../packages/client/ui-audit-workbench/README.md), both mounted at the root of the `audit-desktop` profile.

- **The pack declares what the page shows.** The pack's `package.json` names a workbench manifest in `dsh.auditWorkbench`; it lists the systems with their session and login tools, the Built-in Models, and the prompt templates. The fork holds no system id, tool name, or prompt text.
- **Login state comes from each system's own tools.** A check starts the system's server outside any Session with the launch values that the pack's MCP client row resolves to, calls the manifest's session tool, and compares one result field. A login calls the system's own login tool. Each system keeps one login, the one its service already has.
- **The launch values come from the pack's rows.** The Host row mounts the pack's `audit-toolkit` group again under prefixed ids and rewrites each stdio MCP client row to a launch-value plugin, so the loader evaluates the pack's own expressions and nothing registers a model tool.
- **The Project Archive is read only.** The page shows the fields this reader knows and says when the archive is newer than the known Archive Version; only the audit Session's main agent writes the archive.
- **Prompts are shown, never sent.** An action fills a template on the Host, shows it, and opens a new Session with the prompt in its input box; the person sends it.

## Alternatives considered

**Hardcode the systems and prompts in the fork.** The pack changes on its own release schedule and its contents are private, so every pack change would need a fork change, and the public fork would expose the pack's internals.

**Reuse the MCP clients of a running Session.** The overview has no Session, and a Session's clients register model-visible tools; a check from the page would then depend on which Session is open. One-shot servers cost a server start per check instead.

**Keep a workbench state file beside the archive.** A second file with project progress would have two writers and drift from the archive that the skill maintains; reading the archive keeps one record per project.

**Send prompts automatically.** Starting a Kickoff Task or a Built-in Model reaches external systems on the person's behalf; showing the prompt first lets the person adjust the auditees, period, or scope before any model request.

## Consequences

The page works with any pack that ships a manifest and shows only the Project Archives when a pack has none. The first check after launch waits for the server's Python environment, and servers inside Sessions are separate processes. The manifest format and the archive fields are an interface between this repository and the pack: a pack change that renames a session tool or a result field needs only a manifest change, while a new archive field shows on the page only after this reader learns it.
