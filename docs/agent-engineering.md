# Project workflow guide

Scope: this repository (`@yiyi_zhang/reactflow-ui`, single package).
Purpose: tell agents and contributors where each project authority lives and when to read it.
This guide is a map. It grants no permission to commit, push, publish, or deploy, and it is not evidence that any check passed.
[`CLAUDE.md`](../CLAUDE.md) stays the instruction entrypoint and owns the CMASTER hard rules 1–12.

## Sources

| Concern | Read when / scope | Authoritative source |
|---|---|---|
| Agent instructions and design hard rules | Every task | [`CLAUDE.md`](../CLAUDE.md) (rules 1–12, cited as "CMASTER rule N"); [`AGENTS.md`](../AGENTS.md) points there |
| UI, pages, posters, social images | Any change under `src/components/`, `src/styles/`, `src/marketing/`, root/`design/` HTML | [`cmaster-design` skill](../.claude/skills/cmaster-design/SKILL.md), [`design/README.md`](../design/README.md), [`design/tokens.json`](../design/tokens.json) |
| Engineering standards (code) | Changes under `src/` | [Engineering standards](#engineering-standards) below (ENG-1 to ENG-4) |
| Product purpose and features | Orientation, planning | [`README.md`](../README.md) (header version is stale; see [Gaps](#coverage-and-gaps)) |
| Host integration contract | Changing props, providers, exports, or anything a host app calls | [`INTEGRATION.md`](../INTEGRATION.md) (per-prop reference); [`docs/integration-guide.md`](integration-guide.md) (v1.2.0+ integration walkthrough) |
| Public API surface | Changing what the package exports | [`src/index.ts`](../src/index.ts) (`.` entry), [`src/ai.ts`](../src/ai.ts) (`./ai` entry), `exports` in [`package.json`](../package.json), build modes in [`vite.config.js`](../vite.config.js) |
| Requirements and acceptance criteria | Planning, implementing, verifying, or reviewing a release item | `docs/vX.Y.Z-release-plan.md` for the target version (latest: [`docs/v1.3.1-release-plan.md`](v1.3.1-release-plan.md)) |
| Version status | Which version is released or next | [`ROADMAP.md`](../ROADMAP.md) and [`CHANGELOG.md`](../CHANGELOG.md) |
| Strategy and extension points | Deciding where a capability belongs (stable line vs Labs, extension points) | [`docs/roadmap.md`](roadmap.md) (target dates are stale; version status lives in `ROADMAP.md`) |
| Architecture decisions | Interfaces, ownership, significant tradeoffs | [`docs/adr/`](adr/README.md) for new decisions; earlier reviews in [`docs/design/`](design/) (some are stale; check against code) |
| Conductor modelling guidance | Generating or editing Conductor definitions | [`docs/best-practices.md`](best-practices.md) |
| Check catalog | Choosing or running checks; cwd: repository root | `scripts` in [`package.json`](../package.json); the "Verify before you say done" section of [`CLAUDE.md`](../CLAUDE.md) |
| CI, release, deployment | Changing workflows, releasing, or reading CI results | [`.github/workflows/`](../.github/workflows/) (`ci.yml`, `visual.yml`, `visual-baselines.yml`, `deploy-pages.yml`, `publish.yml`); [`vercel.json`](../vercel.json) |

## Engineering standards

CMASTER rules 1–12 in `CLAUDE.md` keep their numbers and owner. The rules below cover code structure and have no other owner.
Each was accepted during setup on 2026-10-27. Existing code that predates a rule is a known exception, not a violation to fix in unrelated work.

| ID | Rule | Applies to | Known exceptions |
|---|---|---|---|
| ENG-1 | Write domain logic (parsing, compiling, import, validation, naming, sandbox evaluation) as pure functions. Put the test next to the source as `*.test.ts`. Use hand-written fakes (for example injected timers or targets) instead of `vi.mock`. | `src/stepmodel`, `src/parser`, `src/library`, `src/import`, `src/template`, `src/actions`, `src/utils`, `src/services` | None recorded |
| ENG-2 | Create new state with a store factory and inject it through `IdeStoresProvider` (`src/store/ideStoresContext.tsx`). Do not add new module-level store singletons. | `src/store`, components that read stores | `workflowStore` (canvas) and `defaultActionRegistry` remain module singletons; two IDE instances on one page share canvas state |
| ENG-3 | Add new AI behavior only under `src/services/ai/` and the `./ai` entry. The legacy `src/services/aiService.ts` and `src/components/AICopilot/` accept fixes only. They are scheduled for removal in v2.0.0. | AI features | Legacy stack stays wired into `WorkflowIDE` until v2.0.0 |
| ENG-4 | Record every change to the public API (exports of `src/index.ts`, `src/ai.ts`, `package.json` `exports`, or documented props) in `CHANGELOG.md`. Follow semver: breaking changes need a major version. | Public API | None recorded |

## Verification

- **Check catalog.** `package.json` `scripts` define the commands; run them from the repository root. `CLAUDE.md` lists the required local checks before calling work done. `ci.yml` runs the same set plus `npm run build`.
- **Unit tests.** Vitest runs `src/**/*.test.ts` in a `node` environment ([`vitest.config.ts`](../vitest.config.ts), [`vitest.setup.ts`](../vitest.setup.ts) polyfills `localStorage`). Coverage is collected for listed files without thresholds.
- **Source guards.** [`src/styles/designRules.test.ts`](../src/styles/designRules.test.ts) enforces CMASTER rules 1, 6, 7, 8 and 9 for UI source (`src/` only). [`src/styles/releasePages.test.ts`](../src/styles/releasePages.test.ts) checks release pages.
- **Visual tests.** Playwright ([`playwright.config.ts`](../playwright.config.ts), `tests/visual/`) screenshots the real demo at `/app.html` and the `design/examples/*.html` golden pages. Baselines are committed under `tests/visual/__screenshots__/`. Intended changes regenerate baselines through the "Visual baselines" workflow, as `CLAUDE.md` describes.
- **Real interface.** The demo app (`app.html`, `src/demo/`, mock providers) is the caller-facing surface for manual and visual checks. Start it with the `dev` script (Vite, port 5173). Host apps consume the built package, so changes to exports or CSS also need `npm run build` evidence.
- **Acceptance and test identity** (accepted 2026-10-27):
  - Release-plan item IDs (for example `S1`, `E22`, `A13`) are acceptance-criterion IDs. They are owned by the release plan.
  - A test cites the IDs it covers in its `describe`/`it` title. Several tests can cover one ID. A test title citing an ID is a coverage link, not a test-case identity.
  - Playwright cases and material regression tests get their own stable test-case IDs (`VIS-nnn` for visual, `REG-nnn` for regressions). IDs are never reused; retired cases are marked retired, not renumbered.
  - The catalog and duplicate/missing-ID check for `VIS`/`REG` IDs are **Proposed** (see adoption record). Until they exist, check uniqueness by searching the tests.

## Work and collaboration

Accepted 2026-10-27 from observed practice:

- **Requirements owner.** The release plan for the target version (`docs/vX.Y.Z-release-plan.md`) owns requirements and acceptance criteria. Commits, PRs, tests, and `CHANGELOG.md` reference its IDs instead of copying them. No hosted tracker is required; GitHub Issues are optional intake.
- **Commits.** Conventional Commits with a scope, for example `fix(ai): A15 …`, `test(visual): …`, `docs(changelog): …`. Cite release-plan IDs in the subject when the change addresses them.
- **Branches.** `feat/`, `fix/`, `docs/`, `release/` prefixes, for example `fix/v131-ai`, `release/v1.3.1-bump`.
- **Pull requests.** Open new PRs as drafts. Mark them ready after CI and review pass on the current head. There is no PR template.
- **Releases.** A release commit `chore(release): vX.Y.Z` updates `package.json` and `CHANGELOG.md` (`## [x.y.z] - YYYY-MM-DD` sections). Tags use a `v` prefix. Publishing a GitHub release triggers `publish.yml` (npm with provenance). Pushes to `master` deploy the demo to GitHub Pages; Vercel deploys from `vercel.json` through its Git integration, which is configured outside this repository.

## Environment

- **Setup.** `npm ci` with the committed lockfile (`CLAUDE.md` repo notes). CI uses Node 20 for checks and Pages, Node 22 for publishing. No `.nvmrc` or `engines` field pins a version.
- **Visual tests locally.** `@playwright/test` is not a declared dependency. CI installs it with `--no-save` inside the `mcr.microsoft.com/playwright` 1.56.1 container (`visual.yml`). Run visual tests in that container, or expect `npm run test:visual` to fail after a plain `npm ci`.
- **Local state.** The demo persists preferences in `localStorage` key `conductor-ui-prefs`; visual tests seed it. Clear it when a check depends on default state.
- **Worktrees.** No project guidance. Ordinary git worktrees work because the repository has no external state beyond `node_modules`; each worktree needs its own `npm ci`.
- **Local agent state.** `.claude/*` is git-ignored except `.claude/skills/`, which holds shared project skills.

## Decisions and vocabulary

- **Decisions.** Record new significant tradeoffs as ADRs in [`docs/adr/`](adr/README.md). Earlier decisions live in `docs/design/*.md` reviews and `CHANGELOG.md`. Some of those reviews are stale (for example, `docs/design/双IDE组件架构审查.md` §1.1 says `AiWorkflowIDE` is not exported; `src/ai.ts` now exports it). Check them against the code before relying on them.
- **Vocabulary.** No glossary exists yet. Terms used across code and docs include StepModel and business mode (业务模式), Pro fallback, W-LSP, sandbox dry run, flow library (流程库) versus template library, `LibraryProvider` / `LibraryCatalog`, and action registry. A glossary is Proposed.

## Workflow selection

Workflow selection: **Default for matching tasks** (selected by the project owner, 2026-10-27).
For development tasks, use the installed agent-engineering skill that matches the requested outcome. The request's explicit limits and the project authorities above still govern.

| Requested outcome | Skill |
|---|---|
| Project setup or refresh | `agent-engineering:setup-project` |
| Plan only | `agent-engineering:plan-change` |
| Full implementation workflow | `agent-engineering:deliver-change` |
| Implement an accepted slice only | `agent-engineering:implement-change` |
| Verify only | `agent-engineering:verify-change` |
| Analyze a change | `agent-engineering:review-change` |
| Review a GitHub PR | `agent-engineering:review-pr`, preserving report-only or feedback permissions |
| Correct review findings | `agent-engineering:remediate-findings` |
| Authorized commit, push, or draft PR | `agent-engineering:publish-change` |

UI, page, and visual work also follows the `cmaster-design` skill. Skill routing does not authorize running tests during review, posting PR comments, committing, pushing, approving, merging, releasing, or deploying. If a skill is not installed, report it; do not install it.

## Adoption record

Approach: **Adopt our recommended baseline** (selected by the project owner, 2026-10-27).
Workflow selection: **Default for matching tasks** (selected by the project owner, 2026-10-27).

| Practice | Disposition | Source or decision | Scope and rationale |
|---|---|---|---|
| CMASTER design hard rules 1–12 | Established | `CLAUDE.md` | All UI, docs pages and marketing; numbering preserved |
| Required local checks before "done" | Established | `CLAUDE.md` "Verify before you say done" | All changes |
| Design tokens pipeline | Established | `CLAUDE.md` rule 2, `design/README.md` | Token changes |
| ENG-1 pure domain logic, colocated tests, fakes over mocks | Accepted | Setup interview 2026-10-27 | Matches dominant practice; keeps logic testable without a DOM |
| ENG-2 per-instance stores | Accepted | Setup interview 2026-10-27 | Prevents more shared state between IDE instances |
| ENG-3 new AI only in `services/ai`; legacy removal in v2.0.0 | Accepted | Setup interview 2026-10-27 | Stops two AI stacks from growing |
| ENG-4 public API changes in CHANGELOG, semver | Accepted | Setup interview 2026-10-27 | Hosts consume the package |
| Release plan owns requirements and acceptance IDs | Accepted | Setup interview 2026-10-27 | Formalizes existing practice; no tracker needed |
| Separate acceptance IDs from test-case IDs | Established | Shared workflow contract | Required for integration/E2E and material regressions |
| `VIS-`/`REG-` test-case ID convention | Accepted | Setup interview 2026-10-27 | Lightweight; ordinary unit tests only cite acceptance IDs |
| Test-case ID catalog and duplicate/missing check | Proposed | No adoption decision | Script or test that lists `VIS`/`REG` IDs; no work blocked |
| Commit, branch, draft-PR and release conventions | Accepted | Setup interview 2026-10-27 | Formalizes observed practice |
| ADR convention in `docs/adr/` | Accepted | Setup interview 2026-10-27 | New significant tradeoffs only |
| Backfill ADRs for already-implemented decisions | Proposed | Not answered in setup | Candidates listed in `docs/adr/README.md`; no work blocked |
| Version status in `ROADMAP.md`, strategy in `docs/roadmap.md` | Accepted | Setup interview 2026-10-27 | Resolves two-roadmap ownership |
| Glossary of domain terms | Proposed | No adoption decision | See [Decisions and vocabulary](#decisions-and-vocabulary) |
| Default agent-engineering routing | Accepted | Setup interview 2026-10-27 | See [Workflow selection](#workflow-selection) |

## Coverage and gaps

Discovery (2026-10-27, `master` at `efbfaea`, v1.3.1; source guard row rechecked against `b9d0fbd` on 2026-10-28) inventoried every top-level area and read configuration, CI, entrypoints, instruction files, and representative source and tests. It did not read most `docs/design/*` bodies, `design/guidelines|components/*`, or the large root HTML pages. It did not run any command.

Baseline coverage:

| Topic | Coverage |
|---|---|
| Purpose and architecture | Covered by `README.md`, `INTEGRATION.md`, `docs/design/`; no single current architecture map (gap) |
| Engineering standards | Covered: `CLAUDE.md` rules 1–12 and ENG-1 to ENG-4 |
| Verification | Covered above; test-case ID catalog is a gap |
| Work and collaboration | Covered above |
| Environment | Covered above; Node version is not pinned (gap) |
| Decisions and vocabulary | ADR convention covered; glossary is a gap |
| Workflow selection | Covered |

Recommendations for separately scoped work. These are not active rules and setup did not change any of them:

1. **Lint does not check TypeScript.** `eslint.config.js` enables TS rules only when `typescript-eslint` is installed, and `package.json` does not declare it. CI's lint step therefore checks only the two `.js` config files.
2. **Playwright is undeclared.** `CLAUDE.md` tells agents to run `npm run test:visual`, which fails after `npm ci`. Declare `@playwright/test` pinned to the CI container version, or change the `CLAUDE.md` instruction.
3. **Publish has no gate.** `publish.yml` builds and publishes without lint or tests and rewrites the version from the tag.
4. **Documentation drift.** `README.md` header says v1.1.0; `ROADMAP.md` lacks v1.3.1; `docs/roadmap.md` target dates are stale; `docs/design/双IDE组件架构审查.md` and `docs/design/下一阶段实施计划.md` describe superseded states.
5. **CMASTER rule 7 in docs.** The rule forbids emoji in docs, but `designRules.test.ts` scans only `src/`. `README.md`, `INTEGRATION.md`, `ROADMAP.md`, and `CHANGELOG.md` contain emoji.
6. **Duplicated export blocks.** `src/index.ts` and `src/ai.ts` repeat several export groups with no check that they stay aligned.
7. **Node version.** Pin one Node version (`engines` or `.nvmrc`) and align `ci.yml`, `deploy-pages.yml` and `publish.yml`.
8. **Typecheck exclusion.** `tsconfig.json` excludes `src/services/ai/transport.test.ts` because `@types/node` is missing (tracked as deferred in `ROADMAP.md`).
