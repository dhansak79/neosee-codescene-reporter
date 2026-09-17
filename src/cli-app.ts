import { readFile, writeFile } from "node:fs/promises";
import { buildAssessment } from "./analysis/report-model.js";
import { CodeSceneClient } from "./codescene/client.js";
import type { ProjectAnalysisSnapshot, ProjectPage } from "./codescene/types.js";
import { renderHtml } from "./report/render-html.js";

type Options = { server: string; output?: string; project?: string };
type Environment = Record<string, string | undefined>;
type Dependencies = {
  listProjects: (server: string, token: string) => Promise<ProjectPage>;
  getProjectAnalysis: (
    server: string,
    token: string,
    project: string,
  ) => Promise<ProjectAnalysisSnapshot>;
  writeSnapshot: typeof writeFile;
  readAsset: (path: string) => Promise<Buffer>;
  now: () => Date;
  log: (...values: unknown[]) => void;
};

const defaultDependencies: Dependencies = {
  listProjects: async (server, token) => new CodeSceneClient({ server, token }).listProjects(),
  getProjectAnalysis: async (server, token, project) =>
    new CodeSceneClient({ server, token }).getProjectAnalysis(project),
  writeSnapshot: writeFile,
  readAsset: async (path) => readFile(path),
  now: () => new Date(),
  log: console.log,
};

export async function runCli(
  args: string[],
  environment: Environment,
  dependencies: Dependencies = defaultDependencies,
): Promise<void> {
  const options = parseArgs(args, environment);
  const token = readToken(environment);

  if (options.project) {
    if (!options.output) throw new Error("--project requires --output");
    const snapshot = await dependencies.getProjectAnalysis(options.server, token, options.project);
    const report = buildAssessment(snapshot);
    const content = options.output.endsWith(".json")
      ? `${JSON.stringify(report, null, 2)}\n`
      : await renderBrandedHtml(report, dependencies);
    await dependencies.writeSnapshot(options.output, content, { flag: "wx" });
    dependencies.log(`Report written to ${options.output}`);
    return;
  }

  const page = await dependencies.listProjects(options.server, token);

  if (options.output) {
    const snapshot = {
      capturedAt: dependencies.now().toISOString(),
      source: options.server,
      data: page.raw,
    };
    await dependencies.writeSnapshot(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, {
      flag: "wx",
    });
    dependencies.log(`Snapshot written to ${options.output}`);
  }

  if (page.projects.length === 0) {
    dependencies.log("No accessible CodeScene projects found.");
    return;
  }

  dependencies.log(page.projects);
}

async function renderBrandedHtml(
  report: ReturnType<typeof buildAssessment>,
  dependencies: Dependencies,
): Promise<string> {
  const [neoseeLogo, partnerBadge] = await Promise.all([
    dependencies.readAsset(".resources/neosee.png"),
    dependencies.readAsset(".resources/Official Partner Badge - Light Backround.png"),
  ]);
  return renderHtml(report, {
    neoseeLogoUrl: pngDataUrl(neoseeLogo),
    partnerBadgeUrl: pngDataUrl(partnerBadge),
  });
}

function pngDataUrl(data: Buffer): string {
  return `data:image/png;base64,${data.toString("base64")}`;
}

export function parseArgs(args: string[], environment: Environment): Options {
  let server = nonEmptyValue(environment.CODESCENE_SERVER) ?? "https://api.codescene.io/v2";
  let output: string | undefined;
  let project: string | undefined;
  const handlers: Record<string, (value: string) => void> = {
    "--server": (value) => {
      server = value;
    },
    "--output": (value) => {
      output = value;
    },
    "--project": (value) => {
      project = value;
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) throw new Error("Unexpected empty argument");
    const handler = handlers[arg];
    if (!handler) throw new Error(`Unknown argument: ${arg}`);
    handler(requireValue(args, ++index, arg));
  }

  return { server, ...(output ? { output } : {}), ...(project ? { project } : {}) };
}

export function readToken(environment: Environment): string {
  const token = [
    environment.CS_ACCESS_TOKEN,
    environment.cs_access_token,
    environment.CODESCENE_TOKEN,
  ]
    .map(nonEmptyValue)
    .find((value) => value !== undefined);
  if (!token) throw new Error("Missing access token. Set CS_ACCESS_TOKEN in the environment.");
  return token;
}

function nonEmptyValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === "") return undefined;
  return trimmed;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}
