import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pages from "./pages.json" with { type: "json" };

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const expectedTargets = new Set(
  pages.map(({ slug }) => (slug ? `${slug}/index.html` : "index.html")),
);
const sourcePages = pages.filter(({ slug }) => slug.startsWith("source/"));

if (sourcePages.length < 15) {
  throw new Error(`Expected 15 annotated modules, found ${sourcePages.length}`);
}

for (const page of pages) {
  const pagePath = page.slug ? `${page.slug}/index.html` : "index.html";
  const html = await readFile(path.join(output, pagePath), "utf8");
  const expectedTitle = page.slug
    ? `<title>${page.label} · App Foundry</title>`
    : "<title>App Foundry Docs</title>";

  for (const marker of [
    expectedTitle,
    '<app-foundry-docs id="root">',
    '<link rel="icon" href="/app-foundry/favicon.svg" type="image/svg+xml" />',
    `https://thedjpetersen.github.io/app-foundry/${page.slug ? `${page.slug}/` : ""}`,
    "/app-foundry/assets/",
  ]) {
    if (!html.includes(marker)) {
      throw new Error(`${pagePath} is missing ${marker}`);
    }
  }
}

const favicon = await readFile(path.join(output, "favicon.svg"), "utf8");
for (const marker of [
  'viewBox="0 0 32 32"',
  'rx="9"',
  'aria-label="App Foundry"',
]) {
  if (!favicon.includes(marker)) {
    throw new Error(`Approachable favicon is missing ${marker}`);
  }
}

const searchIndex = JSON.parse(
  await readFile(
    path.join(root, "site", "generated", "search-index.json"),
    "utf8",
  ),
);
const searchKinds = new Set(searchIndex.map(({ kind }) => kind));

if (searchIndex.length < 200) {
  throw new Error(`Search index is too shallow: ${searchIndex.length} entries`);
}

for (const kind of ["Guide", "Section", "Module", "Symbol"]) {
  if (!searchKinds.has(kind)) {
    throw new Error(`Search index is missing ${kind} entries`);
  }
}

const moduleEntries = searchIndex.filter(({ kind }) => kind === "Module");
for (const entry of moduleEntries) {
  const raw = await readFile(path.join(root, entry.context), "utf8");
  const commentaryWordCount = entry.terms.split(/\s+/).filter(Boolean).length;
  if (commentaryWordCount < 40) {
    throw new Error(
      `${entry.context} needs stronger annotated commentary (${commentaryWordCount} words)`,
    );
  }

  const firstLine = raw.split("\n").find((line) => line.trim());
  if (!firstLine?.trim().startsWith("// Responsibility:")) {
    throw new Error(
      `${entry.context} must open by explaining the module's responsibility`,
    );
  }

  const structuredAnnotations = [
    ...raw.matchAll(
      /\b(?:Responsibility|Invariant|Decision|Lifecycle|Failure behavior|API contract):/g,
    ),
  ];
  const lineCount = raw.split("\n").length;
  const requiredAnnotations = lineCount > 100 ? 4 : 2;

  if (structuredAnnotations.length < requiredAnnotations) {
    throw new Error(
      `${entry.context} needs ${requiredAnnotations} structured architectural annotations; found ${structuredAnnotations.length}`,
    );
  }

  const longestRun = longestUnannotatedRun(raw);
  if (longestRun > 60) {
    throw new Error(
      `${entry.context} leaves ${longestRun} lines without explanatory context`,
    );
  }
}

if (expectedTargets.size !== pages.length) {
  throw new Error("Documentation routes must be unique");
}

const assetNames = await readdir(path.join(output, "assets"));
const css = (
  await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFile(path.join(output, "assets", name), "utf8")),
  )
).join("\n");
const javascript = (
  await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(path.join(output, "assets", name), "utf8")),
  )
).join("\n");

for (const marker of [
  "--color-background-body",
  "--color-background-surface",
  "--color-text-primary",
  "--spacing-5",
]) {
  if (!css.includes(marker)) {
    throw new Error(`Compiled Astryx styles are missing ${marker}`);
  }
}

for (const marker of [
  "App Foundry documentation",
  "Framework boundary",
  "Annotated source",
  "Exported symbols",
  "src/core/host.ts",
  "src/react/presentation-adapter.ts",
  "Search docs and source",
  "No guide, section, module, or symbol matches",
  "app-foundry-source",
  "astryx-token-",
  "Responsibility",
  "Failure behavior",
]) {
  if (!javascript.includes(marker)) {
    throw new Error(`Compiled documentation application is missing ${marker}`);
  }
}

const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);

if (!packageJson.devDependencies?.["@astryxdesign/core"]) {
  throw new Error("The docs site must use the Astryx design system");
}

if (
  packageJson.dependencies?.["@astryxdesign/core"] ||
  packageJson.peerDependencies?.["@astryxdesign/core"]
) {
  throw new Error("Astryx must remain a docs-only dependency of App Foundry");
}

const contrastPairs = [
  ["#f4f6fb", "#1a2652", "annotated source code"],
  ["#b9c7f5", "#1a2652", "annotated source line numbers"],
  ["#ff9b91", "#1a2652", "syntax keywords"],
  ["#a5d6ff", "#1a2652", "syntax strings"],
  ["#b5bdc8", "#1a2652", "syntax comments"],
  ["#ffa657", "#1a2652", "syntax types"],
  ["#7ee787", "#1a2652", "syntax operators"],
];

for (const [foreground, background, label] of contrastPairs) {
  const ratio = contrast(foreground, background);
  if (ratio < 4.5) {
    throw new Error(`${label} contrast is ${ratio.toFixed(2)}:1`);
  }
}

console.log(
  `Checked ${pages.length} Astryx routes, ${sourcePages.length} architecturally annotated modules, ${searchIndex.length} search entries, syntax highlighting, package boundaries, and source contrast.`,
);

function longestUnannotatedRun(raw) {
  let current = 0;
  let longest = 0;

  for (const line of raw.split("\n")) {
    if (/^\s*(?:\/\/|\/\*|\*|\*\/)/.test(line)) {
      current = 0;
      continue;
    }

    current += 1;
    longest = Math.max(longest, current);
  }

  return longest;
}

function contrast(foreground, background) {
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
