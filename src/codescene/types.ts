export type CodeSceneProject = {
  id: string | number;
  name: string;
};

export type ProjectPage = {
  projects: CodeSceneProject[];
  raw: unknown;
};

export type CodeHealthTrend = {
  now: number;
  month: number | null;
  year: number | null;
};

export type CodeSceneProjectDetails = CodeSceneProject & {
  analysis: {
    codeHealth: CodeHealthTrend;
    hotspotCodeHealth: CodeHealthTrend;
    authors: { total: number; active: number };
    lineCoveragePercent: number | null;
  };
};

export type CodeSceneAnalysis = {
  id: number;
  name: string;
  analysedAt: string;
  description: string;
  repositoryRevisions: { repository: string; revision: string }[];
  summary: Record<string, number>;
  languages: CodeSceneLanguageSummary[];
  highLevelMetrics: Record<string, number>;
};

export type CodeSceneLanguageSummary = {
  language: string;
  files: number;
  blankLines: number;
  commentLines: number;
  codeLines: number;
};

export type CodeSceneFile = {
  name: string;
  path: string;
  linesOfCode: number;
  changeFrequency: number;
  codeHealth: number | null;
  hotspot: boolean;
  raw: JsonValue;
};

export type ProjectAnalysisSnapshot = {
  project: CodeSceneProjectDetails;
  latestAnalysis: CodeSceneAnalysis;
  files: CodeSceneFile[];
  catalogue: Record<CodeSceneDatasetName, CodeSceneDataset>;
};

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type CodeSceneDataset =
  | { status: "available"; source: string; data: JsonValue }
  | { status: "unavailable"; source: string; reason: string };

export type CodeSceneDatasetName =
  | "analysisHistory"
  | "components"
  | "commits"
  | "issues"
  | "commitActivity"
  | "authors"
  | "branches"
  | "technicalDebt"
  | "refactoringTargets"
  | "skills"
  | "badges"
  | "repositories"
  | "deltaAnalyses"
  | "coverageInsights"
  | "coverageOutcomes";
