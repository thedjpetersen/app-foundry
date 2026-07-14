const PARAGRAPH_BREAK = "\0";
const DECLARATION_PATTERN =
  /^\s*export (?:declare )?(?:abstract )?(?:async )?(?:function|class|const|let|type|interface|enum) ([A-Za-z_$][\w$]*)/;

export type AnnotatedSection = {
  annotation: string[];
  code: string;
  startLine: number;
  sectionStartLine: number;
};

export type ExportedSymbol = { name: string; line: number };

export function parseAnnotatedSections(raw: string): AnnotatedSection[] {
  const lines = raw.replace(/\s+$/, "").split("\n");
  const sections: AnnotatedSection[] = [];
  let annotation: string[] = [];
  let code: string[] = [];
  let startLine = 1;
  let sectionStartLine = 1;
  let inBlockComment = false;

  const flush = () => {
    while (code.length > 0 && code.at(-1)?.trim() === "") {
      code.pop();
    }

    const paragraphs: string[] = [];

    for (const line of annotation) {
      if (line === "") continue;
      if (line === PARAGRAPH_BREAK) {
        paragraphs.push("");
        continue;
      }

      const last = paragraphs.length - 1;
      if (last >= 0 && paragraphs[last] !== "") {
        paragraphs[last] = `${paragraphs[last]} ${line}`;
      } else if (last >= 0) {
        paragraphs[last] = line;
      } else {
        paragraphs.push(line);
      }
    }

    if (paragraphs.some(Boolean) || code.length > 0) {
      sections.push({
        annotation: paragraphs.filter(Boolean),
        code: code.join("\n"),
        startLine,
        sectionStartLine,
      });
    }

    annotation = [];
    code = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (inBlockComment || isAnnotationLine(trimmed)) {
      if (code.length > 0) {
        flush();
        sectionStartLine = lineNumber;
      } else if (annotation.length === 0) {
        sectionStartLine = lineNumber;
      }

      const stripped = stripCommentMarkers(trimmed);
      annotation.push(stripped || PARAGRAPH_BREAK);

      if (inBlockComment) {
        if (trimmed.includes("*/")) inBlockComment = false;
      } else if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
        inBlockComment = true;
      }

      startLine = lineNumber + 1;
      return;
    }

    if (trimmed === "" && code.length === 0) {
      if (annotation.length > 0) annotation.push(PARAGRAPH_BREAK);
      startLine = lineNumber + 1;
      return;
    }

    if (code.length === 0) startLine = lineNumber;
    code.push(line);
  });

  flush();
  return splitLongSections(sections);
}

export function collectExportedSymbols(raw: string): ExportedSymbol[] {
  return raw.split("\n").flatMap((line, index) => {
    const match = line.match(DECLARATION_PATTERN);
    return match?.[1] ? [{ name: match[1], line: index + 1 }] : [];
  });
}

function isAnnotationLine(trimmed: string) {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("* ") ||
    trimmed === "*"
  );
}

function stripCommentMarkers(trimmed: string) {
  return trimmed
    .replace(/^\/\*\*?/, "")
    .replace(/^\*\/?/, "")
    .replace(/^\/\//, "")
    .replace(/\*\/$/, "")
    .trim();
}

function splitLongSections(sections: AnnotatedSection[]) {
  return sections.flatMap((section) => {
    const lines = section.code.split("\n");
    if (lines.length <= 90) return section;

    const chunks: AnnotatedSection[] = [];
    for (let index = 0; index < lines.length; index += 90) {
      chunks.push({
        annotation: index === 0 ? section.annotation : [],
        code: lines.slice(index, index + 90).join("\n"),
        startLine: section.startLine + index,
        sectionStartLine: section.sectionStartLine + index,
      });
    }
    return chunks;
  });
}
