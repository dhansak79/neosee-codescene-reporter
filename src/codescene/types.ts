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
};

export type CodeSceneFile = {
  name: string;
  path: string;
  linesOfCode: number;
  changeFrequency: number;
  codeHealth: number | null;
  hotspot: boolean;
};

export type ProjectAnalysisSnapshot = {
  project: CodeSceneProjectDetails;
  latestAnalysis: CodeSceneAnalysis;
  files: CodeSceneFile[];
};
