import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const pages = JSON.parse(
  await readFile(path.join(output, "pages.json"), "utf8"),
);
const pagePaths = pages.map(({ slug }) =>
  slug === "" ? "index.html" : `${slug}/index.html`,
);
const expectedTargets = new Set(pagePaths);
const sourcePaths = pagePaths.filter((pagePath) =>
  pagePath.startsWith("source/") && pagePath !== "source/index.html",
);

if (sourcePaths.length < 15) {
  throw new Error(
    `Expected at least 15 annotated source pages, found ${sourcePaths.length}`,
  );
}

for (const pagePath of pagePaths) {
  const html = await readFile(path.join(output, pagePath), "utf8");
  const isAnnotatedSource = sourcePaths.includes(pagePath);
  const required = isAnnotatedSource
    ? [
        "<main",
        "<h1>",
        "Exported symbols",
        "annotated-page",
        "code-line",
        "Framework boundary",
      ]
    : ["<main", "<h1>", "On this page", "Framework boundary"];

  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`${pagePath} is missing ${marker}`);
    }
  }

  for (const match of html.matchAll(/href="(\/app-foundry\/[^"#?]*)/g)) {
    const relative = match[1].replace(/^\/app-foundry\//, "");
    const target = relative === "" ? "index.html" : `${relative}index.html`;

    if (!relative.startsWith("assets/") && !expectedTargets.has(target)) {
      throw new Error(`${pagePath} links to missing internal page ${match[1]}`);
    }
  }
}

const contrastPairs = [
  ["#17191f", "#ffffff", "light primary text"],
  ["#5a606e", "#ffffff", "light secondary text"],
  ["#2648c4", "#ffffff", "light links"],
  ["#f4f6fb", "#171a21", "dark primary text"],
  ["#aeb6c7", "#171a21", "dark secondary text"],
  ["#a9bbff", "#171a21", "dark links"],
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
  `Checked ${pagePaths.length} pages, ${sourcePaths.length} annotated modules, internal navigation, and ${contrastPairs.length} contrast pairs.`,
);

function contrast(foreground, background) {
  const light = luminance(foreground);
  const dark = luminance(background);
  const high = Math.max(light, dark);
  const low = Math.min(light, dark);
  return (high + 0.05) / (low + 0.05);
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
