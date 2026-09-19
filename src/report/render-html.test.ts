import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssessmentReport } from "../analysis/report-model.js";
import { renderHtml } from "./render-html.js";

describe("renderHtml", () => {
  it("renders metrics, findings, evidence, and escapes source content", () => {
    const html = renderHtml(report(), branding());
    assert.match(html, /Reporter &amp; &lt;team&gt;/);
    assert.match(html, /100\.0%/);
    assert.match(html, /Trend &quot;history&quot;/);
    assert.match(html, /Evidence: CS-003, CS-004/);
    assert.match(html, /CodeScene analysis 123/);
    assert.match(html, /ruleset 1&#039;s next step/);
    assert.match(
      html,
      /<tr><td>CS-003<\/td><td>History<\/td><td>Unavailable<\/td><td>2026-09-17T14:15:55Z<\/td><\/tr><tr><td>CS-004/,
    );
    assert.match(html, /Another finding.*Second finding/s);
    assert.doesNotMatch(html, /Stryker was here/);
    assert.match(html, /src="data:image\/png;base64,neo&amp;see" alt="NeoSee"/);
    assert.match(html, /src="data:image\/png;base64,partner" alt="CodeScene Official Partner"/);
    assert.match(html, /:root \{ color: #172033/);
    assert.match(html, /@media print/);
    assert.match(html, /<strong>1<\/strong>Hotspots/);
    assert.match(html, /2 of 3 project files/);
    assert.match(html, /totals include every page returned by CodeScene/);
    assert.match(html, /Analysis &lt;description&gt;/);
    assert.match(
      html,
      /<tr><td>Files with code health<\/td><td>2<\/td><\/tr><tr><td>Issues classed as defects<\/td><td>1<\/td><\/tr>/,
    );
    assert.match(html, /<tr><td>Lines of code<\/td><td>30<\/td><\/tr>/);
    assert.match(
      html,
      /<tr><td>Type&amp;Script<\/td><td>3<\/td><td>30<\/td><td>2<\/td><td>1<\/td><\/tr><tr><td>JSON<\/td><td>1<\/td><td>4<\/td><td>0<\/td><td>0<\/td><\/tr>/,
    );
    assert.doesNotMatch(html, /All analysed files|Complete file records|Team &amp; one/);
    assert.match(html, /Analysis History · 1 records/);
    assert.match(html, /Unavailable: Endpoint &lt;missing&gt;/);
    assert.match(html, /&quot;code_health&quot;: true/);
  });

  it("renders unavailable coverage and an empty finding state", () => {
    const value = report();
    value.summary.lineCoveragePercent = null;
    value.findings = [];
    value.evidence = [];
    const html = renderHtml(value, branding());
    assert.match(html, /<strong>—<\/strong>Line coverage/);
    assert.match(html, /No findings were selected/);
    assert.match(html, /Generated deterministically from CodeScene/);
  });
});

function report(): AssessmentReport {
  return {
    schemaVersion: "1.0",
    project: { id: 1, name: "Reporter & <team>" },
    analysis: { id: 123, analysedAt: "2026-09-17T14:15:55Z" },
    analysisDetails: {
      description: "Analysis <description>",
      repositoryRevisions: [{ repository: "repo", revision: "abc123" }],
      summary: { files_with_code_health: 2, issues_classed_as_defects: 1 },
      highLevelMetrics: { lines_of_code: 30 },
      languages: [
        { language: "Type&Script", files: 3, blankLines: 1, commentLines: 2, codeLines: 30 },
        { language: "JSON", files: 1, blankLines: 0, commentLines: 0, codeLines: 4 },
      ],
    },
    files: [
      {
        name: "index.ts",
        path: "src/<index>.ts",
        linesOfCode: 30,
        changeFrequency: 2,
        codeHealth: null,
        hotspot: true,
        raw: { path: "src/<index>.ts", owner: "Team & one" },
      },
      {
        name: "healthy.ts",
        path: "src/healthy.ts",
        linesOfCode: 20,
        changeFrequency: 1,
        codeHealth: 9.5,
        hotspot: false,
        raw: { path: "src/healthy.ts", goals: [] },
      },
    ],
    catalogue: reportCatalogue(),
    summary: {
      codeHealth: 10,
      lineCoveragePercent: 100,
      projectFiles: {
        analysedFiles: 3,
        measurableFiles: 2,
        hotspots: 1,
      },
    },
    findings: reportFindings(),
    evidence: reportEvidence(),
  };
}

function reportCatalogue(): AssessmentReport["catalogue"] {
  return {
    analysisHistory: { status: "available", source: "analyses", data: [{ id: 123 }] },
    components: { status: "available", source: "components", data: [] },
    commits: { status: "available", source: "commits", data: [] },
    issues: { status: "available", source: "issues", data: [] },
    commitActivity: { status: "available", source: "activity", data: { trend: [] } },
    authors: { status: "available", source: "authors", data: [] },
    branches: { status: "available", source: "branches", data: [] },
    technicalDebt: { status: "available", source: "debt", data: [] },
    refactoringTargets: { status: "available", source: "targets", data: [] },
    skills: { status: "unavailable", source: "skills", reason: "Endpoint <missing>" },
    badges: { status: "available", source: "badges", data: { code_health: true } },
    repositories: { status: "available", source: "repositories", data: [] },
    deltaAnalyses: { status: "available", source: "deltas", data: [] },
    coverageInsights: { status: "unavailable", source: "coverage", reason: "Not available" },
    coverageOutcomes: { status: "available", source: "outcomes", data: [] },
  };
}

function reportFindings(): AssessmentReport["findings"] {
  return [
    {
      id: "F-001",
      ruleId: "history",
      ruleVersion: "1.0",
      severity: "info",
      title: 'Trend "history"',
      summary: "Not <available>",
      evidenceIds: ["CS-003", "CS-004"],
      recommendation: "Review ruleset 1's next step",
    },
    {
      id: "F-002",
      ruleId: "second",
      ruleVersion: "1.0",
      severity: "info",
      title: "Another finding",
      summary: "Second finding",
      evidenceIds: ["CS-004"],
      recommendation: "Observe",
    },
  ];
}

function reportEvidence(): AssessmentReport["evidence"] {
  return [
    {
      id: "CS-003",
      metric: "History",
      value: "Unavailable",
      observedAt: "2026-09-17T14:15:55Z",
      source: "CodeScene analysis 123",
    },
    {
      id: "CS-004",
      metric: "Files",
      value: 3,
      observedAt: "2026-09-17T14:15:55Z",
      source: "CodeScene analysis 123",
    },
  ];
}

function branding() {
  return {
    neoseeLogoUrl: "data:image/png;base64,neo&see",
    partnerBadgeUrl: "data:image/png;base64,partner",
  };
}
