// Responsibility: App Foundry owns the mechanics every generator must get right—portable
// naming, path containment, overwrite policy, dry runs, and deterministic
// writes—while a UI kit or product owns the recipe that decides what files
// and imports to emit. Separating mechanism from recipe lets presentation
// packages accelerate app creation without branding the framework itself.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GeneratorOptions = {
  cwd?: string;
  dir?: string;
  dryRun?: boolean;
  force?: boolean;
};

export type GeneratedFile = {
  action: "create" | "overwrite" | "skip";
  path: string;
};

export type GeneratorDefinition<TKind extends string = string> = {
  defaultDir: string;
  description: string;
  example: string;
  kind: TKind;
  nameFormat: string;
};

export type GeneratorFilePlan = {
  content: string;
  relativePath: string;
};

export type NameParts = {
  camel: string;
  kebab: string;
  pascal: string;
  title: string;
};

export type ScopedNameParts = NameParts & {
  app: NameParts;
  key: string;
  rawName: string;
};

// Failure behavior: Execute a UI-kit-owned recipe with framework-owned safety. The recipe is
// evaluated before any writes, then every proposed path is resolved inside
// `cwd`; one invalid plan therefore fails before it can partially escape the
// requested project root.
export async function runGenerator(
  definition: GeneratorDefinition,
  name: string,
  build: (name: string, dir: string) => GeneratorFilePlan[],
  options: GeneratorOptions = {},
): Promise<GeneratedFile[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const dir = options.dir ?? definition.defaultDir;
  const files = build(name, dir);
  const written: GeneratedFile[] = [];

  // Process in recipe order so dry-run output and real writes describe the
  // same deterministic plan. Existing files are errors unless force was an
  // explicit caller choice; silent merging would make generated code depend
  // on whatever happened to be on disk.
  for (const file of files) {
    const targetPath = resolveInside(cwd, file.relativePath);
    const existed = await fileExists(targetPath);
    const relativePath = path.relative(cwd, targetPath);

    if (existed && !options.force) {
      throw new Error(
        `${relativePath} already exists. Re-run with --force to overwrite.`,
      );
    }

    if (options.dryRun) {
      written.push({
        action: existed ? "skip" : "create",
        path: relativePath,
      });
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, "utf8");
    written.push({
      action: existed ? "overwrite" : "create",
      path: relativePath,
    });
  }

  return written;
}

// Decision: Scoped names make ownership visible in keys and filenames. Splitting only
// on the first app segment lets feature names retain nested punctuation while
// normalizing to one stable `<app>.<feature>` identity.
export function toScopedNameParts(
  value: string,
  label: string,
): ScopedNameParts {
  const [appId, ...rest] = value.split(/[./]/).filter(Boolean);
  const rawName = rest.join("-");

  if (!appId || !rawName) {
    throw new Error(
      `${label} names must use <app-id>.<name>, for example catalog.refresh.`,
    );
  }

  return {
    ...toNameParts(rawName),
    app: toNameParts(appId),
    key: `${toKebab(appId)}.${toKebab(rawName)}`,
    rawName,
  };
}

// Invariant: Produce all naming forms once so recipes cannot drift between hand-written
// camel, Pascal, title, and kebab transformations.
export function toNameParts(value: string): NameParts {
  const kebab = toKebab(value);

  if (!kebab) {
    throw new Error("Name must contain at least one letter or number.");
  }

  const words = kebab.split("-");
  const pascal = words.map(capitalize).join("");

  return {
    camel: `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`,
    kebab,
    pascal,
    title: words.map(capitalize).join(" "),
  };
}

export function toKebab(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function resolveInside(cwd: string, relativePath: string): string {
  const targetPath = path.resolve(cwd, relativePath);
  const relative = path.relative(cwd, targetPath);

  // `path.relative` is the cross-platform containment check: traversal and
  // absolute paths both remain outside after resolution and are rejected.
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${cwd}: ${relativePath}`);
  }

  return targetPath;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
