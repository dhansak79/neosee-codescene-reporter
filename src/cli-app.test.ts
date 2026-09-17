import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, type writeFile } from "node:fs/promises";
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
        writeSnapshot: mock.fn(async () => undefined),
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
        writeSnapshot: mock.fn(async () => undefined),
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
        writeSnapshot: writeSnapshot as typeof writeFile,
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
});
