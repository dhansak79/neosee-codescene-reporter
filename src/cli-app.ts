import { writeFile } from "node:fs/promises";
import { CodeSceneClient } from "./codescene/client.js";
import type { ProjectPage } from "./codescene/types.js";

type Options = { server: string; output?: string };
type Environment = Record<string, string | undefined>;
type Dependencies = {
  listProjects: (server: string, token: string) => Promise<ProjectPage>;
  writeSnapshot: typeof writeFile;
  now: () => Date;
  log: (...values: unknown[]) => void;
};

const defaultDependencies: Dependencies = {
  listProjects: async (server, token) => new CodeSceneClient({ server, token }).listProjects(),
  writeSnapshot: writeFile,
  now: () => new Date(),
  log: console.log,
};

export async function runCli(
  args: string[],
  environment: Environment,
  dependencies: Dependencies = defaultDependencies,
): Promise<void> {
  const options = parseArgs(args, environment);
  const page = await dependencies.listProjects(options.server, readToken(environment));

  if (options.output) {
    const snapshot = {
      capturedAt: dependencies.now().toISOString(),
      source: options.server,
      data: page.raw,
    };
    await dependencies.writeSnapshot(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, {
      flag: "wx",
    });
  }

  if (page.projects.length === 0) {
    dependencies.log("No accessible CodeScene projects found.");
    return;
  }

  dependencies.log(page.projects);
  if (options.output) dependencies.log(`Snapshot written to ${options.output}`);
}

export function parseArgs(args: string[], environment: Environment): Options {
  let server = environment.CODESCENE_SERVER ?? "https://api.codescene.io/v2";
  let output: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) throw new Error("Unexpected empty argument");
    if (arg === "--server") server = requireValue(args, ++index, arg);
    else if (arg === "--output") output = requireValue(args, ++index, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return output ? { server, output } : { server };
}

export function readToken(environment: Environment): string {
  const token =
    environment.CS_ACCESS_TOKEN ?? environment.cs_access_token ?? environment.CODESCENE_TOKEN;
  if (!token) throw new Error("Missing access token. Set CS_ACCESS_TOKEN in the environment.");
  return token;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}
