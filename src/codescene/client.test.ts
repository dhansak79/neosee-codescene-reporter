import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { CodeSceneApiError, CodeSceneClient } from "./client.js";

describe("CodeSceneClient", () => {
  it("lists projects and authenticates without exposing the token", async () => {
    const request = mock.fn<typeof fetch>(async () =>
      Response.json({ projects: [{ id: 42, name: "Example" }] }),
    );
    const client = new CodeSceneClient({
      server: "https://codescene.example.com",
      token: "secret-token",
      fetch: request,
    });

    const result = await client.listProjects();

    assert.deepEqual(result.projects, [{ id: 42, name: "Example" }]);
    assert.equal(request.mock.callCount(), 1);
    assert.deepEqual(
      request.mock.calls[0]?.arguments[0],
      new URL("https://codescene.example.com/api/v2/projects"),
    );
    assert.deepEqual(request.mock.calls[0]?.arguments[1]?.headers, {
      Accept: "application/json",
      Authorization: "Bearer secret-token",
    });
  });

  it("accepts Enterprise and hosted API v2 server URLs", async () => {
    await assertServerResolutions([
      ["https://codescene.example.com/api/v2", "https://codescene.example.com/api/v2/projects"],
      ["https://api.codescene.io/v2", "https://api.codescene.io/v2/projects"],
    ]);
  });

  it("rejects server URLs that do not use HTTPS", () => {
    for (const server of ["http://codescene.example.com", "ftp://codescene.example.com"]) {
      assert.throws(
        () => new CodeSceneClient({ server, token: "token" }),
        /CodeScene server URL must use HTTPS/,
      );
    }
  });

  it("reports API failures without including the token", async () => {
    const request = mock.fn<typeof fetch>(
      async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    );
    const client = new CodeSceneClient({
      server: "https://codescene.example.com",
      token: "secret-token",
      fetch: request,
    });

    await assert.rejects(client.listProjects(), (error: unknown) => {
      assert.ok(error instanceof CodeSceneApiError);
      assert.equal(error.name, "CodeSceneApiError");
      assert.match(String(error), /401 Unauthorized/);
      assert.doesNotMatch(String(error), /secret-token/);
      return true;
    });
  });

  it("reports API failures without a response body", async () => {
    const request = mock.fn<typeof fetch>(
      async () => new Response("", { status: 500, statusText: "Failure" }),
    );
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: request,
    });
    await assert.rejects(client.listProjects(), /500 Failure\)$/);
  });

  it("trims and includes API error details", async () => {
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async () =>
        new Response("  explanation  ", { status: 400, statusText: "Bad Request" }),
    });
    await assert.rejects(
      client.listProjects(),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CodeScene request failed (400 Bad Request): explanation",
    );
  });

  it("rejects non-JSON responses with known and unknown content types", async () => {
    const htmlClient = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async () => new Response("ok", { headers: { "content-type": "text/html" } }),
    });
    const unknownClient = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async () => new Response(null),
    });

    await assert.rejects(htmlClient.listProjects(), /text\/html/);
    await assert.rejects(unknownClient.listProjects(), /unknown content type/);
  });

  it("parses array and items response shapes", async () => {
    const responses = [
      Response.json([{ id: "one", name: "One" }]),
      Response.json({ items: [{ id: 2, name: "Two" }] }),
    ];
    const client = new CodeSceneClient({
      server: "https://example.com/root/",
      token: "token",
      fetch: async () => responses.shift()!,
    });

    assert.deepEqual((await client.listProjects()).projects, [{ id: "one", name: "One" }]);
    assert.deepEqual((await client.listProjects()).projects, [{ id: 2, name: "Two" }]);
  });

  it("does not mistake similarly prefixed paths for API roots", async () => {
    await assertServerResolutions([
      ["https://example.com/api/v2-extra", "https://example.com/api/v2-extra/api/v2/projects"],
      ["https://example.com/v2-extra", "https://example.com/v2-extra/api/v2/projects"],
    ]);
  });

  it("rejects malformed project response shapes", async () => {
    for (const body of [
      {},
      { projects: [null] },
      { projects: [{ id: 1 }] },
      { projects: [{ id: true, name: "Invalid" }] },
    ]) {
      const client = new CodeSceneClient({
        server: "https://example.com/api/v2",
        token: "token",
        fetch: async () => Response.json(body),
      });
      await assert.rejects(client.listProjects(), /Unexpected/);
    }
  });

  it("retrieves and validates a project analysis snapshot", async () => {
    const request = mock.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      const path = url.pathname;
      if (path.endsWith("/analyses/latest")) return Response.json(validAnalysis());
      if (path.endsWith("/files")) return Response.json(validFiles());
      if (!path.endsWith("project%2F42")) return catalogueResponse(url);
      return Response.json(validProject());
    });
    const client = new CodeSceneClient({
      server: "https://codescene.example.com",
      token: "token",
      fetch: request,
    });

    const result = await client.getProjectAnalysis("project/42");
    const { catalogue, ...coreResult } = result;

    assert.deepEqual(
      request.mock.calls.slice(0, 3).map((call) => requestUrl(call.arguments[0]).toString()),
      [
        "https://codescene.example.com/api/v2/projects/project%2F42",
        "https://codescene.example.com/api/v2/projects/project%2F42/analyses/latest",
        "https://codescene.example.com/api/v2/projects/project%2F42/analyses/latest/files?page=1&page_size=500",
      ],
    );
    assert.deepEqual(coreResult, expectedCoreResult());
    assert.deepEqual(catalogue, expectedEmptyCatalogue("project%2F42"));
  });

  it("retrieves every file page in page order", async () => {
    const request = mock.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
      if (url.pathname.endsWith("/files")) {
        const page = Number(url.searchParams.get("page"));
        return Response.json({
          ...validFiles(),
          page,
          max_pages: 3,
          files: [
            {
              ...validFiles().files[0],
              name: `page-${page}.ts`,
              path: `src/page-${page}.ts`,
            },
          ],
        });
      }
      if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
      return catalogueResponse(url);
    });
    const client = new CodeSceneClient({
      server: "https://codescene.example.com",
      token: "token",
      fetch: request,
    });

    const result = await client.getProjectAnalysis(42);

    assert.deepEqual(
      result.files.map((file) => file.name),
      ["page-1.ts", "page-2.ts", "page-3.ts"],
    );
    assert.deepEqual(
      request.mock.calls
        .map((call) => requestUrl(call.arguments[0]))
        .filter((url) => url.pathname.endsWith("/files"))
        .map((url) => url.search),
      ["?page=1&page_size=500", "?page=2&page_size=500", "?page=3&page_size=500"],
    );
  });

  it("retrieves paged catalogue data and marks unsupported optional datasets unavailable", async () => {
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
        if (url.pathname.endsWith("/files")) return Response.json(validFiles());
        if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
        if (
          url.pathname.endsWith("/experience/languages") ||
          url.pathname.includes("/gate-results/")
        ) {
          return new Response("Missing", { status: 404, statusText: "Not Found" });
        }
        if (url.pathname.endsWith("/commits")) {
          const page = Number(url.searchParams.get("page"));
          return Response.json({
            page,
            max_pages: 2,
            commits: [
              {
                page,
                text: "commit",
                active: true,
                empty: null,
                values: [1, "two"],
                nested: { count: 3 },
              },
            ],
          });
        }
        return catalogueResponse(url);
      },
    });

    const catalogue = (await client.getProjectAnalysis(42)).catalogue;
    assert.deepEqual(catalogue.commits, {
      status: "available",
      source: "projects/42/analyses/latest/commits",
      data: [
        {
          page: 1,
          text: "commit",
          active: true,
          empty: null,
          values: [1, "two"],
          nested: { count: 3 },
        },
        {
          page: 2,
          text: "commit",
          active: true,
          empty: null,
          values: [1, "two"],
          nested: { count: 3 },
        },
      ],
    });
    assert.deepEqual(catalogue.skills, {
      status: "unavailable",
      source: "projects/42/analyses/latest/experience/languages",
      reason: "Endpoint not available",
    });
    assert.equal(catalogue.coverageInsights.status, "unavailable");
    assert.equal(catalogue.coverageOutcomes.status, "unavailable");
  });

  it("rejects non-JSON values returned by a nominal JSON endpoint", async () => {
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
        if (url.pathname.endsWith("/files")) return Response.json(validFiles());
        if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
        if (url.pathname.endsWith("/badges")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => undefined,
          } as unknown as Response;
        }
        return catalogueResponse(url);
      },
    });

    await assert.rejects(client.getProjectAnalysis(42), /Unexpected non-JSON value/);
  });

  it("rejects a catalogue page that does not match the requested page", async () => {
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
        if (url.pathname.endsWith("/files")) return Response.json(validFiles());
        if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
        if (url.pathname.endsWith("/analyses")) {
          return Response.json({ page: 2, max_pages: 2, analyses: [] });
        }
        return catalogueResponse(url);
      },
    });

    await assert.rejects(client.getProjectAnalysis(42), /Unexpected CodeScene analyses response/);
  });

  it("does not hide server failures for optional or required datasets", async () => {
    for (const failedPath of ["/gate-results/insights", "/badges"]) {
      await assert.rejects(failingCatalogueClient(failedPath, 500).getProjectAnalysis(42), /500/);
    }
    await assert.rejects(failingCatalogueClient("/badges", 404).getProjectAnalysis(42), /404/);
  });

  it("reports a malformed catalogue response with its dataset name", async () => {
    const client = new CodeSceneClient({
      server: "https://example.com",
      token: "token",
      fetch: async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
        if (url.pathname.endsWith("/files")) return Response.json(validFiles());
        if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
        if (url.pathname.endsWith("/analyses")) return Response.json(null);
        return catalogueResponse(url);
      },
    });

    await assert.rejects(client.getProjectAnalysis(42), /Unexpected CodeScene analyses response/);
  });

  it("treats missing or malformed coverage as unavailable", async () => {
    for (const coverage of [undefined, { line_coverage_percent: "unknown" }]) {
      const source = validProject();
      const project = {
        ...source,
        analysis: { ...source.analysis, code_coverage: coverage },
      };
      const client = snapshotClient(project, validAnalysis(), validFiles());
      assert.equal(
        (await client.getProjectAnalysis(42)).project.analysis.lineCoveragePercent,
        null,
      );
    }
  });

  it("rejects malformed project details and metrics", async () => {
    const cases: [unknown, RegExp][] = [
      [null, /project details/],
      [{ id: 42, analysis: {} }, /project details/],
      [{ id: 42, name: "Example" }, /project details/],
      [{ ...validProject(), analysis: { ...validProject().analysis, authors: null } }, /author/],
      [
        {
          ...validProject(),
          analysis: { ...validProject().analysis, authors: { total: Number.NaN, active: 2 } },
        },
        /author/,
      ],
      [
        {
          ...validProject(),
          analysis: { ...validProject().analysis, code_health: { now: "10" } },
        },
        /code health metrics/,
      ],
      [
        {
          ...validProject(),
          analysis: {
            ...validProject().analysis,
            code_health: { now: 10, month: "unknown", year: null },
          },
        },
        /code health metrics/,
      ],
      [
        {
          ...validProject(),
          analysis: { ...validProject().analysis, hotspot_code_health: { now: null } },
        },
        /hotspot code health metrics/,
      ],
    ];
    for (const [project, message] of cases) {
      await assert.rejects(
        snapshotClient(project, validAnalysis(), validFiles()).getProjectAnalysis(42),
        message,
      );
    }
  });

  it("rejects malformed latest-analysis details", async () => {
    for (const analysis of [
      null,
      {},
      { id: "123", name: "Example", readable_analysis_time: "today" },
      { id: 123, name: null, readable_analysis_time: "today" },
    ]) {
      await assert.rejects(
        snapshotClient(validProject(), analysis, validFiles()).getProjectAnalysis(42),
        /Unexpected latest/,
      );
    }
  });

  it("rejects missing and malformed files", async () => {
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {}).getProjectAnalysis(42),
      /files response/,
    );
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {
        ...validFiles(),
        page: 2,
      }).getProjectAnalysis(42),
      /files response/,
    );
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {
        ...validFiles(),
        files: null,
      }).getProjectAnalysis(42),
      /files response/,
    );
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {
        ...validFiles(),
        files: [null],
      }).getProjectAnalysis(42),
      /file at index 0/,
    );
    const file = validFiles().files[0]!;
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {
        ...validFiles(),
        files: [{ ...file, code_health: { current_score: "unknown" } }],
      }).getProjectAnalysis(42),
      /file Code Health at index 0/,
    );
    await assert.rejects(
      snapshotClient(validProject(), validAnalysis(), {
        ...validFiles(),
        files: [{ ...file, hotspot: "yes" }],
      }).getProjectAnalysis(42),
      /file at index 0/,
    );
  });
});

