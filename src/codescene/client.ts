import type {
  CodeHealthTrend,
  CodeSceneAnalysis,
  CodeSceneDataset,
  CodeSceneDatasetName,
  CodeSceneFile,
  CodeSceneProject,
  CodeSceneProjectDetails,
  ProjectAnalysisSnapshot,
  ProjectPage,
  JsonValue,
} from "./types.js";

export type CodeSceneClientOptions = {
  server: string;
  token: string;
  fetch?: typeof globalThis.fetch;
};

type ValidationContext = { message: string };
type FilePage = { files: CodeSceneFile[]; page: number; maxPages: number };
type DatasetRequest = {
  name: CodeSceneDatasetName;
  path: string;
  collection?: string;
  optional?: boolean;
};
type PagedDatasetRequest = DatasetRequest & { collection: string };
type DatasetPageRequest = { dataset: PagedDatasetRequest; page: number };

const FILE_PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 60_000;

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
    const [project, latestAnalysis, files] = await Promise.all([
      this.get(projectPath),
      this.get(`${projectPath}/analyses/latest`),
      this.getAllFiles(`${projectPath}/analyses/latest/files`),
    ]);
    const catalogue = await this.getCatalogue({ projectPath });

    return {
      project: parseProjectDetails(project),
      latestAnalysis: parseLatestAnalysis(latestAnalysis),
      files,
      catalogue,
    };
  }

  private async getCatalogue(context: {
    projectPath: string;
  }): Promise<Record<CodeSceneDatasetName, CodeSceneDataset>> {
    const { projectPath } = context;
    const latest = `${projectPath}/analyses/latest`;
    const requests: DatasetRequest[] = [
      { name: "analysisHistory", path: `${projectPath}/analyses`, collection: "analyses" },
      { name: "components", path: `${latest}/components`, collection: "components" },
      { name: "commits", path: `${latest}/commits`, collection: "commits" },
      { name: "issues", path: `${latest}/issues`, collection: "issues" },
      { name: "commitActivity", path: `${latest}/commit-activity` },
      { name: "authors", path: `${latest}/author-statistics` },
      { name: "branches", path: `${latest}/branch-statistics` },
      { name: "technicalDebt", path: `${latest}/technical-debt`, collection: "result" },
      {
        name: "refactoringTargets",
        path: `${latest}/technical-debt?refactoring_targets=true`,
        collection: "result",
      },
      { name: "skills", path: `${latest}/experience/languages`, optional: true },
      { name: "badges", path: `${projectPath}/badges` },
      { name: "repositories", path: `${projectPath}/repositories` },
      {
        name: "deltaAnalyses",
        path: `${projectPath}/delta-analyses`,
        collection: "delta_analyses",
      },
      {
        name: "coverageInsights",
        path: `code-coverage/${projectPath}/gate-results/insights`,
        optional: true,
      },
      {
        name: "coverageOutcomes",
        path: `code-coverage/${projectPath}/gate-results/outcomes`,
        collection: "outcomes",
        optional: true,
      },
    ];
    const entries = await Promise.all(
      requests.map(async (request) => [request.name, await this.getDataset(request)] as const),
    );
    return Object.fromEntries(entries) as Record<CodeSceneDatasetName, CodeSceneDataset>;
  }

  private async getDataset(request: DatasetRequest): Promise<CodeSceneDataset> {
    try {
      const data = isPagedDataset(request)
        ? await this.getAllDatasetPages(request)
        : parseJson(await this.get(request.path));
      return { status: "available", source: request.path, data };
    } catch (error) {
      if (request.optional) {
        if (error instanceof CodeSceneApiError && error.status === 404) {
          return {
            status: "unavailable",
            source: request.path,
            reason: "Endpoint not available",
          };
        }
      }
      throw error;
    }
  }

  private async getAllDatasetPages(request: PagedDatasetRequest): Promise<JsonValue[]> {
    const firstPage = await this.getDatasetPage({ dataset: request, page: 1 });
    const remainingPages = await Promise.all(
      pageNumbersAfter(1, firstPage.maxPages).map((page) =>
        this.getDatasetPage({ dataset: request, page }),
      ),
    );
    return [firstPage, ...remainingPages].flatMap((page) => page.items);
  }

  private async getDatasetPage(
    request: DatasetPageRequest,
  ): Promise<{ items: JsonValue[]; maxPages: number }> {
    const { dataset, page } = request;
    const { path, collection } = dataset;
    const separator = path.includes("?") ? "&" : "?";
    const response = requireRecord(
      await this.get(`${path}${separator}page=${page}&page_size=${FILE_PAGE_SIZE}`),
      { message: `Unexpected CodeScene ${collection} response` },
    );
    const context = { message: `Unexpected CodeScene ${collection} response` };
    if (requireNumber(response.page, context) !== page) throw new TypeError(context.message);
    return {
      items: requireArray(response[collection], context).map(parseJson),
      maxPages: requireNumber(response.max_pages, context),
    };
  }

  private async getAllFiles(path: string): Promise<CodeSceneFile[]> {
    const firstPage = await this.getFilePage(path, 1);
    const remainingPages = await Promise.all(
      pageNumbersAfter(firstPage.page, firstPage.maxPages).map((page) =>
        this.getFilePage(path, page),
      ),
    );
    return [firstPage, ...remainingPages].flatMap((page) => page.files);
  }

  private async getFilePage(path: string, page: number): Promise<FilePage> {
    const query = new URLSearchParams({ page: String(page), page_size: String(FILE_PAGE_SIZE) });
    return parseFilePage(await this.get(`${path}?${query}`), page);
  }

  private async get(path: string): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    const response = await this.request(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

function isPagedDataset(request: DatasetRequest): request is PagedDatasetRequest {
  return request.collection !== undefined;
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
  const context = { message: "Unexpected latest CodeScene analysis" };
  const analysis = requireRecord(value, context);
  return {
    id: requireNumber(analysis.id, context),
    name: requireString(analysis.name, context),
    analysedAt: requireString(analysis.readable_analysis_time, context),
    description: requireString(analysis.description, context),
    repositoryRevisions: requireArray(analysis.analysis_repo_revisions, context).map((value) => {
      const revision = requireRecord(value, context);
      return {
        repository: requireString(revision.repo, context),
        revision: requireString(revision.revision, context),
      };
    }),
    summary: parseNumberRecord(analysis.summary, context),
    languages: requireArray(analysis.file_summary, context).map((value) => {
      const language = requireRecord(value, context);
      return {
        language: requireString(language.language, context),
        files: requireNumber(language.number_of_files, context),
        blankLines: requireNumber(language.blank, context),
        commentLines: requireNumber(language.comment, context),
        codeLines: requireNumber(language.code, context),
      };
    }),
    highLevelMetrics: parseNumberRecord(analysis.high_level_metrics, context),
  };
}

function parseNumberRecord(value: unknown, context: ValidationContext): Record<string, number> {
  return Object.fromEntries(
    Object.entries(requireRecord(value, context)).map(([key, item]) => [
      key,
      requireNumber(item, context),
    ]),
  );
}

function parseFilePage(value: unknown, expectedPage: number): FilePage {
  const context = { message: "Unexpected CodeScene files response" };
  const response = requireRecord(value, context);
  const page = requireNumber(response.page, context);
  if (page !== expectedPage) throw new TypeError(context.message);
  return {
    files: requireArray(response.files, context).map((file, index) => parseFile(file, index)),
    page,
    maxPages: requireNumber(response.max_pages, context),
  };
}

function pageNumbersAfter(page: number, maxPages: number): number[] {
  return Array.from({ length: Math.max(0, maxPages - page) }, (_, index) => page + index + 1);
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
    raw: parseJson(file),
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

function parseJson(value: unknown): JsonValue {
  if (isJsonScalar(value)) return value;
  if (isNumber(value)) return value;
  if (Array.isArray(value)) return value.map(parseJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseJson(item)]));
  }
  throw new TypeError("Unexpected non-JSON value in CodeScene response");
}

function isJsonScalar(value: unknown): value is null | boolean | string {
  if (value === null) return true;
  switch (typeof value) {
    case "boolean":
    case "string":
      return true;
    default:
      return false;
  }
}
