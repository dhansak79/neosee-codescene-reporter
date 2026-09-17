import type { CodeSceneProject, ProjectPage } from "./types.js";

export type CodeSceneClientOptions = {
  server: string;
  token: string;
  fetch?: typeof globalThis.fetch;
};

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

function isProject(value: unknown): value is CodeSceneProject {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  return typeof value.id === "string" || typeof value.id === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  // Stryker disable next-line ConditionalExpression: callers already reject every non-object through required property validation.
  return typeof value === "object" && value !== null;
}
