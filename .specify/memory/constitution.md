<!--
=== Sync Impact Report ===
Version change: 1.1.0 → 1.2.0
Modified principles: None
Added sections:
  - "Pull Request Discipline" under Development Workflow
Removed sections:
  - "Progress Tracking" (removed in 1.1.0 → 1.2.0 transition;
    tasks.md now serves as progress tracker)
Templates requiring updates:
  - `.specify/templates/plan-template.md` ✅ no update needed
    (Constitution Check references constitution file generically)
  - `.specify/templates/spec-template.md` ✅ no update needed
    (User stories and requirements structure unaffected)
  - `.specify/templates/tasks-template.md` ✅ no update needed
    (Task phases/checkpoints align; PR scope is a higher-level
    concern above individual task commits)
Follow-up TODOs: None
=== End Sync Impact Report ===
-->

# OmniClip Constitution

## Core Principles

### I. Code Quality — Readability and Maintainability First

- All code MUST prefer clear naming, consistent structure,
  and minimal surprise.
- Explicit boundaries MUST be defined for every module:
  inputs/outputs, error semantics, and extension points.
- Complexity MUST be controlled: if code becomes hard to
  explain, refactor or split before adding more.
- All changes MUST be reviewable: explain _why_, alternatives
  considered, and key risks.

**Rationale**: Readable code reduces onboarding time, prevents
bugs, and makes reviews efficient. Maintainable code reduces
long-term cost.

### II. Testing Standards

- Any behavior change MUST include appropriate tests.
  - Bug fix: reproduce the failure first, then fix to make
    the test pass.
  - Feature: cover core paths and critical branches
    (success/failure/edge cases).
- Tests MUST use the right layer:
  - Unit tests for pure logic.
  - Integration tests for cross-module/process contracts
    and key user journeys.

**Rationale**: Tests are the primary safety net against
regressions. Layer-appropriate testing avoids brittle test
suites while maintaining coverage.

### III. UX Consistency

- User-visible outputs MUST be consistent in terminology,
  formats, sorting, and timezone handling.
- Errors and empty states MUST be actionable: what happened,
  why, and what to do next.

**Rationale**: Consistent UX reduces user confusion and support
burden. Actionable errors enable self-service resolution.

### IV. Performance Requirements

- For performance-impacting changes, metrics MUST be defined
  and verified (latency, throughput, memory, IO,
  responsiveness) when feasible.
- Performance claims without measurement are PROHIBITED.

**Rationale**: Unmeasured performance claims are unreliable.
Defining metrics upfront prevents performance debt.

### V. Observability and Regression Safety

- Critical flows MUST be diagnosable via clear logs/signals;
  include counts/timing where useful.
- Failures MUST be actionable and MUST NOT leak sensitive data.
- Contract changes (schemas/field semantics/sorting/dedup
  rules) MUST include a compatibility strategy and test
  guardrails.

**Rationale**: Observable systems are debuggable systems.
Contract guardrails prevent silent breaking changes.

### VI. Language Standard — English-only Code and Comments

- Source code identifiers (variables/functions/classes/modules/
  constants) MUST be in English.
- Comments and docstrings MUST be in English.
- Localized user-facing content is permitted but MUST be
  structured and documented.

**Rationale**: English is the lingua franca of software
development. Consistent language reduces friction for
contributors and tooling.

### VII. Communication Protocol

- Internal thinking and reasoning MUST be in English.
- Communication with the human user MUST default to **Chinese**
  unless the user explicitly requests otherwise.

**Rationale**: Matching the user's preferred language reduces
friction. English internals maintain consistency with code
and documentation.

## Quality Gates

All implementation work MUST pass these gates before claiming
completion:

- **Lint/Format**: Run project linter and formatter (if present).
- **Type Check**: Run type checker (if applicable to the
  language/framework).
- **Tests**: Run the full test suite; all tests MUST pass.
- **Build/Smoke Test**: Run build and smoke test (if applicable).
- If CI is absent or cannot be run in the current environment,
  explicitly state what was run locally and the results.

**Compliance**: Every PR, review, and task completion MUST
demonstrate that quality gates were satisfied.

## Development Workflow & Change Management

### Mandatory Plan-Before-Code Rule

Before making ANY code changes, the following steps are
REQUIRED:

1. Write a plan document describing: what will be changed,
   why, which files are affected, the approach, and
   potential risks.
2. Present the plan to the user and **wait for explicit
   approval**.
3. Only proceed with implementation after the user confirms.

This applies to ALL code modifications — bug fixes, features,
refactors, config changes, dependency updates, etc.
No exceptions.

### Mandatory User Approval Gate

At EVERY phase transition in the spec-driven workflow
(spec → plan → tasks → implementation), the AI agent
MUST present the completed artifact to the user and
**wait for explicit approval** before proceeding to the
next phase. This includes but is not limited to:

1. After completing a plan — MUST NOT generate tasks
   until the user explicitly approves the plan.
2. After generating tasks — MUST NOT begin implementation
   until the user explicitly approves the task list.
3. After completing any implementation step — MUST NOT
   proceed to the next step if the user has requested
   review before continuation.

**Proceeding to the next phase without explicit user**
**approval is STRICTLY PROHIBITED. No exceptions.**

### Dependency Management

- New dependencies MUST include justification: intent,
  alternatives considered, and maintenance risk assessment.
- Breaking changes MUST include migration guidance and a
  rollback plan.

### Spec-Driven Development

- If the repo uses Spec Kit / spec-driven development, follow
  its workflow (spec → plan → tasks) where applicable.

### Pull Request Discipline

- Every Pull Request MUST address exactly ONE concern: a
  single feature, a single bug fix, a single refactor, or a
  single infrastructure change. Mixing unrelated changes in
  one PR is PROHIBITED.
- PR scope MUST align with task boundaries defined in
  `tasks.md`. A PR may contain one task or a small group of
  tightly related tasks within the same phase/user story, but
  MUST NOT span unrelated phases or stories.
- The PR description MUST include:
  1. A concise summary of what the PR does and why.
  2. The test results — paste or reference the output of
     `lint`, `typecheck`, `test`, and `build` commands that
     were run before opening the PR. If any gate was skipped,
     explain why.
- If a PR touches multiple packages in the monorepo, it is
  acceptable only when the changes are logically inseparable
  (e.g., adding a shared type AND consuming it in backend
  and frontend in the same story). Otherwise, split into
  separate PRs per package.

**Rationale**: Single-concern PRs are easier to review, easier
to revert, and produce a clean git history. Including test
results in the description provides immediate proof that
quality gates were satisfied.

## Governance

- This constitution supersedes all other development practices
  and conventions for this project.
- Amendments MUST be documented with:
  - Description of the change and rationale.
  - Version bump following semantic versioning (see below).
  - Updated `Last Amended` date.
- Compliance with this constitution MUST be verified during
  every code review and task completion.
- Complexity beyond what principles prescribe MUST be
  explicitly justified.

### Versioning Policy

- **MAJOR**: Backward-incompatible governance/principle
  removals or redefinitions.
- **MINOR**: New principle/section added or materially
  expanded guidance.
- **PATCH**: Clarifications, wording, typo fixes,
  non-semantic refinements.

**Version**: 1.2.0 | **Ratified**: 2026-03-09 | **Last Amended**: 2026-03-10
