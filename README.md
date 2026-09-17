# NeoSee Code Health Report

A NeoSee-branded reporting layer on top of CodeScene. It turns analysis data into a concise, client-facing engineering assessment that explains what matters, why it matters, the evidence behind it, and what to do next.

The repository name describes the implementation; **NeoSee Code Health Report** is the working product name.

The initial product is deliberately narrow:

> One CodeScene project in, one polished 10–15 page PDF out.

CodeScene remains the analysis engine and the source of analytical results such as hotspots, Code Health, trends, architectural measures, knowledge risks, and technical-debt targets. This project consumes those results; it does not attempt to reproduce or recalculate them. NeoSee owns the assessment methodology, selection and prioritisation of relevant results, narrative structure, and presentation.

## Why this exists

CodeScene's existing PDF is useful as a lightweight status snapshot, but a NeoSee discovery needs to go further. Stakeholders need a report that connects engineering signals to risk and action without requiring them to explore or interpret another dashboard.

The reporter should make it easy to answer:

- What is the current state of the system?
- Which findings matter most, and why?
- Where can AI-assisted development be used safely?
- What has already been put in place during the engagement?
- What should the client do next to reach its engineering goals?
- What data supports each conclusion?

## Product principles

### Deterministic by default

Findings and priorities are produced by versioned, transparent rules operating on results already calculated by CodeScene. The rules may combine or filter those results to decide what belongs in the client report, but they should not recreate CodeScene's analysis. The same input and ruleset must produce the same assessment.

For example:

```text
CodeScene hotspot
+ Code Health < 5
+ declining trend
= highlight as a high-priority finding
```

Here, hotspot classification, Code Health, and trend values all come from CodeScene. The NeoSee rule only determines their significance in this report. Thresholds will be configurable and every finding will retain the values, source, analysis date, and rule version that selected it.

### Evidence before narrative

Every score, finding, and recommendation must be traceable to source evidence. The rendered report will include human-readable evidence references; the underlying report model will preserve machine-readable provenance.

### AI may edit prose, not decide findings

AI can optionally improve the wording of already-derived narrative sections. It must not create, remove, reprioritise, or alter findings. The complete report must also be producible without an AI service.

### Recommendations should be actionable

A finding should lead to a concrete next step, an expected outcome, and a way to verify progress. Generic advice is not enough.

### Separate data, judgement, and presentation

The CodeScene client, normalised assessment model, rules engine, and renderer should remain independent. This makes the methodology testable and leaves room for other evidence sources later.

The boundary is intentional:

- **CodeScene calculates:** hotspots, Code Health, trends, technical-debt friction, architecture, ownership, delivery, and safeguard measures where available.
- **NeoSee interprets:** which supplied results matter for the engagement, how they relate to the client's goal, their reporting priority, and the appropriate predefined actions.
- **The renderer communicates:** the selected findings, recommendations, and underlying CodeScene evidence in a client-ready form.

## MVP report

The first report should contain:

1. Cover and assessment context
2. Executive engineering health summary
3. Current Code Health and trend
4. AI readiness and AI-safe areas
5. Hotspots and frequently changed code
6. Prioritised technical debt and refactoring targets
7. Architecture and component health
8. Knowledge and ownership risk
9. Delivery and change profile
10. Code Health Safeguards and pull-request trends
11. Progress toward the client's goal, including steps already taken
12. Prioritised recommended actions
13. Methodology and evidence appendix

Sections should degrade honestly when a project does not expose the required data. Missing or stale evidence is itself reported; it is never silently replaced by a guess.

## Intended pipeline

```text
CodeScene REST API v2
      ↓
validated source snapshots
      ↓
normalised NeoSee reporting model
      ↓
versioned deterministic rules
      ↓
structured findings and recommendations
      ↓
HTML/CSS templates
      ↓
Playwright-generated PDF
```

The structured report model is the main product boundary. It should be possible to inspect it as JSON, test it without rendering a PDF, and eventually feed it with Git, CI/CD, delivery, and other engineering data.

## Proposed implementation

- TypeScript and Node.js
- A typed CodeScene API client with captured fixtures
- Runtime validation at the external-data boundary
- A pure rules engine returning findings with evidence
- HTML/CSS templates designed for A4 output
- Playwright for deterministic PDF generation
- Unit, contract, snapshot, and visual regression tests

Exact libraries and API coverage will be selected during the first discovery spike rather than encoded here prematurely.

CodeScene's current Enterprise documentation confirms REST API v2, bearer authentication using a personal access token, paginated file and component data, technical-debt targets, KPI trends, and Code Health Safeguards. Availability can still vary by CodeScene version, role, licence, and configured integrations, so the reporter will negotiate and record capabilities rather than assume every section is populated. See the [official REST API documentation](https://docs.enterprise.codescene.io/latest/integrations/rest-api.html).

## Example finding shape

```ts
type Finding = {
  id: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  subject: { type: "project" | "component" | "file"; id: string; label: string };
  summary: string;
  evidence: Array<{
    id: string;
    metric: string;
    value: string | number | boolean;
    observedAt: string;
    source: string;
  }>;
  recommendationIds: string[];
};
```

This is illustrative, but it captures the core contract: a conclusion cannot exist without its rule identity and supporting evidence.

In the PDF, each evidence record should have a short reference such as `CS-014`, allowing a recommendation in the executive section to point to the exact file, measurements, analysis, and snapshot in the appendix.

## What the MVP is not

- A replacement for CodeScene or its dashboards
- A new static-analysis engine
- A second implementation of CodeScene's hotspot or technical-debt calculations
- A live portfolio dashboard
- An autonomous AI assessment
- A promise that every proposed report section is available from current APIs
- A benchmarking product across customers

## Longer-term direction

The reporter can evolve into a broader **NeoSee Engineering Assessment**. CodeScene would become one source alongside repository activity, CI/CD, delivery metrics, developer workflows, and engagement observations. NeoSee would own a versioned assessment methodology and a consistent stakeholder-facing output across projects and portfolios.

Possible later capabilities include portfolio reporting, goal tracking across engagements, AI token or context estimates, projected PR review savings, and recurring reports that show whether recommended actions are improving outcomes. Any predictive metric must state its model, assumptions, and confidence; it must not be presented as observed fact.

## Current status

This repository is at the product-definition stage. The immediate next step is an API and report-content spike followed by one thin, end-to-end PDF slice. See [PLAN.md](./PLAN.md).

## Open-source posture

No decision has been made. A sensible boundary may be to open-source the API-to-PDF plumbing and a basic ruleset while keeping NeoSee's engagement methodology, benchmarks, and premium report modules private. That boundary should be revisited after the MVP shows where the differentiated value actually sits.
