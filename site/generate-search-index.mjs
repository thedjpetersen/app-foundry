import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pages from "./pages.json" with { type: "json" };

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "generated", "search-index.json");
const guidePaths = {
  "": "docs/index.md",
  motivation: "docs/motivation.md",
  architecture: "docs/architecture.md",
  contracts: "docs/contracts.md",
  presentation: "docs/presentation-seam.md",
  generators: "docs/generators.md",
  source: "docs/source.md",
};
const sourcePaths = {
  "source/core-host": "src/core/host.ts",
  "source/core-shell-sdk": "src/core/shell-sdk.ts",
  "source/core-access-control": "src/core/access-control.ts",
  "source/core-entities": "src/core/entities.ts",
  "source/core-importmap": "src/core/importmap.ts",
  "source/react-presentation-adapter": "src/react/presentation-adapter.ts",
  "source/react-frame-model": "src/react/frame-model.ts",
  "source/react-command-palette-model": "src/react/command-palette-model.ts",
  "source/react-preferences-model": "src/react/preferences-model.ts",
  "source/react-app-runtime": "src/react/app-runtime.tsx",
  "source/worker-http": "src/worker/http.ts",
  "source/worker-access-guard": "src/worker/access-guard.ts",
  "source/worker-d1": "src/worker/d1.ts",
  "source/worker-short-links": "src/worker/short-links.ts",
  "source/generator": "src/generator/index.ts",
};
const entries = [];

for (const page of pages) {
  const guidePath = guidePaths[page.slug];
  if (guidePath) {
    const markdown = await readFile(path.join(root, guidePath), "utf8");
    entries.push({
      id: `page:${page.slug || "overview"}`,
      kind: "Guide",
      label: page.label,
      context: page.group,
      description: page.description,
      slug: page.slug,
      terms: cleanText(markdown),
    });

    for (const section of markdownSections(markdown)) {
      if (section.level === 1) continue;
      entries.push({
        id: `section:${page.slug || "overview"}:${section.id}`,
        kind: "Section",
        label: section.label,
        context: page.label,
        description: excerpt(section.body),
        slug: page.slug,
        hash: section.id,
        terms: cleanText(section.body),
      });
    }
  }

  const sourcePath = sourcePaths[page.slug];
  if (sourcePath) {
    const raw = await readFile(path.join(root, sourcePath), "utf8");
    const commentary = collectCommentary(raw);
    entries.push({
      id: `module:${page.slug}`,
      kind: "Module",
      label: page.label,
      context: sourcePath,
      description: page.description,
      slug: page.slug,
      terms: commentary,
    });

    for (const symbol of collectExportedSymbols(raw)) {
      entries.push({
        id: `symbol:${page.slug}:${symbol.name}`,
        kind: "Symbol",
        label: symbol.name,
        context: sourcePath,
        description: page.description,
        slug: page.slug,
        hash: `L${symbol.line}`,
        terms: `${page.label} ${sourcePath}`,
      });
    }
  }
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Generated ${entries.length} documentation search entries.`);

function markdownSections(markdown) {
  const matches = [...markdown.matchAll(/^(#{1,3})\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? markdown.length;
    const label = cleanText(match[2] ?? "");
    return {
      body: markdown.slice(bodyStart, bodyEnd),
      id: slugify(label),
      label,
      level: match[1]?.length ?? 1,
    };
  });
}

function collectExportedSymbols(raw) {
  const pattern =
    /^\s*export (?:declare )?(?:abstract )?(?:async )?(?:function|class|const|let|type|interface|enum) ([A-Za-z_$][\w$]*)/;
  return raw.split("\n").flatMap((line, index) => {
    const match = line.match(pattern);
    return match?.[1] ? [{ name: match[1], line: index + 1 }] : [];
  });
}

function collectCommentary(raw) {
  return raw
    .split("\n")
    .filter((line) => /^\s*(?:\/\/|\/\*|\*|\*\/)/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\/\*\*?/, "")
        .replace(/^\*\/?/, "")
        .replace(/^\/\//, "")
        .replace(/\*\/$/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

function excerpt(value) {
  return cleanText(value).slice(0, 180);
}

function cleanText(value) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
