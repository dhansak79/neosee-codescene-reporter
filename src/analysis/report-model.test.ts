import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProjectAnalysisSnapshot } from "../codescene/types.js";
import { buildAssessment } from "./report-model.js";

describe("buildAssessment", () => {
  it("builds traceable summary evidence and reports unavailable history", () => {
    const report = buildAssessment(snapshot(null, null));

    assert.deepEqual(report.summary, {
      codeHealth: 10,
      lineCoveragePercent: null,
      projectFiles: {
        analysedFiles: 3,
        measurableFiles: 2,
        hotspots: 1,
      },
    });
    assert.deepEqual(report.findings, [
      {
        id: "F-001",
        ruleId: "analysis-history-availability",
        ruleVersion: "1.0",
        severity: "info",
        title: "Trend history is not yet available",
        summary:
          "The current analysis is usable as a baseline, but CodeScene does not yet provide a one-month comparison for this project.",
        evidenceIds: ["CS-003"],
        recommendation:
          "Regenerate this assessment after one month of analysis history to evaluate direction of travel.",
      },
    ]);
    assert.deepEqual(
      report.evidence.map(({ id, metric, value, source }) => ({ id, metric, value, source })),
      [
        {
          id: "CS-001",
          metric: "Project Code Health",
          value: 10,
          source: "CodeScene analysis 123",
        },
        {
          id: "CS-002",
          metric: "Line coverage",
          value: "Unavailable",
          source: "CodeScene analysis 123",
        },
        {
          id: "CS-003",
          metric: "One-month Code Health history",
          value: "Unavailable",
          source: "CodeScene analysis 123",
        },
      ],
    );
  });

  it("does not create a history finding when a comparison exists", () => {
    const report = buildAssessment(snapshot(9.5, 100));
    assert.deepEqual(report.findings, []);
    assert.equal(report.evidence[1]?.value, 100);
    assert.equal(report.evidence[2]?.value, 9.5);
  });
});

function snapshot(month: number | null, coverage: number | null): ProjectAnalysisSnapshot {
  return {
    project: {
      id: 84792,
      name: "Reporter",
      analysis: {
        codeHealth: { now: 10, month, year: null },
        hotspotCodeHealth: { now: 0, month: null, year: null },
        authors: { total: 2, active: 2 },
        lineCoveragePercent: coverage,
      },
    },
    latestAnalysis: {
      id: 123,
      name: "Reporter",
      analysedAt: "2026-09-17T14:15:55Z",
      description: "Report analysis",
      repositoryRevisions: [{ repository: "reporter", revision: "abc123" }],
      summary: { files: 3 },
      languages: [
        { language: "TypeScript", files: 3, blankLines: 1, commentLines: 2, codeLines: 30 },
      ],
      highLevelMetrics: { lines_of_code: 30 },
    },
    files: [file("a.ts", 10, true), file("b.ts", null, false), file("c.ts", 9.5, false)],
    catalogue: catalogue(),
  };
}

function catalogue(): ProjectAnalysisSnapshot["catalogue"] {
  return {
    analysisHistory: available([]),
    components: available([]),
    commits: available([]),
    issues: available([]),
    commitActivity: available([]),
    authors: available([]),
    branches: available([]),
    technicalDebt: available([]),
    refactoringTargets: available([]),
    skills: available([]),
    badges: available({}),
    repositories: available([]),
    deltaAnalyses: available([]),
    coverageInsights: unavailable(),
    coverageOutcomes: unavailable(),
  };
}

function available(data: never[] | Record<string, never>) {
  return { status: "available" as const, source: "source", data };
}

function unavailable() {
  return { status: "unavailable" as const, source: "source", reason: "Not available" };
}

function file(name: string, codeHealth: number | null, hotspot: boolean) {
  return {
    name,
    path: `src/${name}`,
    linesOfCode: 10,
    changeFrequency: 1,
    codeHealth,
    hotspot,
    raw: { name, hotspot },
  };
}
