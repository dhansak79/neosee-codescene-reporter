# Agent instructions

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing this repository.

- Keep CodeScene as the analysis engine. Consume and explain its results; do not recreate its Code Health, hotspot, or technical-debt calculations.
- Keep API transport, validation, assessment logic, and report rendering separate. Findings must remain deterministic and evidence-backed.
- Add or update colocated unit tests for behavior changes. Maintain 100% statement, branch, function, line, and mutation coverage.
- Before handing off code, run `npm run quality`, `npm run test:unit`, and `npm run test:mutation`.
- Respect the version-controlled Git hooks. If CodeScene rejects a change, use its MCP `code_health_review` and `code_health_score` tools to guide the refactor; do not weaken or bypass the gate.
- Never commit tokens, `.env` files, unsanitised CodeScene responses, customer data, generated reports, coverage output, or mutation-test working files.
- Preserve unrelated user changes and keep commits focused. Do not commit unless the user explicitly asks.
