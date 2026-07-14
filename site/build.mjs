import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import {
  collectExportedSymbols,
  parseAnnotatedSections,
} from "./annotated.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "site", "dist");
const baseUrl = normalizeBaseUrl(
  process.env.DOCS_BASE_URL ?? "/app-foundry/",
);
const siteUrl = "https://thedjpetersen.github.io/app-foundry/";

const documentationPages = [
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

const sourceLanding = {
  slug: "source",
  source: "docs/source.md",
  label: "Source",
  eyebrow: "Annotated implementation",
  description:
    "Commentary and repository source rendered together at the public framework boundary.",
};

const sourceModules = [
  module("core-host", "app-foundry/core", "src/core/host.ts", "Host lifecycle", "Manifest registration, activation, navigation, disposal, and workspace aggregation."),
  module("core-shell-sdk", "app-foundry/core", "src/core/shell-sdk.ts", "Shell SDK", "Commands, context, events, preferences, and disposable collaboration state."),
  module("core-access-control", "app-foundry/core", "src/core/access-control.ts", "Access control", "Capability declarations, grants, requirements, and access decisions."),
  module("core-entities", "app-foundry/core", "src/core/entities.ts", "Workspace entities", "Cross-module entity kinds, sources, aggregation, mentions, and references."),
  module("core-importmap", "app-foundry/core", "src/core/importmap.ts", "Import maps", "Import-map generation and installation for independently shipped modules."),
  module("react-presentation-adapter", "app-foundry/react", "src/react/presentation-adapter.ts", "Presentation adapter", "The feature-level frame, palette, preferences, outlet, and error-boundary seam."),
  module("react-frame-model", "app-foundry/react", "src/react/frame-model.ts", "Frame model", "Headless navigation and shell state consumed by a presentation adapter."),
  module("react-command-palette-model", "app-foundry/react", "src/react/command-palette-model.ts", "Command palette model", "Presentation-neutral command search, selection, and execution state."),
  module("react-preferences-model", "app-foundry/react", "src/react/preferences-model.ts", "Preferences model", "Headless grouped settings and resolved-source inspection."),
  module("react-app-runtime", "app-foundry/react", "src/react/app-runtime.tsx", "App runtime", "React bindings for activating, rendering, and disposing App Modules."),
  module("worker-http", "app-foundry/worker", "src/worker/http.ts", "HTTP helpers", "Explicit routes, JSON responses, request parsing, health, and asset fallbacks."),
  module("worker-access-guard", "app-foundry/worker", "src/worker/access-guard.ts", "Access guard", "Request-bound capability checks and denied-response behavior."),
  module("worker-d1", "app-foundry/worker", "src/worker/d1.ts", "D1 helpers", "Binding guards, prepared statements, and small batch helpers."),
  module("worker-short-links", "app-foundry/worker", "src/worker/short-links.ts", "Short links", "Unbiased short-code generation and redirect-route composition."),
  module("generator", "app-foundry/generator", "src/generator/index.ts", "Generator engine", "Naming, path containment, overwrite protection, dry runs, and deterministic writes."),
];

const sourcePages = sourceModules.map((item) => ({
  ...item,
  kind: "source",
  slug: `source/${item.id}`,
  source: item.path,
  eyebrow: item.surface,
}));
const pages = [...documentationPages, sourceLanding, ...sourcePages];
const primaryNavigation = [
  ...documentationPages.slice(0, 5),
  sourceLanding,
];

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });

const stylesheet = await readFile(path.join(root, "site", "styles.css"), "utf8");
await writeFile(path.join(output, "assets", "styles.css"), stylesheet);
await writeFile(path.join(output, ".nojekyll"), "");

for (const page of pages) {
  const { content, headings } =
    page.kind === "source"
      ? await buildAnnotatedSource(page)
      : await buildMarkdownPage(page);
  const destination = page.slug
    ? path.join(output, page.slug, "index.html")
    : path.join(output, "index.html");

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, renderPage(page, content, headings));
}