async function assertServerResolutions(cases: [string, string][]): Promise<void> {
  for (const [server, expected] of cases) {
    const request = mock.fn<typeof fetch>(async () => Response.json([]));
    const client = new CodeSceneClient({ server, token: "token", fetch: request });
    await client.listProjects();
    assert.deepEqual(request.mock.calls[0]?.arguments[0], new URL(expected));
  }
}

function snapshotClient(project: unknown, analysis: unknown, files: unknown): CodeSceneClient {
  return new CodeSceneClient({
    server: "https://example.com",
    token: "token",
    fetch: async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/analyses/latest")) return Response.json(analysis);
      if (url.pathname.endsWith("/files")) return Response.json(files);
      if (!url.pathname.endsWith("/projects/42")) return catalogueResponse(url);
      return Response.json(project);
    },
  });
}

function catalogueResponse(url: URL): Response {
  const collection = [
    ["/analyses", "analyses"],
    ["/components", "components"],
    ["/commits", "commits"],
    ["/issues", "issues"],
    ["/technical-debt", "result"],
    ["/delta-analyses", "delta_analyses"],
    ["/gate-results/outcomes", "outcomes"],
  ].find(([suffix]) => url.pathname.endsWith(suffix!))?.[1];
  if (collection) {
    return Response.json({
      page: Number(url.searchParams.get("page")),
      max_pages: 1,
      [collection]: [],
    });
  }
  return Response.json([]);
}

