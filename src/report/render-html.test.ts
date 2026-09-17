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
    summary: {
      codeHealth: 10,
      lineCoveragePercent: 100,
      analysedFiles: 3,
      measurableFiles: 2,
      hotspots: 1,
    },
    findings: [
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
    ],
    evidence: [
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
    ],
  };
}

function branding() {
  return {
    neoseeLogoUrl: "data:image/png;base64,neo&see",
    partnerBadgeUrl: "data:image/png;base64,partner",
  };
}
