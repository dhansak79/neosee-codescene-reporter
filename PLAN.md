# Delivery plan

This plan validates the riskiest assumptions early: what the CodeScene APIs expose, whether those signals support useful deterministic findings, and whether the resulting document works for technical and executive readers.

## Definition of done for the MVP

Given credentials and a CodeScene project identifier, the reporter can fetch the latest analysis, validate and normalise the response, apply a versioned ruleset, and generate a polished 10–15 page PDF plus its machine-readable JSON assessment.

The MVP is complete when:

- repeated runs against the same captured data and ruleset produce equivalent findings;
- every reported finding links to its source metrics and rule version;
- missing, stale, or unavailable data is visible in the report;
- the report contains no invented analysis or unsupported recommendation;
- secrets and raw customer data are absent from logs and generated fixtures;
- one representative project can be processed end to end;
- NeoSee has reviewed the document as a usable output of a five-day discovery;
- technical and stakeholder readers can understand the top priorities without opening CodeScene.

## Phase 0 — Product and API discovery

**Goal:** replace assumptions with a verified source-to-section map.

- Define the primary reader, client goal, reporting period, and engagement inputs.
- Inventory the CodeScene API endpoints available to the intended licence and deployment type.
- Capture representative, sanitised responses for a single project.
- Record pagination, rate limits, authentication, analysis freshness, and failure behaviour.
- Map each proposed report claim to an API field or mark it as unavailable.
- Confirm which AI-readiness, architecture, knowledge, delivery, and PR signals can be supported directly.
- Decide how clients record engagement context and steps already taken when those facts do not come from CodeScene.
- Compare the proposed report against the supplied four-page CodeScene report to avoid merely restyling the same content.

**Deliverable:** an API capability matrix, sanitised fixtures, a report outline, and a short list of unsupported claims.

**Exit criterion:** every MVP section has an identified evidence source, an explicit manual input, or a documented unavailable state.

### Verified API starting points

The following REST API v2 surfaces are confirmed in the current CodeScene Enterprise documentation and form the initial discovery set:

```text
GET /api/v2/projects
GET /api/v2/projects/{project-id}/analyses/latest/files
GET /api/v2/projects/{project-id}/analyses/latest/components
GET /api/v2/projects/{project-id}/analyses/latest/technical-debt
GET /api/v2/projects/{project-id}/analyses/latest/technical-debt?refactoring_targets=true
GET /api/v2/code-health/projects/{project-id}/safeguards/pr/insights
GET /api/v2/code-health/projects/{project-id}/safeguards/pr/outcomes
```

The files APIs support pagination, field selection, and ordering by `lines_of_code`, `change_frequency`, `number_of_defects`, `code_health`, or `cost`. Safeguards responses include aggregated and per-PR detected, fixed, ignored, and suppressed findings. MCP safeguard endpoints also exist, but some are user-scoped and some require administrator access, so MCP adoption must remain a capability-dependent report module.

Authentication should use `Authorization: Bearer <personal-access-token>`. The token will be read from `CODESCENE_TOKEN`, never accepted as a CLI argument or written into source snapshots. Deployment-specific base URLs and installed CodeScene versions remain configurable.

