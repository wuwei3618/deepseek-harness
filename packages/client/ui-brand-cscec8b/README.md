---
description: "CSCEC8B Audit Agent seal branding in the sidebar and on the blank home, with a click-triggered seal stamp."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-cscec8b

English | [中文](README.zh.md)

## Summary

This package shows the 審 seal and the 八局审计智能体 wordmark in the sidebar, puts the seal before the blank-home headline, and presses a fading seal impression where the user clicks blank home space. The [`dsh-audit-desktop`](../../audit/audit-desktop/README.md) bundle mounts it in place of [`dsh-client-ui-brand-official`](../ui-brand-official/README.md). It registers the same occupants in every client build profile and adds no model requests.

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

The Desktop `audit-desktop` profile already mounts this plugin and switches off `ui-brand-official`. Another composition mounts the `@deepseek-ai/dsh-client-ui-brand-cscec8b` row and disables `ui-brand-official`, because both packages occupy the same sidebar slots and home frame layer. The row takes no configuration.

### What the user sees

- **Sidebar** — the filled seal with the ring and 審 cut out, followed by 八局审计智能体. Both follow the sidebar text color, so they adapt to light and dark themes. The collapsed sidebar shows the seal alone.
- **Blank home** — the seal leads the headline and sways while hovered, using the host's hover animation for that mark.
- **Home stamp** — a primary click on blank home space presses a seal impression at the click point in blue ink (`--dsw-alias-label-primary-bluish`): the seal's shadow narrows as it drops from above, the seal lands with a slight rebound, two rings of ink spread from the rim while eight droplets splash outward, and the grained impression holds, then fades; the sequence lasts 2.4 seconds. Successive impressions tilt by different angles; at most three show at once. Clicks on controls, the input card, portaled overlays, and clicks that end a text selection inside the frame press nothing. Reduced-motion preference hides the impressions. Leaving the blank home clears them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The sidebar mark and name install as one declaration-aware registration set: nested `ctx.slots.inject()` calls wait on the sidebar declaration, so the pair works whether this row activates before or after the declarer and withdraws together. `conversation.hero.brand.mark` and the `conversation.hero.frame` layer each wait on their own declaration. The frame layer renders a `display: contents` wrapper and, while `hero` is true, an absolutely positioned layer at negative `z-index` that holds the impressions, which the frame contract places above the Conversation background and below its content. Each impression is a set of CSS animations; the end of the impression element's own animation removes it, while the end of an inner layer's animation does not. One SVG filter in the layer roughens the impression's edges and adds the ink grain. The artwork in [`src/client/artwork.ts`](src/client/artwork.ts) is traced from the approved seal logo in 24-unit coordinates; the wordmark is Noto Sans SC Medium converted to a path, so it renders without a web font. The browser title is a build-environment concern (`DSH_CLIENT_TITLE`), outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` and the `conversation.hero.frame` layer.
- [ui-chat](../ui-chat/README.md) — owns the running-status seal animation, which is outside the slot system.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One occupant set** — this package and `ui-brand-official` occupy the same slots; a composition mounts one of them.
- **Reduced motion keeps hidden entries** — with reduced motion the impressions never animate, so up to three hidden entries remain until the home closes.
- **The wordmark is Chinese in every locale** — the sidebar shows 八局审计智能体 regardless of the interface language.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
