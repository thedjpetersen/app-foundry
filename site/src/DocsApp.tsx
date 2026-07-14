import {
  AppShell,
  Badge,
  Button,
  Code,
  Heading,
  HStack,
  Icon,
  Link,
  Markdown,
  Outline,
  Section,
  SideNav,
  SideNavItem,
  SideNavSection,
  Text,
  TextInput,
  TopNav,
  TopNavHeading,
  TopNavItem,
  VStack,
} from "@astryxdesign/core";
import { Theme, defineTheme } from "@astryxdesign/core/theme";
import {
  borderVars,
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { collectExportedSymbols, parseAnnotatedSections } from "./annotated";
import {
  collectHeadings,
  hrefFor,
  markdownBySlug,
  normalizeMarkdownLinks,
  pages,
  searchDocs,
  searchEntryHref,
  slugify,
  sourceModuleBySlug,
  sourceModules,
  type Page,
  type SourceModule,
} from "./content";

const docsTheme = defineTheme({ name: "app-foundry-docs" });
const repositoryUrl = "https://github.com/thedjpetersen/app-foundry";
const primarySlugs = [
  "",
  "motivation",
  "architecture",
  "contracts",
  "presentation",
  "source",
];

export function DocsApp() {
  const route = resolveRoute();
  const page = pages.find((candidate) => candidate.slug === route) ?? pages[0];

  if (!page) return null;

  return (
    <Theme theme={docsTheme} mode="system">
      <AppShell
        xstyle={styles.docsShell}
        height="auto"
        variant="section"
        contentPadding={0}
        topNav={<TopNavigation current={page} />}
        sideNav={<SideNavigation current={page} />}
      >
        {sourceModuleBySlug.has(page.slug) ? (
          <AnnotatedSource module={sourceModuleBySlug.get(page.slug)!} />
        ) : (
          <GuidePage page={page} />
        )}
      </AppShell>
    </Theme>
  );
}

function TopNavigation({ current }: { current: Page }) {
  return (
    <TopNav
      xstyle={styles.topNav}
      label="App Foundry documentation"
      heading={
        <TopNavHeading
          logo={<Icon icon="wrench" color="accent" />}
          heading="App Foundry"
          subheading="Framework docs"
          headingHref={hrefFor("")}
        />
      }
      startContent={
        <>
          {primarySlugs.map((slug) => {
            const item = pages.find((candidate) => candidate.slug === slug);
            if (!item) return null;
            const selected =
              current.slug === slug ||
              (slug === "source" && current.slug.startsWith("source/"));

            return (
              <TopNavItem
                key={slug || "overview"}
                label={item.label.replace("Annotated ", "")}
                href={hrefFor(slug)}
                isSelected={selected}
              />
            );
          })}
        </>
      }
      endContent={
        <section {...stylex.props(styles.topNavActions)}>
          <section {...stylex.props(styles.topSearch)}>
            <DocsSearch hasShortcut />
          </section>
          <Button
            label="GitHub"
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            variant="ghost"
            icon={<Icon icon="externalLink" size="sm" />}
          />
        </section>
      }
    />
  );
}

function SideNavigation({ current }: { current: Page }) {
  const groups: Page["group"][] = ["Start", "Framework", "Source"];

  return (
    <SideNav
      xstyle={styles.sideNav}
      topContent={
        <section {...stylex.props(styles.mobileSearch)}>
          <DocsSearch isInline />
        </section>
      }
      footer={
        <Section variant="muted" padding={4} xstyle={styles.boundaryNote}>
          <VStack gap={1}>
            <Text weight="semibold" type="supporting">
              Framework boundary
            </Text>
            <Text as="p" display="block" type="supporting" color="secondary">
              Contracts and orchestration live here. Astryx presents this site;
              applications may select any UI kit.
            </Text>
          </VStack>
        </Section>
      }
    >
      {groups.map((group) => (
        <SideNavSection key={group} title={group}>
          {pages
            .filter((page) => page.group === group)
            .map((page) => (
              <SideNavItem
                key={page.slug || "overview"}
                label={page.label}
                href={hrefFor(page.slug)}
                isSelected={current.slug === page.slug}
                size={group === "Source" ? "sm" : "md"}
              />
            ))}
        </SideNavSection>
      ))}
    </SideNav>
  );
}

function DocsSearch({
  hasShortcut = false,
  isInline = false,
}: {
  hasShortcut?: boolean;
  isInline?: boolean;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchDocs(query), [query]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!hasShortcut) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (
        event.key === "Escape" &&
        document.activeElement === inputRef.current
      ) {
        setQuery("");
        inputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasShortcut]);

  return (
    <section
      role="search"
      {...stylex.props(styles.searchRoot, isInline && styles.searchRootInline)}
    >
      <TextInput
        ref={inputRef}
        label="Search documentation"
        isLabelHidden
        value={query}
        onChange={setQuery}
        placeholder="Search docs and source"
        startIcon="search"
        hasClear
        htmlName={isInline ? "mobileDocsSearch" : "docsSearch"}
        size="sm"
        width="100%"
      />
      {hasQuery ? (
        <Section
          variant="section"
          padding={0}
          aria-label="Documentation search results"
          aria-live="polite"
          xstyle={[
            styles.searchResults,
            isInline && styles.searchResultsInline,
          ]}
        >
          {results.length > 0 ? (
            <ul {...stylex.props(styles.searchList)}>
              {results.map((result) => (
                <li key={result.id} {...stylex.props(styles.searchItem)}>
                  <Link
                    href={searchEntryHref(result)}
                    isStandalone
                    xstyle={styles.searchLink}
                    onClick={() => setQuery("")}
                  >
                    {result.label}
                  </Link>
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {result.kind} · {result.context}
                  </Text>
                  {result.description ? (
                    <Text
                      as="p"
                      display="block"
                      type="supporting"
                      color="secondary"
                      maxLines={2}
                    >
                      {result.description}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Text
              as="p"
              display="block"
              type="supporting"
              color="secondary"
              xstyle={styles.searchEmpty}
            >
              No guide, section, module, or symbol matches “{query}”.
            </Text>
          )}
        </Section>
      ) : null}
    </section>
  );
}

function GuidePage({ page }: { page: Page }) {
  const markdown = normalizeMarkdownLinks(markdownBySlug[page.slug] ?? "");
  const headings = collectHeadings(markdown);

  return (
    <section {...stylex.props(styles.guideLayout)}>
      <Section variant="section" padding={8} xstyle={styles.guideContent}>
        <article>
          <header {...stylex.props(styles.guideMeta)}>
            <Badge variant="blue" label={page.group} />
            <Text type="supporting" color="secondary">
              app-foundry / {page.slug || "overview"}
            </Text>
          </header>
          <Markdown
            contentWidth={760}
            components={{ heading: MarkdownHeading, link: MarkdownLink }}
          >
            {markdown}
          </Markdown>
          {page.slug === "source" ? <SourceIndex /> : null}
          <PageTurn current={page} sequence={pages.slice(0, 7)} />
        </article>
      </Section>
      <aside {...stylex.props(styles.outlineRail)}>
        <Text type="supporting" weight="semibold" color="secondary">
          On this page
        </Text>
        <Outline items={headings} density="compact" />
        <Link
          href={`${repositoryUrl}/edit/main/${sourcePathForGuide(page.slug)}`}
          isExternalLink
          isStandalone
          type="supporting"
        >
          Edit this page
        </Link>
      </aside>
    </section>
  );
}

function SourceIndex() {
  const surfaces = [...new Set(sourceModules.map((module) => module.surface))];

  return (
    <section
      aria-label="Annotated modules"
      {...stylex.props(styles.sourceIndex)}
    >
      {surfaces.map((surface) => (
        <Section
          key={surface}
          id={slugify(surface)}
          variant="transparent"
          padding={0}
          dividers={["top"]}
        >
          <VStack gap={3}>
            <Heading level={2}>{surface}</Heading>
            <ul {...stylex.props(styles.moduleList)}>
              {sourceModules
                .filter((module) => module.surface === surface)
                .map((module) => (
                  <li key={module.slug} {...stylex.props(styles.moduleItem)}>
                    <Link href={hrefFor(module.slug)} isStandalone>
                      <Code>{module.path}</Code>
                    </Link>
                    <Text
                      as="p"
                      display="block"
                      type="supporting"
                      color="secondary"
                    >
                      {module.description}
                    </Text>
                  </li>
                ))}
            </ul>
          </VStack>
        </Section>
      ))}
    </section>
  );
}

function AnnotatedSource({ module }: { module: SourceModule }) {
  const sections = parseAnnotatedSections(module.raw);
  const symbols = collectExportedSymbols(module.raw);
  const outlineItems = symbols.map((symbol) => ({
    id: `L${symbol.line}`,
    label: symbol.name,
    level: 2,
  }));

  return (
    <section {...stylex.props(styles.sourceLayout)}>
      <article {...stylex.props(styles.annotatedPage)}>
        <Section
          variant="section"
          padding={8}
          dividers={["bottom"]}
          xstyle={styles.sourceHeader}
        >
          <VStack gap={3}>
            <HStack gap={3} align="center" wrap="wrap">
              <Heading level={1} type="display-3">
                {module.path.split("/").at(-1)}
              </Heading>
              <Badge variant="blue" label={module.surface} />
            </HStack>
            <Text as="p" display="block" color="secondary">
              {module.description}
            </Text>
            <HStack gap={4} align="center" wrap="wrap">
              <Code>{module.path}</Code>
              <Link
                href={`${repositoryUrl}/blob/main/${module.path}`}
                isExternalLink
                isStandalone
              >
                View on GitHub
              </Link>
            </HStack>
            {symbols.length > 0 ? (
              <nav
                aria-label="Exported symbols"
                {...stylex.props(styles.symbolList)}
              >
                {symbols.map((symbol) => (
                  <Link
                    key={symbol.name}
                    href={`#L${symbol.line}`}
                    isStandalone
                    xstyle={styles.symbolChip}
                  >
                    {symbol.name}
                  </Link>
                ))}
              </nav>
            ) : null}
          </VStack>
        </Section>
        <ol {...stylex.props(styles.annotatedSections)}>
          {sections.map((section) => (
            <li
              key={section.sectionStartLine}
              {...stylex.props(styles.annotatedRow)}
            >
              <Section
                variant="section"
                padding={5}
                dividers={["bottom"]}
                xstyle={styles.annotationCell}
              >
                <VStack gap={2}>
                  {section.annotation.map((paragraph, index) => (
                    <Text
                      key={`${section.sectionStartLine}-${index}`}
                      as="p"
                      display="block"
                      type="supporting"
                      color="secondary"
                    >
                      {renderInlineCode(paragraph)}
                    </Text>
                  ))}
                </VStack>
              </Section>
              <section {...stylex.props(styles.sourceCodeCell)}>
                <pre>
                  <code>
                    {renderCodeLines(section.code, section.startLine)}
                  </code>
                </pre>
              </section>
            </li>
          ))}
        </ol>
        <PageTurn current={module} sequence={sourceModules} />
      </article>
      <aside {...stylex.props(styles.outlineRail, styles.sourceOutline)}>
        <Text type="supporting" weight="semibold" color="secondary">
          Exported symbols
        </Text>
        <Outline items={outlineItems} density="compact" />
      </aside>
    </section>
  );
}

function PageTurn({ current, sequence }: { current: Page; sequence: Page[] }) {
  const index = sequence.findIndex((page) => page.slug === current.slug);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];

  return (
    <nav aria-label="Continue reading" {...stylex.props(styles.pageTurn)}>
      {previous ? (
        <Link href={hrefFor(previous.slug)} isStandalone>
          ← {previous.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={hrefFor(next.slug)} isStandalone>
          {next.label} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function MarkdownHeading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  return (
    <Heading
      level={level}
      type={level === 1 ? "display-3" : undefined}
      id={slugify(textFromNode(children))}
    >
      {children}
    </Heading>
  );
}

function MarkdownLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return <Link href={href}>{children}</Link>;
}

function renderInlineCode(value: string) {
  return value
    .split(/`([^`]+)`/g)
    .map((part, index) =>
      index % 2 === 1 ? (
        <Code key={index}>{part}</Code>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}

function renderCodeLines(code: string, startLine: number) {
  if (!code) return null;

  return code.split("\n").map((line, index) => {
    const lineNumber = startLine + index;
    return (
      <span
        id={`L${lineNumber}`}
        key={lineNumber}
        {...stylex.props(styles.codeLine)}
      >
        <a
          href={`#L${lineNumber}`}
          aria-label={`Line ${lineNumber}`}
          {...stylex.props(styles.lineNumber)}
        >
          {lineNumber}
        </a>
        <span {...stylex.props(styles.codeText)}>{line || " "}</span>
      </span>
    );
  });
}

function textFromNode(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      if (isValidElement<{ children?: ReactNode }>(child))
        return textFromNode(child.props.children);
      return "";
    })
    .join("");
}

function resolveRoute() {
  const base = import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, "");
  const pathname = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const withoutBase =
    base && pathname.startsWith(base)
      ? pathname.slice(base.length).replace(/^\/+/, "")
      : pathname;
  return withoutBase.replace(/\/+$/, "");
}