function expectedEmptyCatalogue(project: string) {
  const available = (source: string) => ({ status: "available", source, data: [] });
  const latest = `projects/${project}/analyses/latest`;
  return {
    analysisHistory: available(`projects/${project}/analyses`),
    components: available(`${latest}/components`),
    commits: available(`${latest}/commits`),
    issues: available(`${latest}/issues`),
    commitActivity: available(`${latest}/commit-activity`),
    authors: available(`${latest}/author-statistics`),
    branches: available(`${latest}/branch-statistics`),
    technicalDebt: available(`${latest}/technical-debt`),
    refactoringTargets: available(`${latest}/technical-debt?refactoring_targets=true`),
    skills: available(`${latest}/experience/languages`),
    badges: available(`projects/${project}/badges`),
    repositories: available(`projects/${project}/repositories`),
    deltaAnalyses: available(`projects/${project}/delta-analyses`),
    coverageInsights: available(`code-coverage/projects/${project}/gate-results/insights`),
    coverageOutcomes: available(`code-coverage/projects/${project}/gate-results/outcomes`),
  };
}

function expectedCoreResult() {
  return {
    project: {
      id: 42,
      name: "Example",
      analysis: {
        codeHealth: { now: 10, month: null, year: 9.5 },
        hotspotCodeHealth: { now: 9, month: 8.5, year: null },
        authors: { total: 3, active: 2 },
        lineCoveragePercent: 100,
      },
    },
    latestAnalysis: {
      id: 123,
      name: "Example",
      analysedAt: "2026-09-17T14:15:55Z",
      description: "Example analysis",
      repositoryRevisions: [{ repository: "example", revision: "abc123" }],
      summary: { files: 2 },
      languages: [
        { language: "TypeScript", files: 1, blankLines: 2, commentLines: 3, codeLines: 20 },
      ],
      highLevelMetrics: { lines_of_code: 25 },
    },
    files: [
      expectedFile({
        name: "healthy.ts",
        path: "src/healthy.ts",
        linesOfCode: 20,
        changeFrequency: 2,
        codeHealth: 10,
        hotspot: true,
        rawIndex: 0,
      }),
      expectedFile({
        name: "config.json",
        path: "config.json",
        linesOfCode: 5,
        changeFrequency: 1,
        codeHealth: null,
        hotspot: false,
        rawIndex: 1,
      }),
    ],
  };
}

