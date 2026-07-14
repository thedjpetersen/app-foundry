const PARAGRAPH_BREAK = "\0";
const DECLARATION_PATTERN =
  /^export (?:declare )?(?:abstract )?(?:async )?(?:function|class|const|let|type|interface|enum) ([A-Za-z_$][\w$]*)/;

export function parseAnnotatedSections(raw) {
  const lines = raw.replace(/\s+$/, "").split("\n");
  const sections = [];
  let annotation = [];
  let code = [];
  let startLine = 1;
  let sectionStartLine = 1;
  let inBlockComment = false;

  const flush = () => {
    while (code.length > 0 && code.at(-1).trim() === "") {
      code.pop();
    }

    const paragraphs = [];

    for (const line of annotation) {
      if (line === "") {
        continue;
      }

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

    const merged = paragraphs.filter(Boolean);

    if (merged.length > 0 || code.length > 0) {
      sections.push({
        annotation: merged,
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

      if (stripped) {
        annotation.push(stripped);
      } else if (annotation.length > 0) {
        annotation.push(PARAGRAPH_BREAK);
      }

      if (inBlockComment) {
        if (trimmed.includes("*/")) {
          inBlockComment = false;
        }
      } else if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
        inBlockComment = true;
      }

      startLine = lineNumber + 1;
      return;
    }

    if (trimmed === "" && code.length === 0) {
      if (annotation.length > 0) {
        annotation.push(PARAGRAPH_BREAK);
      }

      startLine = lineNumber + 1;
      return;
    }

    if (code.length === 0) {
      startLine = lineNumber;
    }

    code.push(line);
  });

  flush();
  return splitLongSections(sections);
}

export function collectExportedSymbols(raw) {
  return raw
    .split("\n")
    .map((line, index) => {
      const match = line.match(DECLARATION_PATTERN);
      return match ? { name: match[1], line: index + 1 } : undefined;
    })
    .filter(Boolean);
}

function isAnnotationLine(trimmed) {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("* ") ||
    trimmed === "*"
  );
}

function stripCommentMarkers(trimmed) {
  return trimmed
    .replace(/^\/\*\*?/, "")
    .replace(/^\*\/?/, "")
    .replace(/^\/\//, "")
    .replace(/\*\/$/, "")
    .trim();
}

function splitLongSections(sections) {
  return sections.flatMap((section) => {
    const lines = section.code.split("\n");

    if (lines.length <= 90) {
      return section;
    }

    const chunks = [];

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
