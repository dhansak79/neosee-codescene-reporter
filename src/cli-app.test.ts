import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, type mkdir, type writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, mock } from "node:test";
import { parseArgs, readToken, runCli } from "./cli-app.js";

describe("CLI", () => {
  it("uses hosted defaults and the preferred token", () => {
    assert.deepEqual(parseArgs([], {}), { server: "https://api.codescene.io/v2" });
    assert.deepEqual(parseArgs([], { CODESCENE_SERVER: "  " }), {
      server: "https://api.codescene.io/v2",
    });
    assert.equal(readToken({ CS_ACCESS_TOKEN: " preferred " }), "preferred");
  });

  it("supports options and token aliases", () => {
    assert.deepEqual(
      parseArgs(["--server", "https://example.com", "--output", "result.json"], {}),
      { server: "https://example.com", output: "result.json" },
    );
    assert.equal(readToken({ cs_access_token: "lowercase" }), "lowercase");
    assert.equal(readToken({ CODESCENE_TOKEN: "fallback" }), "fallback");
    assert.equal(
      readToken({ CS_ACCESS_TOKEN: " ", cs_access_token: "", CODESCENE_TOKEN: " fallback " }),
      "fallback",
    );
  });

  it("uses the configured server", () => {
    assert.deepEqual(parseArgs([], { CODESCENE_SERVER: " https://on-prem.example " }), {
      server: "https://on-prem.example",
    });
  });

  it("rejects invalid arguments, missing values, and missing tokens", () => {
    assert.throws(() => parseArgs(["--unknown"], {}), /Unknown argument/);
    assert.throws(() => parseArgs([""], {}), /Unexpected empty argument/);
    assert.throws(() => parseArgs(["--server"], {}), /requires a value/);
    assert.throws(() => parseArgs(["--output", "--server"], {}), /requires a value/);
    assert.throws(() => readToken({}), /Missing access token/);
  });

  it("lists projects", async () => {
    const log = mock.fn();
    const listProjects = mock.fn(async () => ({
      projects: [{ id: 1, name: "Example" }],
      raw: { projects: [{ id: 1, name: "Example" }] },
    }));

    await runCli(
      [],
      { CS_ACCESS_TOKEN: "token" },
      {
        listProjects,
        getProjectAnalysis: async () => mockSnapshot(),
        writeSnapshot: mock.fn(async () => undefined),
        makeDirectory: mock.fn(async () => undefined),
        readAsset: async () => Buffer.from("logo"),
        now: () => new Date("2026-01-02T03:04:05.000Z"),
        log,
      },
    );

    assert.deepEqual(listProjects.mock.calls[0]?.arguments, [
      "https://api.codescene.io/v2",
      "token",
    ]);
    assert.deepEqual(log.mock.calls[0]?.arguments, [[{ id: 1, name: "Example" }]]);
    assert.equal(log.mock.callCount(), 1);
  });

  it("reports an empty project list", async () => {
    const log = mock.fn();
    await runCli(
      ["--output", "empty.json"],
      { CS_ACCESS_TOKEN: "token" },
      {
        listProjects: async () => ({ projects: [], raw: [] }),
        getProjectAnalysis: async () => mockSnapshot(),
        writeSnapshot: mock.fn(async () => undefined),
        makeDirectory: mock.fn(async () => undefined),
        readAsset: async () => Buffer.from("logo"),
        now: () => new Date("2026-01-02T03:04:05.000Z"),
        log,
      },
    );

    assert.deepEqual(log.mock.calls[0]?.arguments, ["Snapshot written to empty.json"]);
    assert.deepEqual(log.mock.calls[1]?.arguments, ["No accessible CodeScene projects found."]);
  });

  it("writes a non-overwriting snapshot", async () => {
    const writeSnapshot = mock.fn(async (..._args: unknown[]) => undefined);
    const log = mock.fn();
    await runCli(
      ["--output", "snapshot.json"],
      { CS_ACCESS_TOKEN: "token" },
      {
        listProjects: async () => ({
          projects: [{ id: 1, name: "Example" }],
          raw: { projects: [] },
        }),
        getProjectAnalysis: async () => mockSnapshot(),
        writeSnapshot: writeSnapshot as typeof writeFile,
        makeDirectory: mock.fn(async () => undefined),
        readAsset: async () => Buffer.from("logo"),
        now: () => new Date("2026-01-02T03:04:05.000Z"),
        log,
      },
    );

    assert.equal(writeSnapshot.mock.calls[0]?.arguments[0], "snapshot.json");
    assert.deepEqual(JSON.parse(String(writeSnapshot.mock.calls[0]?.arguments[1])), {
      capturedAt: "2026-01-02T03:04:05.000Z",
      source: "https://api.codescene.io/v2",
      data: { projects: [] },
    });
    assert.deepEqual(writeSnapshot.mock.calls[0]?.arguments[2], { flag: "wx" });
    assert.deepEqual(log.mock.calls[0]?.arguments, ["Snapshot written to snapshot.json"]);
    assert.deepEqual(log.mock.calls[1]?.arguments, [[{ id: 1, name: "Example" }]]);
  });

  it("runs with its default dependencies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "neosee-cli-test-"));
    const output = join(directory, "snapshot.json");
    mock.method(globalThis, "fetch", async () => Response.json({ projects: [] }));
    mock.method(console, "log", () => undefined);

    try {
      await runCli(["--output", output], { CS_ACCESS_TOKEN: "token" });
      assert.match(await readFile(output, "utf8"), /api\.codescene\.io/);
    } finally {
      mock.restoreAll();
      await rm(directory, { recursive: true });
    }
  });

  it("generates a report with its default dependencies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "neosee-report-test-"));
    const output = join(directory, "report.html");
    const responses = [
      {
        id: 84792,
        name: "Example",
        analysis: {
          code_health: { now: 10, month: null, year: null },
          hotspot_code_health: { now: 0, month: null, year: null },
          authors: { total: 2, active: 2 },
          code_coverage: { line_coverage_percent: 100 },
        },
      },
      {
        id: 123,
        name: "Example",
        readable_analysis_time: "2026-01-02T03:04:05Z",
        description: "Example analysis",
        analysis_repo_revisions: [],
        summary: { files: 1 },
        file_summary: [],
        high_level_metrics: { lines_of_code: 10 },
      },
      {
        page: 1,
        max_pages: 1,
        files: [
          {
            name: "index.ts",
            path: "src/index.ts",
            lines_of_code: 10,
            change_frequency: 1,
            code_health: { current_score: 10 },
            hotspot: false,
          },
        ],
      },
    ];
    mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const next = responses.shift();
      if (next) return Response.json(next);
      return cliCatalogueResponse(new URL(input instanceof Request ? input.url : input));
    });
    mock.method(console, "log", () => undefined);

    try {
      await runCli(["--project", "84792", "--output", output], {
        CS_ACCESS_TOKEN: "token",
      });
      assert.match(await readFile(output, "utf8"), /Engineering health assessment/);
    } finally {
      mock.restoreAll();
      await rm(directory, { recursive: true });
    }
  });

  it("writes HTML and JSON reports for a selected project", async () => {
    for (const output of ["report.html", "report.json"]) {
      const writeSnapshot = mock.fn(async (..._args: unknown[]) => undefined);
      const getProjectAnalysis = mock.fn(async () => mockSnapshot());
      const readAsset = mock.fn(async (path: string) => Buffer.from(path));
      const makeDirectory = mock.fn<typeof mkdir>(async () => undefined);
      const log = mock.fn();

      await runCli(
        ["--project", "84792", "--output", output],
        { CS_ACCESS_TOKEN: "token" },
        {
          listProjects: async () => ({ projects: [], raw: [] }),
          getProjectAnalysis,
          writeSnapshot: writeSnapshot as typeof writeFile,
          makeDirectory,
          readAsset,
          now: () => new Date(),
          log,
        },
      );

      assert.deepEqual(getProjectAnalysis.mock.calls[0]?.arguments, [
        "https://api.codescene.io/v2",
        "token",
        "84792",
      ]);
      const content = String(writeSnapshot.mock.calls[0]?.arguments[1]);
      assert.match(
        content,
        output.endsWith(".json") ? /"schemaVersion": "1.0"/ : /<!doctype html>/,
      );
      if (output.endsWith(".json")) {
        assert.equal(readAsset.mock.callCount(), 0);
      } else {
        assert.deepEqual(
          readAsset.mock.calls.map((call) => call.arguments[0]),
          [".resources/neosee.png", ".resources/Official Partner Badge - Light Backround.png"],
        );
        assert.match(content, new RegExp(Buffer.from(".resources/neosee.png").toString("base64")));
      }
      assert.deepEqual(writeSnapshot.mock.calls[0]?.arguments[2], { flag: "wx" });
      assert.equal(makeDirectory.mock.callCount(), 0);
      assert.deepEqual(log.mock.calls[0]?.arguments, [`Report written to ${output}`]);
    }
  });

  it("writes selected projects to reports by default", async () => {
    const writeSnapshot = mock.fn<typeof writeFile>(async () => undefined);
    const makeDirectory = mock.fn<typeof mkdir>(async () => undefined);
    const log = mock.fn();
    await runCli(
      ["--project", "project/84792"],
      { CS_ACCESS_TOKEN: "token" },
      {
        listProjects: async () => ({ projects: [], raw: [] }),
        getProjectAnalysis: async () => ({
          ...mockSnapshot(),
          project: { ...mockSnapshot().project, id: "project/84792" },
        }),
        writeSnapshot: writeSnapshot as typeof writeFile,
        makeDirectory,
        readAsset: async () => Buffer.from("logo"),
        now: () => new Date(),
        log,
      },
    );

    assert.deepEqual(makeDirectory.mock.calls[0]?.arguments, ["reports", { recursive: true }]);
    assert.equal(
      writeSnapshot.mock.calls[0]?.arguments[0],
      "reports/project-project-84792-analysis-123.html",
    );
    assert.deepEqual(log.mock.calls[0]?.arguments, [
      "Report written to reports/project-project-84792-analysis-123.html",
    ]);
  });
});