await writeFile(
  path.join(output, "pages.json"),
  JSON.stringify(
    pages.map((page) => ({ slug: page.slug, source: page.source })),
    null,
    2,
  ),
);
await writeFile(
  path.join(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/sitemap/0.9">
${pages
  .map(
    (page) =>
      `  <url><loc>${siteUrl}${page.slug ? `${page.slug}/` : ""}</loc></url>`,
  )
  .join("\n")}
</urlset>
`,
);

console.log(
  `Built ${documentationPages.length + 1} guides and ${sourcePages.length} annotated source pages.`,
);

async function buildMarkdownPage(page) {
  const markdown = await readFile(path.join(root, page.source), "utf8");
  const headings = collectHeadings(markdown);
  let content = addHeadingAnchors(await marked.parse(markdown), headings);

  if (page.slug === sourceLanding.slug) {
    content += renderSourceIndex();
  }

  return { content, headings };
}

async function buildAnnotatedSource(page) {
  const raw = await readFile(path.join(root, page.path), "utf8");
  const symbols = collectExportedSymbols(raw);
  const sections = parseAnnotatedSections(raw);
  const headings = symbols.map((symbol) => ({
    id: `L${symbol.line}`,
    label: symbol.name,
  }));

  return {
    headings,
    content: renderAnnotatedSource(page, sections, symbols),
  };
}

function renderPage(page, content, headings) {
  const title = page.slug ? `${page.label} · App Foundry` : "App Foundry Docs";
  const canonical = `${siteUrl}${page.slug ? `${page.slug}/` : ""}`;
  const pagePath = `${baseUrl}${page.slug ? `${page.slug}/` : ""}`;
  const isSource = page.kind === "source";
  const repositoryLink = isSource
    ? `https://github.com/thedjpetersen/app-foundry/blob/main/${page.source}`
    : `https://github.com/thedjpetersen/app-foundry/edit/main/${page.source}`;

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
        ${primaryNavigation.map((item) => renderTopNavItem(item, page)).join("")}
      </nav>
      <a class="github-link" href="https://github.com/thedjpetersen/app-foundry">GitHub <span aria-hidden="true">↗</span></a>
    </header>
    <section class="docs-layout${isSource ? " has-source" : ""}">
      <aside class="sidebar" aria-label="Documentation sections">
        ${renderSidebar(page)}
      </aside>
      <main id="content" class="content${isSource ? " source-content" : ""}" data-page="${escapeHtml(page.slug || "overview")}">
        ${isSource ? "" : renderPageIntro(page)}
        ${isSource ? content : `<article class="prose">${content}</article>`}
        <nav class="page-turn" aria-label="Continue reading">
          ${renderPageTurn(page)}
        </nav>
      </main>
      <aside class="toc" aria-label="On this page">
        <p>${isSource ? "Exported symbols" : "On this page"}</p>
        <nav>${headings
          .map((heading) => `<a href="#${heading.id}">${escapeHtml(heading.label)}</a>`)
          .join("")}</nav>
        <a class="edit-link" href="${repositoryLink}">${isSource ? "View source" : "Edit this page"} <span aria-hidden="true">↗</span></a>
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

function renderPageIntro(page) {
  return `<header class="page-intro">
    <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
    <p class="page-summary">${escapeHtml(page.description)}</p>
    <p class="page-location"><span>app-foundry</span><span aria-hidden="true">/</span><strong>${escapeHtml(page.slug || "overview")}</strong></p>
  </header>`;
}

function renderSidebar(current) {
  return `${renderSidebarGroup("Start", documentationPages.slice(0, 2), current)}
    ${renderSidebarGroup("Framework", documentationPages.slice(2), current)}
    ${renderSidebarGroup("Source", [sourceLanding, ...sourcePages], current, true)}
    <section class="boundary-note">
      <strong>Framework boundary</strong>
      <p>Contracts and orchestration live here. Components and visual language live in a selected UI kit.</p>
    </section>`;
}

function renderSidebarGroup(label, items, current, compact = false) {
  return `<section class="sidebar-group">
    <p class="sidebar-label">${label}</p>
    <nav>${items.map((item) => renderSideNavItem(item, current, compact)).join("")}</nav>
  </section>`;
}

function renderTopNavItem(item, current) {
  const active =
    item.slug === current.slug ||
    (item.slug === sourceLanding.slug && current.slug.startsWith("source/"));
  return `<a href="${pageHref(item)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
}

function renderSideNavItem(item, current, compact) {
  const active = item.slug === current.slug;
  const glyph = item.kind === "source" ? "▥" : item.slug === "source" ? "⌘" : "›";
  return `<a class="sidebar-item${compact ? " compact" : ""}" href="${pageHref(item)}"${active ? ' aria-current="page"' : ""}>
    <span class="nav-glyph" aria-hidden="true">${glyph}</span>
    <span><strong>${escapeHtml(item.label)}</strong>${compact ? "" : `<small>${escapeHtml(item.description)}</small>`}</span>
  </a>`;
}

function renderPageTurn(current) {
  const sequence = current.kind === "source" ? sourcePages : [...documentationPages, sourceLanding];
  const index = sequence.findIndex((page) => page.slug === current.slug);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];

  if (index < 0) {
    return "<span></span><span></span>";
  }

  return `${previous ? renderTurnLink(previous, "Previous") : "<span></span>"}${
    next ? renderTurnLink(next, "Next") : "<span></span>"
  }`;
}

function renderTurnLink(page, direction) {
  return `<a href="${pageHref(page)}"><small>${direction}</small><strong>${escapeHtml(page.label)} ${direction === "Next" ? "→" : "←"}</strong></a>`;
}

function renderSourceIndex() {
  const groups = Map.groupBy(sourcePages, (page) => page.surface);

  return `<section class="source-index" aria-label="Annotated modules">
    ${[...groups.entries()]
      .map(
        ([surface, modules]) => `<section class="source-group">
          <h2 id="${slugify(surface)}">${escapeHtml(surface)}</h2>
          <ul>${modules
            .map(
              (item) => `<li><a href="${pageHref(item)}"><code>${escapeHtml(item.path)}</code><span>${escapeHtml(item.description)}</span><b aria-hidden="true">→</b></a></li>`,
            )
            .join("")}</ul>
        </section>`,
      )
      .join("")}
  </section>`;
}

function renderAnnotatedSource(page, sections, symbols) {
  return `<article class="annotated-page">
    <header class="annotated-header">
      <p class="eyebrow">${escapeHtml(page.surface)}</p>
      <h1>${escapeHtml(path.basename(page.path))}</h1>
      <p>${escapeHtml(page.description)}</p>
      <section class="source-meta"><code>${escapeHtml(page.path)}</code><a href="https://github.com/thedjpetersen/app-foundry/blob/main/${page.path}">View on GitHub ↗</a></section>
      ${symbols.length > 0 ? `<nav class="symbol-list" aria-label="Exported symbols">${symbols.map((symbol) => `<a href="#L${symbol.line}">${escapeHtml(symbol.name)}</a>`).join("")}</nav>` : ""}
    </header>
    <ol class="annotated-sections">
      ${sections.map((section) => renderAnnotatedSection(section)).join("")}
    </ol>
  </article>`;
}

function renderAnnotatedSection(section) {
  return `<li class="annotated-row">
    <aside class="annotation-cell">${section.annotation.map((paragraph) => `<p>${renderInlineCode(paragraph)}</p>`).join("")}</aside>
    <section class="source-code-cell"><pre><code>${renderCodeLines(section.code, section.startLine)}</code></pre></section>
  </li>`;
}

function renderCodeLines(code, startLine) {
  if (!code) {
    return "";
  }

  return code
    .split("\n")
    .map((line, index) => {
      const lineNumber = startLine + index;
      return `<span class="code-line" id="L${lineNumber}"><a href="#L${lineNumber}" aria-label="Line ${lineNumber}">${lineNumber}</a><span>${escapeHtml(line) || " "}</span></span>`;
    })
    .join("\n");
}

function renderInlineCode(value) {
  return value
    .split(/`([^`]+)`/g)
    .map((part, index) =>
      index % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part),
    )
    .join("");
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

function module(id, surface, modulePath, label, description) {
  return { id, surface, path: modulePath, label, description };
}

function pageHref(page) {
  return `${baseUrl}${page.slug ? `${page.slug}/` : ""}`;
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
