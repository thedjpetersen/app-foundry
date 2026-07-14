import pagesData from "../pages.json";
import searchIndexData from "../generated/search-index.json";
import architecture from "../../docs/architecture.md?raw";
import contracts from "../../docs/contracts.md?raw";
import generators from "../../docs/generators.md?raw";
import overview from "../../docs/index.md?raw";
import motivation from "../../docs/motivation.md?raw";
import presentation from "../../docs/presentation-seam.md?raw";
import sourceGuide from "../../docs/source.md?raw";
import coreAccessControl from "../../src/core/access-control.ts?raw";
import coreEntities from "../../src/core/entities.ts?raw";
import coreHost from "../../src/core/host.ts?raw";
import coreImportmap from "../../src/core/importmap.ts?raw";
import coreShellSdk from "../../src/core/shell-sdk.ts?raw";
import generator from "../../src/generator/index.ts?raw";
import reactAppRuntime from "../../src/react/app-runtime.tsx?raw";
import reactCommandPaletteModel from "../../src/react/command-palette-model.ts?raw";
import reactFrameModel from "../../src/react/frame-model.ts?raw";
import reactPreferencesModel from "../../src/react/preferences-model.ts?raw";
import reactPresentationAdapter from "../../src/react/presentation-adapter.ts?raw";
import workerAccessGuard from "../../src/worker/access-guard.ts?raw";
import workerD1 from "../../src/worker/d1.ts?raw";
import workerHttp from "../../src/worker/http.ts?raw";
import workerShortLinks from "../../src/worker/short-links.ts?raw";

export type Page = {
  slug: string;
  label: string;
  group: "Start" | "Framework" | "Source";
  description: string;
};

export type SourceModule = Page & {
  path: string;
  raw: string;
  surface: string;
};

export type SearchEntry = {
  id: string;
  kind: "Guide" | "Module" | "Section" | "Symbol";
  label: string;
  context: string;
  description: string;
  slug: string;
  hash?: string;
  terms: string;
};

export const pages = pagesData as Page[];
export const searchIndex = searchIndexData as SearchEntry[];

export const markdownBySlug: Record<string, string> = {
  "": overview,
  motivation,
  architecture,
  contracts,
  presentation,
  generators,
  source: sourceGuide,
};

const sourceDetails: Record<
  string,
  { path: string; raw: string; surface: string }
> = {
  "source/core-host": {
    path: "src/core/host.ts",
    raw: coreHost,
    surface: "app-foundry/core",
  },
  "source/core-shell-sdk": {
    path: "src/core/shell-sdk.ts",
    raw: coreShellSdk,
    surface: "app-foundry/core",
  },
  "source/core-access-control": {
    path: "src/core/access-control.ts",
    raw: coreAccessControl,
    surface: "app-foundry/core",
  },
  "source/core-entities": {
    path: "src/core/entities.ts",
    raw: coreEntities,
    surface: "app-foundry/core",
  },
  "source/core-importmap": {
    path: "src/core/importmap.ts",
    raw: coreImportmap,
    surface: "app-foundry/core",
  },
  "source/react-presentation-adapter": {
    path: "src/react/presentation-adapter.ts",
    raw: reactPresentationAdapter,
    surface: "app-foundry/react",
  },
  "source/react-frame-model": {
    path: "src/react/frame-model.ts",
    raw: reactFrameModel,
    surface: "app-foundry/react",
  },
  "source/react-command-palette-model": {
    path: "src/react/command-palette-model.ts",
    raw: reactCommandPaletteModel,
    surface: "app-foundry/react",
  },
  "source/react-preferences-model": {
    path: "src/react/preferences-model.ts",
    raw: reactPreferencesModel,
    surface: "app-foundry/react",
  },
  "source/react-app-runtime": {
    path: "src/react/app-runtime.tsx",
    raw: reactAppRuntime,
    surface: "app-foundry/react",
  },
  "source/worker-http": {
    path: "src/worker/http.ts",
    raw: workerHttp,
    surface: "app-foundry/worker",
  },
  "source/worker-access-guard": {
    path: "src/worker/access-guard.ts",
    raw: workerAccessGuard,
    surface: "app-foundry/worker",
  },
  "source/worker-d1": {
    path: "src/worker/d1.ts",
    raw: workerD1,
    surface: "app-foundry/worker",
  },
  "source/worker-short-links": {
    path: "src/worker/short-links.ts",
    raw: workerShortLinks,
    surface: "app-foundry/worker",
  },
  "source/generator": {
    path: "src/generator/index.ts",
    raw: generator,
    surface: "app-foundry/generator",
  },
};

export const sourceModules: SourceModule[] = pages.flatMap((page) => {
  const details = sourceDetails[page.slug];
  return details ? [{ ...page, ...details }] : [];
});

export const sourceModuleBySlug = new Map(
  sourceModules.map((module) => [module.slug, module]),
);

export function hrefFor(slug: string) {
  const base = import.meta.env.BASE_URL;
  return `${base}${slug ? `${slug}/` : ""}`;
}

export function searchDocs(query: string, limit = 8): SearchEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  if (tokens.length === 0) return [];

  return searchIndex
    .map((entry) => {
      const label = normalizeSearchText(entry.label);
      const context = normalizeSearchText(entry.context);
      const description = normalizeSearchText(entry.description);
      const terms = normalizeSearchText(entry.terms);
      const haystack = `${label} ${context} ${description} ${terms}`;

      if (!tokens.every((token) => haystack.includes(token))) {
        return { entry, score: 0 };
      }

      let score = 0;
      if (label === normalizedQuery) score += 120;
      if (label.startsWith(normalizedQuery)) score += 70;
      if (label.includes(normalizedQuery)) score += 45;
      if (context.includes(normalizedQuery)) score += 22;
      if (description.includes(normalizedQuery)) score += 14;
      score += tokens.reduce(
        (total, token) =>
          total +
          (label.includes(token) ? 12 : 0) +
          (context.includes(token) ? 5 : 0) +
          (description.includes(token) ? 3 : 0) +
          (terms.includes(token) ? 1 : 0),
        0,
      );

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        searchKindRank(left.entry.kind) - searchKindRank(right.entry.kind) ||
        left.entry.label.localeCompare(right.entry.label),
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function searchEntryHref(entry: SearchEntry) {
  const pageHref = hrefFor(entry.slug);
  return entry.hash ? `${pageHref}#${entry.hash}` : pageHref;
}

export function normalizeMarkdownLinks(markdown: string) {
  return markdown.replace(/\]\(\.\/([^)]*)\)/g, (_, target: string) => {
    const slug = target.replace(/^\/+|\/+$/g, "");
    return `](${hrefFor(slug)})`;
  });
}

export function collectHeadings(markdown: string) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    id: slugify(match[1] ?? ""),
    label: stripMarkdown(match[1] ?? ""),
    level: 2 as const,
  }));
}

export function slugify(value: string) {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripMarkdown(value: string) {
  return value.replace(/[`*_]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchKindRank(kind: SearchEntry["kind"]) {
  return { Guide: 0, Module: 1, Section: 2, Symbol: 3 }[kind];
}