function mockSnapshot() {
  return {
    project: {
      id: 84792,
      name: "Example",
      analysis: {
        codeHealth: { now: 10, month: null, year: null },
        hotspotCodeHealth: { now: 0, month: null, year: null },
        authors: { total: 2, active: 2 },
        lineCoveragePercent: 100,
      },
    },
    latestAnalysis: {
      id: 123,
      name: "Example",
      analysedAt: "2026-01-02T03:04:05Z",
      description: "Example analysis",
      repositoryRevisions: [],
      summary: { files: 1 },
      languages: [],
      highLevelMetrics: { lines_of_code: 10 },
    },
    files: [
      {
        name: "index.ts",
        path: "src/index.ts",
        linesOfCode: 10,
        changeFrequency: 2,
        codeHealth: 10,
        hotspot: true,
        raw: { name: "index.ts", owner: "Team" },
      },
    ],
    catalogue: mockCatalogue(),
  };
}

function mockCatalogue() {
  const available = { status: "available" as const, source: "source", data: [] };
  return {
    analysisHistory: available,
    components: available,
    commits: available,
    issues: available,
    commitActivity: available,
    authors: available,
    branches: available,
    technicalDebt: available,
    refactoringTargets: available,
    skills: available,
    badges: available,
    repositories: available,
    deltaAnalyses: available,
    coverageInsights: available,
    coverageOutcomes: available,
  };
}

function cliCatalogueResponse(url: URL): Response {
  const collection = [
    ["/analyses", "analyses"],
    ["/components", "components"],
    ["/commits", "commits"],
    ["/issues", "issues"],
    ["/technical-debt", "result"],
    ["/delta-analyses", "delta_analyses"],
    ["/gate-results/outcomes", "outcomes"],
  ].find(([suffix]) => url.pathname.endsWith(suffix!))?.[1];
  return collection
    ? Response.json({ page: 1, max_pages: 1, [collection]: [] })
    : Response.json([]);
}
