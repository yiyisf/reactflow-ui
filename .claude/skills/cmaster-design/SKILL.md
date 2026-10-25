---
name: cmaster-design
description: Use for any CMASTER visual or UI work in this repo - Workflow IDE components and screens, landing or release pages, docs site pages, posters, social images, chat cards - and for reviewing such work against the CMASTER design system.
---

# CMASTER design

CMASTER's design system ("Bento Launchpad") is defined in `design/`. This skill tells you what to read for the task in front of you,
how to build it, and how to check it before you call it done. The hard rules in `CLAUDE.md` always apply.

## 1. Classify the task, read only what it needs

| Task | Read | Golden example |
|---|---|---|
| IDE component or screen | `design/guidelines/brand.md`, `design/guidelines/ide-layout.md`, the matching `design/components/<Name>.md` | `design/examples/ide-standard-running.html`, `ide-business-run-story.html` |
| Release / landing page | `brand.md`, `marketing.md`, `components/LandingHero.md`, `SectionHeader.md`, `BentoGrid.md`, `StatTile.md` | `design/examples/landing-release-v1.3.0.html` |
| Docs page or docs site | `brand.md`, `docs-site.md`, `components/DocsLayout.md`, `Callout.md`, `CodeBlock.md`, `Terminal.md` | `design/examples/docs-page.html` |
| Poster, social image, chat card, banner | `brand.md` (signature elements, logo), `posters.md`, `components/CampaignPalettes.md` | `poster-ember-release.html`, `poster-nebula-ai.html`, `social-signal-milestone.html`, `social-glacier-import.html`, `card-solar-openday-paper.html` |
| Review someone's UI | `brand.md` + the guideline for that surface | Compare against the closest example |

Token values: `design/tokens.json` (names) and `src/styles/cmaster-tokens.css` (the `--cm-*` variables). Never copy hex values out of them; reference the variable.
Component styling: `design/reference/components.css` is the reference implementation; reuse its structure and values, port to the component's own CSS file.

## 2. Decide before you build (write these down in your reply or PR)

- **Surface and theme:** IDE / landing / docs / poster; dark and light both supported (IDE, docs) or a chosen poster ground (night / paper).
- **Accent:** product UI is always brand orange. Marketing picks exactly one campaign palette by content type:
  Ember = release and overview, Glacier = data and integration, Nebula = AI, Signal = milestones and numbers, Solar = events and training.
  Release pages also take a campaign palette (`data-campaign` on `<html>`, `src/marketing/campaign.css`), different from the
  previous version's; see the rotation table in `design/guidelines/marketing.md`.
- **Which components** from `design/components/` you are using. Prefer an existing component over a new pattern.
- **Copy:** Chinese, verb-first, says what happens. Real content only; unknown facts become `[占位]` placeholders, never invented numbers.

## 3. Build

- Styles: `var(--cm-*)` tokens or the legacy aliases already in `src/styles/tokens.css`. No new raw colors.
- Type: `font: var(--cm-type-<style>)`; technical identifiers in `--cm-font-mono`.
- Icons: `lucide-react`, stroke 1.75. No emoji anywhere.
- States: status is color + icon + word; selection is `--cm-brand-500` border + `--cm-glow-select`; running is `--cm-status-running` + `--cm-glow-run`.
- Links: global link styles exclude buttons (`a:not(.cm-btn)`), and buttons set their own hover color.
- Posters: brand bar top-left (logo + CMASTER wordmark + series pill), one headline with one gradient keyword, one visual subject, one action. Logo stays `#ff6a13`. One Orbit motif bleeding off an edge. Safe margin 96 (poster) / 72 (square) / 64 (card). No text under 22px at 1080 width.

## 4. Check before you say done

1. Render it (dev server or open the HTML) and look at it in **both** themes, at desktop and ~400px wide. Hover the primary buttons.
2. Walk this list and fix every miss:
   - [ ] No raw hex/rgb added outside the logo; all values are `--cm-*` or legacy aliases.
   - [ ] Orange only on actions, selection, active mode, logo. Warnings use `status-warning`.
   - [ ] Every status shows color + icon + word.
   - [ ] Text contrast holds on its ground in both themes (tokens are tested; custom combinations are on you).
   - [ ] No emoji; icons are Lucide.
   - [ ] Copy is Chinese, verb-first, no "确定/提交", errors say how to fix.
   - [ ] Marketing: one campaign palette, logo orange, no unreleased features, numbers are verifiable.
3. Run `npm run tokens:check && npm run lint && npm test`; for IDE visual changes also `npm run test:visual`.
4. In the PR, list which guideline sections and example you followed, and attach before/after screenshots for visual changes.

## When the design system itself must change

Edit `design/tokens.json` or the guideline, rebuild tokens, keep `src/styles/cmasterTokens.test.ts` passing, and note the change in the PR.
Do not work around a rule silently; if a rule blocks a reasonable design, say so and propose the rule change.
