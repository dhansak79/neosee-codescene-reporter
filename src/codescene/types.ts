export type CodeSceneProject = {
  id: string | number;
  name: string;
};

export type ProjectPage = {
  projects: CodeSceneProject[];
  raw: unknown;
};
