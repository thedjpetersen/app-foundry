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
    `https://thedjpetersen.github.io/app-foundry/${page.slug ? `${page.slug}/` : ""}`,
    "/app-foundry/assets/",
  ]) {
    if (!html.includes(marker)) {
      throw new Error(`${pagePath} is missing ${marker}`);
    }
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
];

for (const [foreground, background, label] of contrastPairs) {
  const ratio = contrast(foreground, background);
  if (ratio < 4.5) {
    throw new Error(`${label} contrast is ${ratio.toFixed(2)}:1`);
  }
}

console.log(
  `Checked ${pages.length} Astryx routes, ${sourcePages.length} annotated modules, compiled tokens, package boundaries, and source contrast.`,
);

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
