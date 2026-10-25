# reactflow-ui · Agent instructions

Conductor Workflow IDE SDK (`@yiyi_zhang/reactflow-ui`), React 19 + ReactFlow + Zustand. Product brand: **CMASTER**.
All UI, docs pages, landing pages, posters and social images follow the CMASTER design system (style "Bento Launchpad").

## Before any UI, page or visual work

Use the `cmaster-design` skill (`.claude/skills/cmaster-design/SKILL.md`). It says which guideline and golden example to read for the task.
Design source of truth lives in `design/` (start at `design/README.md`).

## Hard rules (never break these)

1. **Colors, radii, spacing, fonts, shadows come from tokens.** Use `var(--cm-*)` (generated in `src/styles/cmaster-tokens.css`).
   Legacy variables (`--bg-*`, `--text-*`, `--color-accent*`, `--status-*`) are aliases of them and are fine in existing code.
   No new raw hex / rgb values in components. The only literal allowed is the logo orange `#ff6a13` inside the logo SVG.
2. **Never edit generated token files by hand.** Change `design/tokens.json`, run `npm run tokens:build`, commit both. CI runs `npm run tokens:check`.
3. **Orange (`--cm-brand-500`) means "you can act on this / this is selected".** Primary button, selection ring, active mode, run action, logo. Not for warnings (use `--cm-status-warning`).
4. **Cyan (`--cm-data`) means data and live runs; indigo (`--cm-ai`) means AI.** Do not swap them.
5. **Status = color + icon + Chinese word.** Never color alone (运行中 / 成功 / 失败 / 已超时 / 已跳过 / 等待中).
6. **Text on orange fills uses `--cm-on-brand` (dark), never white.**
7. **No emoji in UI, docs, or marketing.** Icons are `lucide-react`, stroke 1.75, 16px in toolbars. Data icons are names from
   `src/components/icons/iconRegistry.ts` rendered with `<CmIcon>`; add a file to `EMOJI_FREE` in `src/styles/designRules.test.ts` once it is clean.
8. **Copy is Chinese first, verb-first, says what happens** ("运行", "发布到能力库"; never "确定/提交"). Errors say what happened and how to fix it. Space between Chinese and Latin/digits. Technical identifiers in mono.
9. **Global link styles must not apply to buttons** (`a:not(.cm-btn)`). Two real regressions came from this.
10. **Marketing only:** one campaign palette per image (`--cm-campaign-*`); the logo stays `#ff6a13` in every palette; outside Ember no other orange appears.
11. Both themes must work: the IDE root carries `data-mode="dark" | "light"`. Check contrast in both.
12. Do not show unreleased features or unverifiable numbers in any marketing asset.

## Verify before you say done

- `npm run tokens:check && npm run lint && npx tsc --noEmit -p tsconfig.json && npm test`
- Visual change? Run `npm run test:visual` (Playwright screenshots, both themes). If a change is intended, update baselines with the
  "Visual baselines" GitHub workflow (or `npm run test:visual:update` inside the Playwright container) and say so in the PR.
- Render what you built and look at it in both themes before claiming it matches the design.

## Repo notes

- `npm ci` must keep working with the committed lockfile; do not add dependencies without updating `package-lock.json`.
- Library CSS must not fetch fonts; hosts load Geist / Geist Mono (the demo `app.html` does).
- `themeColor="blue"` is deprecated but must keep working for existing hosts.
