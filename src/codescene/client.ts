import type {
  CodeHealthTrend,
  CodeSceneAnalysis,
  CodeSceneFile,
  CodeSceneProject,
  CodeSceneProjectDetails,
  ProjectAnalysisSnapshot,
  ProjectPage,
} from "./types.js";

export type CodeSceneClientOptions = {
  server: string;
  token: string;
  fetch?: typeof globalThis.fetch;
};

type ValidationContext = { message: string };

export class CodeSceneApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CodeSceneApiError";
  }
}

export class CodeSceneClient {
  private readonly baseUrl: URL;
  private readonly token: string;
  private readonly request: typeof globalThis.fetch;

  constructor(options: CodeSceneClientOptions) {
    this.baseUrl = normalizeServer(options.server);
    this.token = options.token;
    this.request = options.fetch ?? globalThis.fetch;
  }

  async listProjects(): Promise<ProjectPage> {
    const raw = await this.get("projects");
    return { projects: parseProjects(raw), raw };
  }

  async getProjectAnalysis(projectId: string | number): Promise<ProjectAnalysisSnapshot> {
    const projectPath = `projects/${encodeURIComponent(String(projectId))}`;
    const [project, analyses, files] = await Promise.all([
      this.get(projectPath),
      this.get(`${projectPath}/analyses`),
      this.get(`${projectPath}/analyses/latest/files`),
    ]);

    return {
      project: parseProjectDetails(project),
      latestAnalysis: parseLatestAnalysis(analyses),
      files: parseFiles(files),
    };
  }

  private async get(path: string): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    const response = await this.request(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).trim();
      const suffix = detail ? `: ${detail}` : "";
      throw new CodeSceneApiError(
        `CodeScene request failed (${response.status} ${response.statusText})${suffix}`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new CodeSceneApiError(
        `CodeScene returned ${contentType || "an unknown content type"}, expected JSON`,
        response.status,
      );
    }

    return response.json() as Promise<unknown>;
  }
}

function normalizeServer(server: string): URL {
  const url = new URL(server);
  if (url.protocol !== "https:") {
    throw new TypeError("CodeScene server URL must use HTTPS");
  }

  const pathname = url.pathname.replace(/\/$/, "");

  if (pathname.endsWith("/api/v2") || pathname.endsWith("/v2")) {
    url.pathname = `${pathname}/`;
  } else {
    url.pathname = `${pathname}/api/v2/`;
  }

  return url;
}

function parseProjects(value: unknown): CodeSceneProject[] {
  const candidates = findProjectCandidates(value);

  return candidates.map((project, index) => {
    if (!isProject(project)) {
      throw new TypeError(`Unexpected project at index ${index}: id or name is missing`);
    }

    return { id: project.id, name: project.name };
  });
}

function findProjectCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.projects)) return value.projects;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  throw new TypeError("Unexpected CodeScene projects response: no project list found");
}

function isProject(value: unknown): value is Record<string, unknown> & CodeSceneProject {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  return typeof value.id === "string" || typeof value.id === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  // Stryker disable next-line ConditionalExpression: callers already reject every non-object through required property validation.
  return typeof value === "object" && value !== null;
}

function parseProjectDetails(value: unknown): CodeSceneProjectDetails {
  const context = { message: "Unexpected CodeScene project details response" };
  const project = requireRecord(value, context);
  if (!isProject(project)) throw new TypeError(context.message);
  const analysis = requireRecord(project.analysis, context);
  const authors = parseAuthors(analysis.authors);
  const coverage = analysis.code_coverage;

  return {
    id: project.id,
    name: project.name,
    analysis: {
      codeHealth: parseTrend(analysis.code_health, "code health"),
      hotspotCodeHealth: parseTrend(analysis.hotspot_code_health, "hotspot code health"),
      authors,
      lineCoveragePercent:
        isRecord(coverage) && isNullableNumber(coverage.line_coverage_percent)
          ? coverage.line_coverage_percent
          : null,
    },
  };
}

function parseAuthors(value: unknown): { total: number; active: number } {
  const context = { message: "Unexpected CodeScene project author metrics" };
  const authors = requireRecord(value, context);
  return {
    total: requireNumber(authors.total, context),
    active: requireNumber(authors.active, context),
  };
}

function parseTrend(value: unknown, label: string): CodeHealthTrend {
  const context = { message: `Unexpected CodeScene ${label} metrics` };
  const trend = requireRecord(value, context);
  return {
    now: requireNumber(trend.now, context),
    month: requireNullableNumber(trend.month, context),
    year: requireNullableNumber(trend.year, context),
  };
}

function parseLatestAnalysis(value: unknown): CodeSceneAnalysis {
  const listContext = { message: "Unexpected CodeScene analyses response: no analyses found" };
  const response = requireRecord(value, listContext);
  const analyses = requireArray(response.analyses, listContext);
  if (analyses.length === 0) throw new TypeError(listContext.message);
  const itemContext = { message: "Unexpected latest CodeScene analysis" };
  const analysis = requireRecord(analyses[0], itemContext);
  return {
    id: requireNumber(analysis.id, itemContext),
    name: requireString(analysis.name, itemContext),
    analysedAt: requireString(analysis.analysistime, itemContext),
  };
}

function parseFiles(value: unknown): CodeSceneFile[] {
  const context = { message: "Unexpected CodeScene files response" };
  const response = requireRecord(value, context);
  return requireArray(response.files, context).map((file, index) => parseFile(file, index));
}

function parseFile(value: unknown, index: number): CodeSceneFile {
  const context = { message: `Unexpected CodeScene file at index ${index}` };
  const file = requireRecord(value, context);
  const codeHealth = requireRecord(file.code_health, context);
  return {
    name: requireString(file.name, context),
    path: requireString(file.path, context),
    linesOfCode: requireNumber(file.lines_of_code, context),
    changeFrequency: requireNumber(file.change_frequency, context),
    codeHealth: parseFileCodeHealth(codeHealth.current_score, {
      message: `Unexpected CodeScene file Code Health at index ${index}`,
    }),
    hotspot: requireBoolean(file.hotspot, context),
  };
}

function parseFileCodeHealth(value: unknown, context: ValidationContext): number | null {
  if (value === "-") return null;
  return requireNumber(value, context);
}

function requireRecord(value: unknown, context: ValidationContext): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(context.message);
  return value;
}

function requireArray(value: unknown, context: ValidationContext): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(context.message);
  return value;
}

function requireString(value: unknown, context: ValidationContext): string {
  if (typeof value !== "string") throw new TypeError(context.message);
  return value;
}

function requireBoolean(value: unknown, context: ValidationContext): boolean {
  if (typeof value !== "boolean") throw new TypeError(context.message);
  return value;
}

function requireNumber(value: unknown, context: ValidationContext): number {
  if (!isNumber(value)) throw new TypeError(context.message);
  return value;
}

function requireNullableNumber(value: unknown, context: ValidationContext): number | null {
  if (!isNullableNumber(value)) throw new TypeError(context.message);
  return value;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isNumber(value: unknown): value is number {
  // Stryker disable next-line LogicalOperator,ConditionalExpression: Number.isFinite also rejects every non-number value, making those mutations equivalent.
  return typeof value === "number" && Number.isFinite(value);
}
