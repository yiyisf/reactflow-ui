# Architecture decision records

Record a significant decision here when its rationale must survive later work: a public API or package-entry change, a state-ownership change, a data-contract choice with hosts or Conductor, or a tradeoff someone is likely to question later.
Do not write an ADR for routine choices. Do not write ADRs that reconstruct history nobody confirmed.

Read the ADRs before changing interfaces, state ownership, or library/data contracts.
Earlier decisions that predate this folder live in [`docs/design/`](../design/) and [`CHANGELOG.md`](../../CHANGELOG.md).

## Format

File name: `NNNN-short-title.md`, numbered from `0001`, never renumbered or reused. Write in Chinese or English.

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN | Deprecated
- Date: YYYY-MM-DD
- Related: release-plan IDs, PRs, docs/design/ reviews

## Context
What forces the decision. Facts, constraints, the problem.

## Decision
What we do, stated directly.

## Consequences
What gets easier, what gets harder, known exceptions, and how we would notice the decision is wrong.

## Alternatives considered
Each option and why it was not chosen.
```

To change an accepted decision, write a new ADR and mark the old one `Superseded by NNNN`.

## Index

| ADR | Title | Status |
|---|---|---|
| (none yet) | | |

## Backfill candidates (Proposed)

These decisions are implemented and documented elsewhere. Record one as an ADR only after the project owner confirms it.

- `./ai` subpath entry for `AiWorkflowIDE` and the AI stack — `src/ai.ts`, `docs/design/双IDE组件架构审查.md` §1.2.
- Library and action metadata use Conductor OSS standard structures — `docs/design/流程库数据源-LibraryProvider设计.md` (header).
- A step pins the library version at first reference; upgrades do not follow automatically — same document.
- One `LibraryProvider` / `LibraryCatalog` shared by business-mode IDE and AI IDE — same document.
