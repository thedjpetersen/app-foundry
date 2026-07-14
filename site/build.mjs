import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const baseUrl = normalizeBaseUrl(
  process.env.DOCS_BASE_URL ?? "/app-foundry/",
);
const siteUrl = "https://thedjpetersen.github.io/app-foundry/";

const pages = [
  {
    slug: "",
    source: "docs/index.md",
    label: "Overview",
    eyebrow: "Application framework",
    description:
      "A design-system-neutral framework for independently developed App Modules.",
  },
  {
    slug: "motivation",
    source: "docs/motivation.md",
    label: "Motivation",
    eyebrow: "Why it exists",
    description:
      "How bounded applications limit compounding mistakes in LLM-assisted development.",
  },
  {
    slug: "architecture",
    source: "docs/architecture.md",
    label: "Architecture",
    eyebrow: "Ownership",
    description:
      "One durable framework, replaceable presentation, and independently owned App Modules.",
  },
  {
    slug: "contracts",
    source: "docs/contracts.md",
    label: "Contracts",
    eyebrow: "Collaboration",
    description:
      "Manifests, activation, registries, and package-by-feature boundaries.",
  },
  {
    slug: "presentation",
    source: "docs/presentation-seam.md",
    label: "Presentation seam",
    eyebrow: "Replaceable UI",
    description:
      "The feature-level contract between App Foundry and an independent UI kit.",
  },
  {
    slug: "generators",
    source: "docs/generators.md",
    label: "Generators",
    eyebrow: "Safe scaffolding",
    description:
      "Neutral generator mechanics with presentation-specific recipes layered above them.",
  },
];

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });

const stylesheet = await readFile(path.join(root, "site", "styles.css"), "utf8");
await writeFile(path.join(output, "assets", "styles.css"), stylesheet);
await writeFile(path.join(output, ".nojekyll"), "");

for (const page of pages) {
  const markdown = await readFile(path.join(root, page.source), "utf8");
  const headings = collectHeadings(markdown);
  const content = addHeadingAnchors(await marked.parse(markdown), headings);
  const destination = page.slug
    ? path.join(output, page.slug, "index.html")
    : path.join(output, "index.html");

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, renderPage(page, content, headings));
}

await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) =>
      `  <url><loc>${siteUrl}${page.slug ? `${page.slug}/` : ""}</loc></url>`,
  )
  .join("\n")}
</urlset>
`,
);

console.log(`Built ${pages.length} App Foundry documentation pages.`);

function renderPage(page, content, headings) {
  const title = page.slug ? `${page.label} · App Foundry` : "App Foundry Docs";
  const canonical = `${siteUrl}${page.slug ? `${page.slug}/` : ""}`;
  const pagePath = `${baseUrl}${page.slug ? `${page.slug}/` : ""}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="theme-color" content="#f5f6f3" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111318" media="(prefers-color-scheme: dark)" />
    <link rel="canonical" href="${canonical}" />
    <link rel="stylesheet" href="${baseUrl}assets/styles.css" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <a class="skip-link" href="#content">Skip to content</a>
    <header class="topbar">
      <a class="brand" href="${baseUrl}" aria-label="App Foundry documentation home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="brand-copy"><strong>App Foundry</strong><small>Framework docs</small></span>
      </a>
      <nav class="topnav" aria-label="Primary documentation">
        ${pages
          .slice(0, 5)
          .map((item) => renderTopNavItem(item, page))
          .join("")}
      </nav>
      <a class="github-link" href="https://github.com/thedjpetersen/app-foundry">GitHub <span aria-hidden="true">↗</span></a>
    </header>
    <section class="docs-layout">
      <aside class="sidebar" aria-label="Documentation sections">
        <p class="sidebar-label">Documentation</p>
        <nav>
          ${pages.map((item, index) => renderSideNavItem(item, page, index)).join("")}
        </nav>
        <section class="boundary-note">
          <strong>Framework boundary</strong>
          <p>Contracts and orchestration live here. Components and visual language live in a selected UI kit.</p>
        </section>
      </aside>
      <main id="content" class="content" data-page="${escapeHtml(page.slug || "overview")}">
        <header class="page-intro">
          <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
          <p class="page-summary">${escapeHtml(page.description)}</p>
          <p class="page-location"><span>app-foundry</span><span aria-hidden="true">/</span><strong>${escapeHtml(page.slug || "overview")}</strong></p>
        </header>
        <article class="prose">${content}</article>
        <nav class="page-turn" aria-label="Continue reading">
          ${renderPageTurn(page)}
        </nav>
      </main>
      <aside class="toc" aria-label="On this page">
        <p>On this page</p>
        <nav>${headings
          .map((heading) => `<a href="#${heading.id}">${escapeHtml(heading.label)}</a>`)
          .join("")}</nav>
        <a class="edit-link" href="https://github.com/thedjpetersen/app-foundry/edit/main/${page.source}">Edit this page <span aria-hidden="true">↗</span></a>
      </aside>
    </section>
    <footer class="footer">
      <span>App Foundry · durable contracts for disposable apps</span>
      <a href="${pagePath}#content">Back to top ↑</a>
    </footer>
  </body>
</html>
`;
}

function renderTopNavItem(item, current) {
  const active = item.slug === current.slug;
  return `<a href="${baseUrl}${item.slug ? `${item.slug}/` : ""}"${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
}

function renderSideNavItem(item, current, index) {
  const active = item.slug === current.slug;
  return `<a class="sidebar-item" href="${baseUrl}${item.slug ? `${item.slug}/` : ""}"${active ? ' aria-current="page"' : ""}>
    <span class="nav-index">0${index + 1}</span>
    <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span>
  </a>`;
}

function renderPageTurn(current) {
  const index = pages.findIndex((page) => page.slug === current.slug);
  const previous = pages[index - 1];
  const next = pages[index + 1];

  return `${previous ? renderTurnLink(previous, "Previous") : "<span></span>"}${
    next ? renderTurnLink(next, "Next") : "<span></span>"
  }`;
}

function renderTurnLink(page, direction) {
  return `<a href="${baseUrl}${page.slug ? `${page.slug}/` : ""}"><small>${direction}</small><strong>${escapeHtml(page.label)} ${direction === "Next" ? "→" : "←"}</strong></a>`;
}

function collectHeadings(markdown) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    id: slugify(match[1]),
    label: stripMarkdown(match[1]),
  }));
}

function addHeadingAnchors(html, headings) {
  let index = 0;

  return html.replace(/<h2>(.*?)<\/h2>/g, (_, body) => {
    const heading = headings[index++];
    return heading
      ? `<h2 id="${heading.id}">${body}<a class="heading-anchor" href="#${heading.id}" aria-label="Link to ${escapeHtml(heading.label)}">#</a></h2>`
      : `<h2>${body}</h2>`;
  });
}

function normalizeBaseUrl(value) {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}/` : "/";
}

function slugify(value) {
  return stripMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripMarkdown(value) {
  return value.replace(/[`*_]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