function sourcePathForGuide(slug: string) {
  const paths: Record<string, string> = {
    "": "docs/index.md",
    motivation: "docs/motivation.md",
    architecture: "docs/architecture.md",
    contracts: "docs/contracts.md",
    presentation: "docs/presentation-seam.md",
    generators: "docs/generators.md",
    source: "docs/source.md",
  };
  return paths[slug] ?? "docs/index.md";
}

const ANNOTATION_BREAK = "@media (min-width: 1100px)";
const OUTLINE_BREAK = "@media (min-width: 1240px)";

const styles = stylex.create({
  docsShell: { backgroundColor: colorVars["--color-background-body"] },
  topNavActions: {
    alignItems: "center",
    display: "flex",
    gap: spacingVars["--spacing-2"],
  },
  topSearch: {
    display: {
      default: "none",
      "@media (min-width: 1100px)": "block",
    },
    width: 260,
  },
  mobileSearch: {
    display: {
      default: "block",
      "@media (min-width: 1100px)": "none",
    },
    padding: spacingVars["--spacing-3"],
  },
  searchRoot: {
    minWidth: 0,
    position: "relative",
    width: "100%",
    zIndex: 60,
  },
  searchRootInline: { zIndex: 1 },
  searchResults: {
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-container"],
    borderStyle: "solid",
    borderWidth: borderVars["--border-width"],
    boxShadow: shadowVars["--shadow-high"],
    insetInlineEnd: 0,
    maxHeight: "min(520px, calc(100vh - 96px))",
    overflowY: "auto",
    position: "absolute",
    top: "calc(100% + 8px)",
    width: 390,
  },
  searchResultsInline: {
    boxShadow: "none",
    marginBlockStart: spacingVars["--spacing-2"],
    maxHeight: 420,
    position: "static",
    width: "100%",
  },
  searchList: { listStyle: "none", margin: 0, padding: 0 },
  searchItem: {
    borderBottomColor: colorVars["--color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: borderVars["--border-width"],
      ":last-child": 0,
    },
    display: "grid",
    gap: spacingVars["--spacing-1"],
    padding: spacingVars["--spacing-3"],
  },
  searchLink: { fontWeight: 600 },
  searchEmpty: { padding: spacingVars["--spacing-4"] },
  topNav: {
    backgroundColor: colorVars["--color-background-surface"],
    borderBottomColor: colorVars["--color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: borderVars["--border-width"],
    boxShadow: shadowVars["--shadow-low"],
  },
  sideNav: {
    backgroundColor: colorVars["--color-background-body"],
    borderInlineEndColor: colorVars["--color-border"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: borderVars["--border-width"],
  },
  boundaryNote: { margin: spacingVars["--spacing-3"] },
  guideLayout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [OUTLINE_BREAK]: "minmax(0, 1fr) 236px",
    },
    marginInline: "auto",
    maxWidth: 1220,
    minHeight: "calc(100vh - 64px)",
    width: "100%",
  },
  guideContent: {
    paddingInline: {
      default: spacingVars["--spacing-5"],
      "@media (min-width: 760px)": spacingVars["--spacing-10"],
    },
  },
  guideMeta: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-3"],
    marginBlockEnd: spacingVars["--spacing-5"],
  },
  outlineRail: {
    alignContent: "start",
    display: { default: "none", [OUTLINE_BREAK]: "grid" },
    gap: spacingVars["--spacing-4"],
    height: "calc(100vh - 64px)",
    overflowY: "auto",
    padding: spacingVars["--spacing-6"],
    position: "sticky",
    top: 64,
  },
  sourceIndex: {
    display: "grid",
    gap: spacingVars["--spacing-8"],
    marginBlockStart: spacingVars["--spacing-10"],
  },
  moduleList: { display: "grid", listStyle: "none", margin: 0, padding: 0 },
  moduleItem: {
    alignItems: "start",
    borderBottomColor: colorVars["--color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: borderVars["--border-width"],
    display: "grid",
    gap: spacingVars["--spacing-3"],
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 760px)": "minmax(220px, .7fr) minmax(0, 1fr)",
    },
    paddingBlock: spacingVars["--spacing-4"],
  },
  sourceLayout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [OUTLINE_BREAK]: "minmax(0, 1fr) 236px",
    },
    marginInline: "auto",
    maxWidth: 1640,
    width: "100%",
  },
  annotatedPage: {
    backgroundColor: colorVars["--color-background-surface"],
    minWidth: 0,
  },
  sourceHeader: { marginInline: "auto", maxWidth: 1400 },
  symbolList: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-2"],
  },
  symbolChip: {
    backgroundColor: {
      default: colorVars["--color-background-muted"],
      ":hover": colorVars["--color-overlay-hover"],
    },
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-full"],
    borderStyle: "solid",
    borderWidth: borderVars["--border-width"],
    color: colorVars["--color-text-primary"],
    fontFamily: "var(--font-family-code)",
    fontSize: 12,
    paddingBlock: 2,
    paddingInline: spacingVars["--spacing-3"],
    textDecorationLine: "none",
  },
  annotatedSections: {
    display: "grid",
    listStyle: "none",
    margin: "0 auto",
    maxWidth: 1400,
    padding: 0,
  },
  annotatedRow: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [ANNOTATION_BREAK]: "minmax(260px, 340px) minmax(0, 1fr)",
    },
    minWidth: 0,
  },
  annotationCell: {
    alignContent: "start",
    minHeight: spacingVars["--spacing-5"],
  },
  sourceCodeCell: {
    backgroundColor: "#1a2652",
    borderBottomColor: "rgba(255,255,255,.08)",
    borderBottomStyle: "solid",
    borderBottomWidth: borderVars["--border-width"],
    minWidth: 0,
  },
  codeLine: {
    backgroundColor: {
      default: "transparent",
      ":target": "rgba(255,255,255,.12)",
    },
    boxShadow: { default: "none", ":target": "inset 3px 0 #a9bbff" },
    display: "grid",
    gridTemplateColumns: "54px minmax(max-content, 1fr)",
    lineHeight: 1.65,
    minHeight: "1.65em",
    paddingInlineEnd: spacingVars["--spacing-6"],
    scrollMarginTop: 96,
  },
  lineNumber: {
    color: "#b9c7f5",
    paddingInlineEnd: spacingVars["--spacing-4"],
    textAlign: "end",
    textDecorationLine: "none",
    userSelect: "none",
  },
  codeText: { color: "#f4f6fb", whiteSpace: "pre" },
  sourceOutline: { backgroundColor: colorVars["--color-background-body"] },
  pageTurn: {
    borderTopColor: colorVars["--color-border"],
    borderTopStyle: "solid",
    borderTopWidth: borderVars["--border-width"],
    display: "flex",
    justifyContent: "space-between",
    margin: spacingVars["--spacing-8"],
    paddingBlockStart: spacingVars["--spacing-5"],
  },
});
