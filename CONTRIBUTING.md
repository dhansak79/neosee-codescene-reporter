# Contributing

Thank you for contributing to NeoSee Code Health Report. This project treats reproducibility, evidence, Code Health, and automated verification as product requirements rather than optional cleanup.

## Prerequisites

- Node.js 22 or later
- npm
- Git
- The CodeScene `cs` CLI for the local pre-commit safeguard
- A CodeScene personal access token when exercising the live API client

Install the project dependencies with:

```console
npm ci
```

Use `npm install` only when intentionally changing dependencies. Commit the resulting `package-lock.json` changes with `package.json`.

## Environment

The CLI reads these environment variables:

- `CS_ACCESS_TOKEN` — preferred CodeScene personal access token variable
- `CODESCENE_SERVER` — optional Enterprise or on-premises server URL; hosted CodeScene is the default

The lowercase `cs_access_token` and `CODESCENE_TOKEN` remain supported as token aliases.

Copy `.env.example` if a local environment file is useful, but never commit credentials. `.env` files, source snapshots, generated PDFs, coverage output, build output, and Stryker working directories are ignored by Git.

Treat project names, repository paths, contributor details, API responses, and generated findings as client-confidential data. Sanitise fixtures before committing them.

## Development commands

| Command                  | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `npm run dev`            | Build and run the project-list CLI                      |
| `npm run build`          | Compile TypeScript to `dist/`                           |
| `npm run check`          | Type-check without emitting files                       |
| `npm run lint`           | Run strict, type-aware ESLint                           |
| `npm run format`         | Apply Prettier formatting                               |
| `npm run format:check`   | Verify formatting without changing files                |
| `npm run quality`        | Run linting, formatting verification, and type-checking |
| `npm run test:unit`      | Run unit tests with 100% coverage thresholds            |
| `npm run test:mutation`  | Run Stryker with a 100% mutation threshold              |
| `npm run security:audit` | Reject high or critical npm advisories                  |
| `npm run security:snyk`  | Scan dependencies with Snyk                             |
| `npm run code-health`    | Run the complete pre-commit hook manually               |

Snyk requires `SNYK_TOKEN` in the environment. It is primarily enforced in CI through the corresponding GitHub repository secret.

## Git hooks

Enable the version-controlled hooks once per clone:

```console
git config core.hooksPath .githooks
```

### Pre-commit

The pre-commit hook runs:

1. `cs delta --git-hook --staged`
2. ESLint, Prettier verification, and TypeScript checking
3. Unit tests with 100% statement, branch, function, and line coverage

CodeScene evaluates the exact staged change and rejects newly introduced Code Health findings. When it reports a problem, agents should use the CodeScene MCP `code_health_review` and `code_health_score` tools for guidance; humans can run `cs delta --staged` for detailed CLI output.

Do not bypass the hook with `--no-verify` to merge unfinished work. If an emergency requires bypassing a local hook, the same mandatory checks must be demonstrated elsewhere before merge.

### Pre-push

The pre-push hook runs Stryker and requires a 100% mutation score. Surviving or uncovered mutants reject the push. Mutation testing is intentionally later than unit testing because it is more expensive.

## Testing policy

Unit tests are colocated with their source modules as `*.test.ts`. This keeps behavior and tests discoverable and ensures they move together. Use a top-level `tests/` directory later for integration, contract, end-to-end, or cross-module tests and their sanitised fixtures.

All executable application logic must maintain:

- 100% statement coverage
- 100% branch coverage
- 100% function coverage
- 100% line coverage
- 100% Stryker mutation score

The zero-logic `src/cli.ts` executable wrapper and type-only `src/codescene/types.ts` module are excluded from coverage and mutation measurement. Do not add behavior to those files. Move behavior into a tested application module instead.

Coverage alone is insufficient: tests must assert observable behavior strongly enough to kill meaningful mutants. Equivalent mutants may be suppressed only at the narrowest possible location, with a comment explaining why the mutation cannot change observable behavior.

Tests must not depend on a live CodeScene account unless they are explicitly designated integration or contract tests. Unit tests should inject dependencies and use representative responses. Never put live tokens or unsanitised customer responses in fixtures.

## Code standards

- Keep TypeScript strict and preserve `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Validate external API data at the boundary before it enters the reporting model.
- Keep transport, normalisation, assessment, and rendering concerns separate.
- Let CodeScene calculate analytical metrics. NeoSee code may select, combine, prioritise, and explain CodeScene results, but should not recreate hotspot, Code Health, or technical-debt algorithms.
- Keep findings deterministic and retain their evidence, source analysis, and rule version.
- Do not allow optional AI wording to change findings, evidence, severity, priority, or recommended actions.
- Prefer small functions, explicit names, and dependency injection at external boundaries.
- Do not weaken lint, coverage, mutation, or CodeScene rules merely to make a change pass.

Run `npm run format` before requesting review. Generated code must satisfy the same checks unless a documented, narrowly scoped exclusion is justified.

## Dependency and security policy

- Add runtime dependencies only when they provide clear product value.
- Keep build, lint, and test tools in `devDependencies`.
- Review dependency licences, maintenance status, transitive risk, and bundle/runtime impact.
- Run `npm audit` after dependency changes.
- Do not reduce the audit or Snyk severity thresholds to accommodate an advisory.
- Use a documented package override only when the patched transitive version is compatible and the parent package has not yet updated its constraint.
- Dependabot monitors npm and GitHub Actions dependencies weekly.

## Continuous integration

GitHub Actions runs on every pull request targeting `main` and every push to `main`. The workflow contains separate jobs for:

- linting, formatting, type-checking, and 100% unit coverage;
- 100% mutation coverage;
- npm dependency auditing on pull requests and pushes, plus Snyk scanning after trusted pushes to `main`.

CodeScene CI is configured separately and is intentionally not part of this repository's workflow. Local CodeScene pre-commit protection remains mandatory.

Repository administrators must configure `SNYK_TOKEN` for the trusted main-branch workflow. The token is intentionally unavailable to fork and Dependabot pull requests. Dependabot alerts and security updates must also be enabled in GitHub repository settings.

## Pull requests

Keep pull requests focused and explain:

- what changed and why;
- the evidence or requirement driving the change;
- how the result was tested;
- any schema, ruleset, report, security, or dependency impact;
- whether generated output or client-visible wording changed.

Before requesting review:

```console
npm run quality
npm run test:unit
npm run test:mutation
npm run security:audit
```

The pull request should pass all GitHub checks. Do not merge with unresolved CodeScene findings, surviving mutants, coverage shortfalls, lint errors, type errors, high-severity dependency advisories, or Snyk failures.

## Commit hygiene

- Use concise, imperative commit messages.
- Keep unrelated changes in separate commits.
- Never commit tokens, customer data, generated reports, coverage output, or local environment files.
- Review the staged diff before committing and verify that hook changes themselves are executable and version-controlled.
