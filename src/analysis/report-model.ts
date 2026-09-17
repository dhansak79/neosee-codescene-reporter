import type { ProjectAnalysisSnapshot } from "../codescene/types.js";

export type Evidence = {
  id: string;
  metric: string;
  value: string | number;
  observedAt: string;
  source: string;
};

export type Finding = {
  id: string;
  ruleId: string;
  ruleVersion: string;
  severity: "info";
  title: string;
  summary: string;
  evidenceIds: string[];
  recommendation: string;
};

export type AssessmentReport = {
  schemaVersion: "1.0";
  project: { id: string | number; name: string };
  analysis: { id: number; analysedAt: string };
  summary: {
    codeHealth: number;
    lineCoveragePercent: number | null;
    loadedFilePage: {
      analysedFiles: number;
      measurableFiles: number;
      hotspots: number;
    };
  };
  findings: Finding[];
  evidence: Evidence[];
};

const RULE_VERSION = "1.0";

export function buildAssessment(snapshot: ProjectAnalysisSnapshot): AssessmentReport {
  const observedAt = snapshot.latestAnalysis.analysedAt;
  const source = `CodeScene analysis ${snapshot.latestAnalysis.id}`;
  const codeHealthEvidence = evidence(
    "CS-001",
    "Project Code Health",
    snapshot.project.analysis.codeHealth.now,
  );
  const coverageEvidence = evidence(
    "CS-002",
    "Line coverage",
    snapshot.project.analysis.lineCoveragePercent ?? "Unavailable",
  );
  const historyAvailable = snapshot.project.analysis.codeHealth.month !== null;
  const historyEvidence = evidence(
    "CS-003",
    "One-month Code Health history",
    snapshot.project.analysis.codeHealth.month ?? "Unavailable",
  );
  const evidenceRecords = [codeHealthEvidence, coverageEvidence, historyEvidence].map((item) => ({
    ...item,
    observedAt,
    source,
  }));

  return {
    schemaVersion: "1.0",
    project: { id: snapshot.project.id, name: snapshot.project.name },
    analysis: { id: snapshot.latestAnalysis.id, analysedAt: observedAt },
    summary: {
      codeHealth: snapshot.project.analysis.codeHealth.now,
      lineCoveragePercent: snapshot.project.analysis.lineCoveragePercent,
      loadedFilePage: {
        analysedFiles: snapshot.files.length,
        measurableFiles: snapshot.files.filter((file) => file.codeHealth !== null).length,
        hotspots: snapshot.files.filter((file) => file.hotspot).length,
      },
    },
    findings: historyAvailable
      ? []
      : [
          {
            id: "F-001",
            ruleId: "analysis-history-availability",
            ruleVersion: RULE_VERSION,
            severity: "info",
            title: "Trend history is not yet available",
            summary:
              "The current analysis is usable as a baseline, but CodeScene does not yet provide a one-month comparison for this project.",
            evidenceIds: ["CS-003"],
            recommendation:
              "Regenerate this assessment after one month of analysis history to evaluate direction of travel.",
          },
        ],
    evidence: evidenceRecords,
  };
}

function evidence(id: string, metric: string, value: string | number) {
  return { id, metric, value };
}
