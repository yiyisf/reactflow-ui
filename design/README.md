# CMASTER design source

This folder is the single source of truth for how CMASTER looks and reads. It mirrors the CMASTER design system artifact;
when the two differ, update this folder in a PR and re-publish the artifact from it.

| Path | What | Who reads it |
|---|---|---|
| `tokens.json` | All design tokens (colors per theme, type, spacing, radius, shadow, campaign palettes) | `scripts/tokens/build.mjs` → `src/styles/cmaster-tokens.css`, `src/styles/cmasterTokens.ts` |
| `guidelines/brand.md` | Brand book: temperament, signature elements, principles, copy, color, type, motion, icons, logo, a11y | Everyone; read first |
| `guidelines/ide-layout.md` | Workflow IDE regions, three modes, semantic zoom, core interactions, empty states, feedback | IDE work |
| `guidelines/docs-site.md` | Docs site stack, information architecture, layout, content components, writing rules | Docs work |
| `guidelines/marketing.md` | Release landing page structure, bento grid, video | Landing pages, video |
| `guidelines/posters.md` | Posters and social images: invariants, campaign palettes, Orbit motif, layout, poster type scale, sizes | Posters, social, chat cards |
| `components/*.md` | One spec per component: what the consumer provides, states, rules | Building or reviewing a component |
| `reference/components.css` | Reference implementation of every component in plain CSS (`cm-*` classes, `--cm-*` tokens) | Building React components; rendering examples |
| `examples/*.html` | Golden examples (open in a browser). Each file's header says which rules it demonstrates | Imitate structure, not content |
| `assets/*.svg` | Logo: mark on dark, mark on light, app icon | Anywhere the logo appears |

## Token naming

A token named `brand-500` in `tokens.json` is the CSS variable `--cm-brand-500` and `cmasterTokens.color.dark['brand-500']` in TS.
Type styles become shorthand variables: `font: var(--cm-type-title-sm)`, with letter-spacing in `--cm-tracking-<style>` where set.

## Changing the design system

1. Edit `tokens.json` or the guideline. Keep a usage note on every token.
2. `npm run tokens:build`, then `npm test` (contrast and brand invariants live in `src/styles/cmasterTokens.test.ts`).
3. If it changes how the IDE looks, update visual baselines (see `CLAUDE.md`).
4. Every bug a human catches in review becomes a rule here, a lint, or a test, so it does not need catching twice.