function expectedFile(file: {
  name: string;
  path: string;
  linesOfCode: number;
  changeFrequency: number;
  codeHealth: number | null;
  hotspot: boolean;
  rawIndex: number;
}) {
  const { rawIndex, ...expected } = file;
  return {
    ...expected,
    raw: validFiles().files[rawIndex],
  };
}

function failingCatalogueClient(failedPath: string, status: number): CodeSceneClient {
  return new CodeSceneClient({
    server: "https://example.com",
    token: "token",
    fetch: async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/analyses/latest")) return Response.json(validAnalysis());
      if (url.pathname.endsWith("/files")) return Response.json(validFiles());
      if (url.pathname.endsWith("/projects/42")) return Response.json(validProject());
      if (url.pathname.endsWith(failedPath)) {
        return new Response("Failure", { status, statusText: "Failure" });
      }
      return catalogueResponse(url);
    },
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

function validProject() {
  return {
    id: 42,
    name: "Example",
    analysis: {
      code_health: { now: 10, month: null, year: 9.5 },
      hotspot_code_health: { now: 9, month: 8.5, year: null },
      authors: { total: 3, active: 2 },
      code_coverage: { line_coverage_percent: 100 },
    },
  };
}

function validAnalysis() {
  return {
    id: 123,
    name: "Example",
    readable_analysis_time: "2026-09-17T14:15:55Z",
    description: "Example analysis",
    analysis_repo_revisions: [{ repo: "example", revision: "abc123" }],
    summary: { files: 2 },
    file_summary: [{ language: "TypeScript", number_of_files: 1, blank: 2, comment: 3, code: 20 }],
    high_level_metrics: { lines_of_code: 25 },
  };
}

function validFiles() {
  return {
    page: 1,
    max_pages: 1,
    files: [
      {
        name: "healthy.ts",
        path: "src/healthy.ts",
        lines_of_code: 20,
        change_frequency: 2,
        code_health: { current_score: 10 },
        hotspot: true,
      },
      {
        name: "config.json",
        path: "config.json",
        lines_of_code: 5,
        change_frequency: 1,
        code_health: { current_score: "-" },
        hotspot: false,
      },
    ],
  };
}
