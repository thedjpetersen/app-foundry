import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pages from "./pages.json" with { type: "json" };

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const sourceIndex = await readFile(path.join(output, "index.html"), "utf8");
const siteUrl = "https://thedjpetersen.github.io/app-foundry/";

for (const page of pages) {
  const destination = page.slug
    ? path.join(output, page.slug, "index.html")
    : path.join(output, "index.html");
  const title = page.slug ? `${page.label} · App Foundry` : "App Foundry Docs";
  const canonical = `${siteUrl}${page.slug ? `${page.slug}/` : ""}`;
  const html = sourceIndex
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta name="description" content=".*?" \/>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
    )
    .replace(
      "</head>",
      `    <link rel="canonical" href="${canonical}" />\n  </head>`,
    );

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

await copyFile(
  path.join(root, "site", "pages.json"),
  path.join(output, "pages.json"),
);
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map(
      ({ slug }) =>
        `  <url><loc>${siteUrl}${slug ? `${slug}/` : ""}</loc></url>`,
    )
    .join("\n")}\n</urlset>\n`,
);

console.log(`Prepared ${pages.length} Astryx documentation routes.`);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