Source: [CodeScene Enterprise REST API documentation](https://docs.enterprise.codescene.io/latest/integrations/rest-api.html). Response schemas and access in the target customer environment still need fixture-based verification.

## Phase 1 — Walking skeleton

**Goal:** prove the complete path with the smallest useful report.

- Set up the TypeScript project, linting, tests, configuration, and CI.
- Implement credentials and project configuration without persisting secrets.
- Fetch one verified project-summary endpoint and save a source snapshot.
- Validate the response and map it into the reporting model.
- Implement one deterministic rule with attached evidence.
- Render a cover, executive summary, one finding, and an evidence page.
- Generate the PDF through Playwright.

**Deliverable:** a CLI-driven sample PDF and JSON assessment generated from both live data and a fixture.

**Exit criterion:** one command can reproduce the sample locally from a fixture without network access.

### Proposed interface

```console
CODESCENE_TOKEN=... neosee-report \
  --server https://codescene.example.com \
  --project 1234 \
  --output client-assessment.pdf
```

The CLI should also accept a fixture or snapshot input for deterministic offline generation. Configuration that belongs in version control—ruleset, thresholds, exclusions, branding, and reporting period—should live in a file such as `config/neosee.yml`; credentials must not.

### Proposed source layout

```text
src/
├── codescene/
│   ├── endpoints/
│   ├── client.ts
│   └── types.ts
├── analysis/
│   ├── rules/
│   ├── findings.ts
│   └── report-model.ts
├── charts/
├── report/
│   ├── templates/
│   ├── styles/
│   └── render.ts
└── cli.ts
```

This is a boundary sketch, not a commitment to one file per concept. The important separation is transport, normalisation, deterministic assessment, and rendering.

## Phase 2 — Reporting model and rules

**Goal:** create the auditable core before expanding presentation.

- Define source snapshot, project, metric, finding, recommendation, evidence, goal, and report metadata schemas.
- Add stable identifiers and source timestamps throughout the model.
- Define severity and priority independently; document how each is calculated.
- Implement initial rules for:
  - unhealthy and declining hotspots;
  - frequently changed unhealthy code;
  - component-level health concentration;
  - knowledge loss, knowledge islands, and ownership risk;
  - delivery or change-profile concerns;
  - absent or underused PR safeguards;
  - analysis freshness and data completeness;
  - candidate AI-safe and AI-caution areas, where evidence supports them.
- Map rules to a curated recommendation catalogue rather than generating free-form actions.
- Include rule and methodology versions in every output.
- Add boundary and regression tests for every rule.

**Deliverable:** a documented ruleset and a fixture-based assessment JSON file.

**Exit criterion:** reviewers can reconstruct every conclusion from the rule definition and attached evidence.

## Phase 3 — Full report experience

**Goal:** produce a document suitable for a client handover.

- Establish NeoSee typography, colour, spacing, charts, and print layout.
- Build the full report outline, table of contents, page furniture, and appendix.
- Add concise “so what?” explanations for non-technical stakeholders.
- Present current state, desired goal, completed engagement steps, and recommended next steps as distinct concepts.
- Show the top actions with impact, rationale, scope, suggested owner, timing, and verification measure.
- Keep detailed evidence out of the executive flow while making it easy to cross-reference.
- Create explicit empty, unavailable, stale, and partial-data states.
- Add visual regression coverage and check A4 pagination, clipped content, orphaned headings, links, and accessibility basics.

**Deliverable:** the first complete 10–15 page report for a representative project.

**Exit criterion:** the report is accepted internally as a credible five-day-discovery deliverable.

## Phase 4 — Hardening and pilot

**Goal:** make generation dependable enough for real engagements.

- Test against projects with different sizes, languages, histories, and integration states.
- Add resilient API retries, timeouts, pagination, caching, and clear error messages.
- Redact sensitive data from logs and define retention for snapshots and reports.
- Pin browser and rendering dependencies for reproducible output.
- Add provenance metadata to the report: project, analysis, generation time, ruleset, and application versions.
- Add schema compatibility tests for captured API responses.
- Review licensing, CodeScene attribution, client confidentiality, and use of benchmark claims.
- Pilot during an engagement and collect structured feedback from the consultant and client.

**Deliverable:** a versioned MVP release and pilot review.

**Exit criterion:** the same workflow succeeds across the agreed pilot set with no unexplained findings or data leakage.

## Phase 5 — Productisation

Only begin this phase after the single-project report proves useful.

- Support scheduled and comparative reports.
- Add portfolio-level aggregation without hiding project-level evidence.
- Introduce additional adapters for Git, CI/CD, delivery, and workflow data.
- Track client goals, actions taken, and progress over time.
- Evaluate optional AI-assisted copy editing behind a strict structured boundary.
- Explore defensible models for token usage, AI readiness, and PR review savings.
- Decide the open-source boundary, packaging, hosting model, and commercial offer.

## Initial report-to-evidence matrix

This is a discovery checklist, not a claim that every item is available from the API.

| Report section      | Candidate evidence                                    | Must be verified                                       |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Executive summary   | Derived top findings, trends, goal progress           | Prioritisation thresholds and available trends         |
| Code Health         | Current score, distribution, historical values        | Granularity and history endpoints                      |
| AI readiness        | Health, complexity, change concentration, safeguards  | A transparent NeoSee definition and sufficient inputs  |
| Hotspots            | Change frequency combined with Code Health            | Hotspot ranking and time window                        |
| Refactoring targets | Hotspot, health trend, component criticality          | Criticality input and recommendation mapping           |
| Architecture        | Components, dependencies, component health            | Component and architecture API coverage                |
| Knowledge risk      | Ownership, former contributors, knowledge islands     | Privacy constraints and API coverage                   |
| Delivery profile    | Commits, contributors, PRs, lead-time-related metrics | Available periods and repository-provider integrations |
| Safeguards          | PR checks and finding outcomes                        | Integration state and PR statistics endpoints          |
| Goal progress       | Client goal, actions taken, metric movement           | Manual engagement input plus historical evidence       |
| Evidence appendix   | Source values, timestamps, rules                      | Stable source identifiers or reproducible references   |

## First rules to prototype

Threshold values remain provisional until tested against real projects.

### High-priority unhealthy hotspot

Trigger when a file is in the configured high-activity cohort, has Code Health below the unhealthy threshold, and is declining over the comparison period.

Required evidence: file identity, current Code Health, prior Code Health, trend period, activity rank or frequency, and analysis timestamp.

Example rendered evidence:

```text
Evidence ID: CS-014
Subject: src/orders/OrderService.java
Code Health: 3.7
Change frequency: 97 commits
Previous Code Health: 5.2
Source: CodeScene analysis 1834
```

### Concentrated maintenance risk

Trigger when a small set of unhealthy files accounts for a material share of recent change activity.

Required evidence: cohort definition, per-file activity, health values, total project activity, and reporting period.

### Knowledge continuity risk

Trigger when a high-activity or business-critical area has low current-team familiarity, a knowledge island, or dominant ownership by a former contributor.

Required evidence: area identity, activity or criticality basis, ownership measure, contributor status, and analysis timestamp.

### Missing preventive safeguard

Trigger when pull-request integration is absent or recent change activity has no corresponding analysis checks.

Required evidence: integration state, change volume, checks observed, and reporting period.

### AI assistance caution

Trigger when an area combines weak Code Health, high change coupling or complexity, and insufficient automated safeguards. This is a caution classification, not a prediction of AI performance.

Required evidence: the exact health, structural, activity, and safeguard metrics used by the versioned rule.

## Cross-cutting decisions

### Configuration

Separate environment-specific access details from assessment policy. Thresholds, reporting periods, exclusions, and ruleset versions should be explicit configuration recorded in the output.

### Reproducibility

Retain a content hash and retrieval timestamp for each source snapshot. Generated reports should identify the analysis and ruleset used. Volatile generation timestamps should not affect finding equality.

### Security and privacy

Treat repository names, file paths, contributor identities, and findings as client-confidential. Avoid recording API tokens, minimise raw-data retention, support redaction for fixtures, and document where report generation runs.

### Optional AI boundary

If AI-assisted writing is introduced, it receives only approved structured facts, returns prose into non-authoritative fields, and cannot modify finding IDs, severities, priorities, evidence, or actions. The report records when such wording assistance was used.

## Open questions

- Which CodeScene deployment and licence tiers must be supported first?
- Which APIs expose historical, file-level, architecture, knowledge, and PR data?
- What is NeoSee's precise and defensible definition of “AI-ready” or “AI-safe”?
- Which engagement facts need a small manual input file or form?
- How should business criticality be supplied when it is not represented in CodeScene?
- Which actions are generic product guidance versus NeoSee's proprietary methodology?
- What must remain private if the renderer or core becomes open source?
- Is the first interface a local CLI, an internal service, or both?
- How long may source snapshots and generated reports be retained?

## Suggested first backlog

1. Obtain API documentation and credentials for a representative project.
2. Produce the report-to-endpoint capability matrix.
3. Capture and sanitise the smallest useful fixture set.
4. Agree the first five rules and their provisional thresholds.
5. Define the assessment JSON schema.
6. Build the thin end-to-end PDF slice.
7. Review it with the person who delivers the five-day discovery.
8. Expand only the sections supported by evidence.
