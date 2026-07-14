import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const pagePaths = [
  "index.html",
  "motivation/index.html",
  "architecture/index.html",
  "contracts/index.html",
  "presentation/index.html",
  "generators/index.html",
];
const expectedTargets = new Set(pagePaths);

for (const pagePath of pagePaths) {
  const html = await readFile(path.join(output, pagePath), "utf8");

  for (const required of ["<main", "<h1>", "On this page", "Framework boundary"]) {
    if (!html.includes(required)) {
      throw new Error(`${pagePath} is missing ${required}`);
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
];

for (const [foreground, background, label] of contrastPairs) {
  const ratio = contrast(foreground, background);

  if (ratio < 4.5) {
    throw new Error(`${label} contrast is ${ratio.toFixed(2)}:1`);
  }
}

console.log(
  `Checked ${pagePaths.length} pages, internal navigation, and ${contrastPairs.length} contrast pairs.`,
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
