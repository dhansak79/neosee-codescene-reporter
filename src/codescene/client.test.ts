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
});

async function assertServerResolutions(cases: [string, string][]): Promise<void> {
  for (const [server, expected] of cases) {
    const request = mock.fn<typeof fetch>(async () => Response.json([]));
    const client = new CodeSceneClient({ server, token: "token", fetch: request });
    await client.listProjects();
    assert.deepEqual(request.mock.calls[0]?.arguments[0], new URL(expected));
  }
}
