import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { buildAssessment } from "../analysis/report-model.js";
import { CodeSceneClient } from "../codescene/client.js";
import { renderHtml } from "./render-html.js";

describe("HTML report with a mocked CodeScene API", () => {
  it("fetches the current API catalogue and renders a sanitized report end to end", async () => {
    const request = mock.fn<typeof fetch>(mockCodeSceneApi);
    const client = new CodeSceneClient({
      server: "https://codescene.example.com/api/v2",
      token: "test-token",
      fetch: request,
    });

    const snapshot = await client.getProjectAnalysis(78042);
    const report = buildAssessment(snapshot);
    const html = renderHtml(report, {
      neoseeLogoUrl: "data:image/png;base64,neosee",
      partnerBadgeUrl: "data:image/png;base64,partner",
    });

    assert.equal(snapshot.files.length, 2);
    assert.deepEqual(snapshot.files[0]?.raw, fileResponse("src/first.ts", "Team One"));
    assert.equal(snapshot.catalogue.commits.status, "available");
    assert.equal(
      snapshot.catalogue.commits.status === "available"
        ? (snapshot.catalogue.commits.data as unknown[]).length
        : 0,
      2,
    );
    assert.match(html, /Example Consulting System/);
    assert.match(html, /2 of 2 project files/);
    assert.match(html, /Commits · 2 records/);
    assert.match(html, /Technical Debt · 1 records/);
    assert.match(html, /Refactoring Targets · 1 records/);
    assert.match(html, /Skills<\/h3><p>Unavailable: Endpoint not available/);
    assert.doesNotMatch(html, /All analysed files|Team One/);

    const urls = request.mock.calls.map((call) => requestUrl(call.arguments[0]));
    assert.equal(urls.length, 20);
    assert.ok(urls.some((url) => url.pathname.endsWith("/analyses/latest/commit-activity")));
    assert.ok(urls.some((url) => url.pathname.endsWith("/author-statistics")));
    assert.ok(urls.some((url) => url.pathname.endsWith("/branch-statistics")));
    assert.ok(urls.some((url) => url.pathname.endsWith("/badges")));
    assert.ok(urls.some((url) => url.pathname.endsWith("/repositories")));
    assert.ok(urls.some((url) => url.pathname.endsWith("/delta-analyses")));
    assert.ok(urls.some((url) => url.pathname.includes("/gate-results/insights")));
    assert.ok(
      request.mock.calls.every(
        (call) =>
          (call.arguments[1]?.headers as Record<string, string>).Authorization ===
          "Bearer test-token",
      ),
    );
  });
});

async function mockCodeSceneApi(input: string | URL | Request): Promise<Response> {
  const url = requestUrl(input);
  return MOCK_ROUTES.find((route) => route.matches(url))?.respond(url) ?? unexpectedRoute();
}

const MOCK_ROUTES: { matches: (url: URL) => boolean; respond: (url: URL) => Response }[] = [
  route("/projects/78042", () => Response.json(projectResponse())),
  route("/analyses/latest", () => Response.json(analysisResponse())),
  route("/analyses/latest/files", filesPage),
  route("/analyses", (url) => page(url, "analyses", [{ id: 123 }])),
  route("/components", (url) => page(url, "components", [])),
  route("/commits", (url) =>
    page(url, "commits", [{ rev: `revision-${url.searchParams.get("page")}` }], 2),
  ),
  route("/issues", (url) => page(url, "issues", [{ id: "ISSUE-1" }])),
  route("/commit-activity", () =>
    Response.json({ commit_activity_trend: [{ date: "2026-01", revisions_at_date: 2 }] }),
  ),
  route("/author-statistics", () => Response.json([{ author: "Developer One" }])),
  route("/branch-statistics", () => Response.json([])),
  route("/technical-debt", technicalDebtPage),
  route("/experience/languages", unavailableEndpoint),
  containingRoute("/gate-results/", unavailableEndpoint),
  route("/badges", () => Response.json({ average_code_health: true })),
  route("/repositories", () => Response.json([{ branch: "main" }])),
  route("/delta-analyses", (url) => page(url, "delta_analyses", [])),
];

function route(suffix: string, respond: (url: URL) => Response) {
  return { matches: (url: URL) => url.pathname.endsWith(suffix), respond };
}

function containingRoute(fragment: string, respond: (url: URL) => Response) {
  return { matches: (url: URL) => url.pathname.includes(fragment), respond };
}

function technicalDebtPage(url: URL): Response {
  return page(url, "result", [
    {
      file_name: "src/first.ts",
      refactoring_target: url.searchParams.has("refactoring_targets"),
    },
  ]);
}

function unavailableEndpoint(): Response {
  return new Response("Missing", { status: 404, statusText: "Not Found" });
}

function unexpectedRoute(): Response {
  return new Response("Unexpected mock route", { status: 500, statusText: "Unexpected" });
}

function projectResponse() {
  return {
    id: 78042,
    name: "Example Consulting System",
    analysis: {
      code_health: { now: 8.7, month: 8.5, year: 8.1 },
      hotspot_code_health: { now: 7.5, month: 7.2, year: 7 },
      authors: { total: 3, active: 2 },
      code_coverage: { line_coverage_percent: 82.5 },
    },
  };
}

function analysisResponse() {
  return {
    id: 123,
    name: "Example Consulting System",
    readable_analysis_time: "2026-09-17T12:00:00Z",
    description: "Sanitized API contract fixture",
    analysis_repo_revisions: [{ repo: "example", revision: "abc123" }],
    summary: { files: 2, files_with_code_health: 2 },
    file_summary: [{ language: "TypeScript", number_of_files: 2, blank: 4, comment: 6, code: 40 }],
    high_level_metrics: { lines_of_code: 50, current_score: 8.7 },
  };
}

function filesPage(url: URL): Response {
  const pageNumber = Number(url.searchParams.get("page"));
  const file =
    pageNumber === 1
      ? fileResponse("src/first.ts", "Team One")
      : fileResponse("src/second.ts", "Team Two");
  return Response.json({ page: pageNumber, max_pages: 2, files: [file] });
}

function fileResponse(path: string, owner: string) {
  return {
    name: path.split("/").at(-1),
    path,
    lines_of_code: 25,
    change_frequency: 3,
    code_health: { current_score: 8.7, month_score: 8.5, year_score: 8.1 },
    hotspot: path.endsWith("first.ts"),
    language: "TypeScript",
    owner,
    ownership_percentage: 75,
    number_of_defects: 1,
    cost: 100,
    goals: [],
    recommendations: [],
    knowledge_loss_percentage: 10,
  };
}

function page(url: URL, collection: string, items: unknown[], maxPages = 1): Response {
  return Response.json({
    page: Number(url.searchParams.get("page")),
    max_pages: maxPages,
    [collection]: items,
  });
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}
