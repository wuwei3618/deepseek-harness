---
description: "Bundled general-purpose audit skills registered as one skill provider, for maintainers adding or editing audit procedures."
kind: "package-reference"
---

# `@deepseek-ai/dsh-audit-skills`

English | [中文](README.zh.md)

## Summary

A skill provider for the audit profiles. At load it reads every `<name>/SKILL.md` folder under its `assets/` directory and registers the catalog with [`dsh-skill`](../../skill/skill/README.md), so [`dsh-tool-skill`](../../skill/tool-skill/README.md) lists the skills and loads their instructions. The first skill, `audit-review`, is a general procedure for scoping a review, gathering evidence, and reporting findings.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

[`dsh-audit-agent`](../audit-agent/README.md) mounts it at the profile root and [`dsh-audit-desktop`](../audit-desktop/README.md) mounts it inside the `audit` preset. Add a skill by adding a folder whose name is a kebab-case skill name and whose `SKILL.md` has YAML frontmatter with a `description`.

```yaml
- id: audit-skills
  name: '@deepseek-ai/dsh-audit-skills'
```

| Field | Default | Meaning |
|---|---|---|
| `assetRoot` | the packaged `assets/` | Absolute directory whose `<name>/SKILL.md` folders form the catalog |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The catalog is read once when the plugin loads; an invalid folder name, a missing frontmatter block, or an empty description fails the load. Skills rank as bundled skills, are invocable by the model and by `/name`, and expose their folder as the resource base. `get()` rereads the file, so the loaded instructions reflect the file at load time of the skill.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Audit skill catalog

#### What the model sees

The session skill catalog lists each audit skill by name and description; loading a skill returns the Markdown body of its `SKILL.md`.

#### Token effect

One catalog line per skill; a skill body only after the model or the user loads it.

#### KV Cache effect

The catalog is fixed for a process, so it does not change the cached prefix between turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The catalog does not reload** — adding or editing a skill folder takes effect after a restart.
- **Only one general skill ships** — audit-type specific skills and MCP servers arrive as separate plugin packages.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
