// ==========================================================================
// Gosidian Markdown Parser & Live Rendering Engine (Obsidian Compatible)
// Enhanced with Pele SVG Diagrams, KaTeX LaTeX Mathematics & Footnotes
// ==========================================================================

import { render as renderPele } from "pele";
import katex from "katex";

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface NoteProperty {
  key: string;
  value: string;
  type: "text" | "tags" | "date" | "number" | "checkbox";
}

export interface MarkdownParseResult {
  html: string;
  headings: HeadingItem[];
  wikiLinks: string[];
  tags: string[];
  properties: NoteProperty[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPropIcon(type: NoteProperty["type"]): string {
  switch (type) {
    case "tags":
      return "tag";
    case "date":
      return "calendar";
    case "number":
      return "hash";
    case "checkbox":
      return "check-square";
    default:
      return "file-text";
  }
}

/**
 * Parses markdown into Obsidian-compatible HTML, extracting metadata, frontmatter, and headings.
 */
export function parseMarkdown(content: string, knownNotes: Set<string> = new Set()): MarkdownParseResult {
  const headings: HeadingItem[] = [];
  const wikiLinksSet = new Set<string>();
  const tagsSet = new Set<string>();
  const properties: NoteProperty[] = [];
  const footnotes: { id: string; text: string }[] = [];

  const lines = content.split("\n");
  const output: string[] = [];

  let inFrontmatter = false;
  let frontmatterLines: string[] = [];
  let startIndex = 0;

  // 1. Check for YAML Frontmatter (Obsidian Properties)
  if (lines.length > 0 && lines[0]?.trim() === "---") {
    inFrontmatter = true;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        startIndex = i + 1;
        inFrontmatter = false;
        break;
      }
      frontmatterLines.push(lines[i]!);
    }
  }

  // Parse properties
  if (frontmatterLines.length > 0) {
    frontmatterLines.forEach((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const rawVal = line.slice(colonIdx + 1).trim();
        if (key) {
          let propType: NoteProperty["type"] = "text";
          if (key.toLowerCase() === "tags") propType = "tags";
          else if (key.toLowerCase().includes("date")) propType = "date";
          else if (/^\d+$/.test(rawVal)) propType = "number";
          else if (rawVal === "true" || rawVal === "false") propType = "checkbox";

          properties.push({ key, value: rawVal, type: propType });

          if (propType === "tags") {
            const tagMatches = rawVal.match(/[a-zA-Z0-9_-]+/g);
            tagMatches?.forEach((t) => tagsSet.add(t.toLowerCase()));
          }
        }
      }
    });

    // Render Obsidian Properties Table Banner
    let propsHtml = `
      <div class="properties-table">
        <div class="props-header">
          <span class="props-title">Properties</span>
          <button class="icon-btn props-collapse-btn" id="togglePropertiesBtn"><i data-lucide="chevron-down" class="icon-xs"></i></button>
        </div>
        <div class="props-body">
    `;

    properties.forEach((prop) => {
      let valHtml = "";
      if (prop.type === "tags") {
        const tagList = prop.value.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
        valHtml = `<div class="prop-tags-cell">` + tagList.map((t) => `<span class="tag-pill" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join("") + `</div>`;
      } else {
        valHtml = `<span class="prop-val-text">${escapeHtml(prop.value)}</span>`;
      }

      propsHtml += `
        <div class="prop-row">
          <div class="prop-key"><i data-lucide="${getPropIcon(prop.type)}" class="icon-xs"></i> <span>${escapeHtml(prop.key)}</span></div>
          <div class="prop-val">${valHtml}</div>
        </div>
      `;
    });

    propsHtml += `</div></div>`;
    output.push(propsHtml);
  }

  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let inMathBlock = false;
  let mathBlockLines: string[] = [];

  let inTable = false;
  let tableRows: string[][] = [];

  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  let inList = false;

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) return;
    let tableHtml = "<table>";
    const hasHeader = tableRows.length > 1 && tableRows[1]?.every((cell) => /^:?-+:?$/.test(cell.trim()));

    if (hasHeader && tableRows[0]) {
      tableHtml += "<thead><tr>";
      tableRows[0].forEach((cell) => {
        tableHtml += `<th>${renderInline(cell.trim())}</th>`;
      });
      tableHtml += "</tr></thead>";
    }

    tableHtml += "<tbody>";
    const dataRows = hasHeader ? tableRows.slice(2) : tableRows;
    dataRows.forEach((row) => {
      tableHtml += "<tr>";
      row.forEach((cell) => {
        tableHtml += `<td>${renderInline(cell.trim())}</td>`;
      });
      tableHtml += "</tr>";
    });
    tableHtml += "</tbody></table>";

    output.push(tableHtml);
    inTable = false;
    tableRows = [];
  };

  const flushBlockquote = () => {
    if (!inBlockquote || blockquoteLines.length === 0) return;
    const firstLine = blockquoteLines[0] || "";
    const calloutMatch = firstLine.match(/^>\s*\[!([a-zA-Z0-9_-]+)\](?:[+-])?(?:\s+(.*))?$/);

    if (calloutMatch) {
      const type = (calloutMatch[1] || "note").toLowerCase();
      const customTitle = calloutMatch[2]?.trim() || type.toUpperCase();
      const bodyLines = blockquoteLines.slice(1).map((l) => l.replace(/^>\s?/, ""));
      const bodyHtml = bodyLines.map((l) => `<p>${renderInline(l)}</p>`).join("");

      output.push(`
        <div class="callout callout-${escapeHtml(type)}">
          <div class="callout-title">
            <span class="callout-icon"></span>
            <span class="callout-title-text">${escapeHtml(customTitle)}</span>
          </div>
          <div class="callout-body">${bodyHtml}</div>
        </div>
      `);
    } else {
      const bodyLines = blockquoteLines.map((l) => l.replace(/^>\s?/, ""));
      const bodyHtml = bodyLines.map((l) => `<p>${renderInline(l)}</p>`).join("");
      output.push(`<blockquote>${bodyHtml}</blockquote>`);
    }

    inBlockquote = false;
    blockquoteLines = [];
  };

  const flushList = () => {
    if (inList) {
      output.push("</ul>");
      inList = false;
    }
  };

  function renderInline(text: string): string {
    // 0. Transclusion Embed ![[Note Name]] or Image ![[image.jpg]]
    let parsed = text.replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, targetNote, alias) => {
      const cleanTarget = targetNote.trim();
      if (/\.(png|jpe?g|svg|webp|gif)$/i.test(cleanTarget)) {
        const src = cleanTarget.startsWith("/") ? cleanTarget : `/assets/${cleanTarget}`;
        return `<div class="image-wrapper"><img src="${escapeHtml(src)}" alt="${escapeHtml(alias || cleanTarget)}" class="md-image" loading="lazy" /></div>`;
      }
      wikiLinksSet.add(cleanTarget);
      return `<div class="internal-embed" data-embed="${escapeHtml(cleanTarget)}"><div class="embed-header"><i data-lucide="file-text" class="icon-xs"></i> <span>${escapeHtml(cleanTarget)}</span></div><div class="embed-content" data-embed-target="${escapeHtml(cleanTarget)}"><span class="embed-hint">Linked note embed</span></div></div>`;
    });

    // 1. WikiLinks [[Note Name]] or [[Note Name|Alias]]
    parsed = parsed.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, targetNote, alias) => {
      const cleanTarget = targetNote.trim();
      wikiLinksSet.add(cleanTarget);
      const label = alias ? alias.trim() : cleanTarget;
      const isKnown = knownNotes.size === 0 || knownNotes.has(cleanTarget.toLowerCase());
      const phantomClass = isKnown ? "" : " phantom unresolved is-unresolved";
      return `<span class="wikilink${phantomClass}" data-target="${escapeHtml(cleanTarget)}" title="Jump to [[${escapeHtml(cleanTarget)}]]">${escapeHtml(label)}</span>`;
    });

    // 2. Tags #tag
    parsed = parsed.replace(/(^|\s)#([a-zA-Z0-9_-]+)/g, (_, prefix, tag) => {
      tagsSet.add(tag.toLowerCase());
      return `${prefix}<span class="tag-pill" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>`;
    });

    // 3. LaTeX Inline Math $equation$
    parsed = parsed.replace(/\$([^$\n]+)\$/g, (_, mathExpr) => {
      try {
        return katex.renderToString(mathExpr.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `<span class="math-inline">${escapeHtml(mathExpr)}</span>`;
      }
    });

    // 4. Footnote References [^1]
    parsed = parsed.replace(/\[\^([a-zA-Z0-9_-]+)\]/g, (_, fnId) => {
      return `<sup class="footnote-ref"><a href="#fn-${escapeHtml(fnId)}" id="fnref-${escapeHtml(fnId)}">[${escapeHtml(fnId)}]</a></sup>`;
    });

    // 5. Highlights ==highlight==
    parsed = parsed.replace(/==([^=]+)==/g, '<mark class="md-highlight">$1</mark>');

    // 6. Bold & Italic
    parsed = parsed.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    parsed = parsed.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    parsed = parsed.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    // 7. Inline code `code`
    parsed = parsed.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 7.5 Images ![alt](url)
    parsed = parsed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="image-wrapper"><img src="$2" alt="$1" class="md-image" loading="lazy" /></div>');

    // 8. External Links [text](url)
    parsed = parsed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    return parsed;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i]!;

    // Block Math $$ ... $$
    if (rawLine.trim().startsWith("$$")) {
      flushList();
      flushTable();
      flushBlockquote();

      if (!inMathBlock) {
        if (rawLine.trim().endsWith("$$") && rawLine.trim().length > 2) {
          // Single-line block math
          const mathCode = rawLine.trim().slice(2, -2).trim();
          try {
            const renderedMath = katex.renderToString(mathCode, { displayMode: true, throwOnError: false });
            output.push(`<div class="math-block">${renderedMath}</div>`);
          } catch {
            output.push(`<div class="math-block"><code>${escapeHtml(mathCode)}</code></div>`);
          }
          continue;
        }
        inMathBlock = true;
        mathBlockLines = [];
        continue;
      } else {
        inMathBlock = false;
        const mathCode = mathBlockLines.join("\n");
        try {
          const renderedMath = katex.renderToString(mathCode, { displayMode: true, throwOnError: false });
          output.push(`<div class="math-block">${renderedMath}</div>`);
        } catch {
          output.push(`<div class="math-block"><code>${escapeHtml(mathCode)}</code></div>`);
        }
        continue;
      }
    }

    if (inMathBlock) {
      mathBlockLines.push(rawLine);
      continue;
    }

    // Code Blocks (including Pele / Mermaid diagrams)
    if (rawLine.trim().startsWith("```")) {
      flushList();
      flushTable();
      flushBlockquote();

      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = rawLine.trim().replace(/^```/, "").trim();
        codeBlockLines = [];
      } else {
        inCodeBlock = false;
        const rawCode = codeBlockLines.join("\n");
        const lowerLang = codeBlockLang.toLowerCase();

        // Render with Pele (Obsidian's ultra-fast diagram renderer)
        if (lowerLang === "pele" || lowerLang === "mermaid") {
          try {
            const rendered = renderPele(rawCode);
            output.push(`
              <div class="pele-diagram-container">
                ${rendered.svg}
              </div>
            `);
          } catch (err: any) {
            output.push(`
              <div class="callout callout-warning">
                <div class="callout-title">
                  <span class="callout-title-text">Pele Diagram Error</span>
                </div>
                <div class="callout-body"><p>${escapeHtml(err?.message || "Invalid diagram syntax")}</p></div>
              </div>
            `);
          }
          continue;
        }

        const codeContent = escapeHtml(rawCode);
        const langDisplay = codeBlockLang ? escapeHtml(codeBlockLang) : "text";
        output.push(`
          <div class="code-block-wrapper">
            <div class="code-header">
              <span>${langDisplay}</span>
              <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('code').textContent)">Copy</button>
            </div>
            <pre><code>${codeContent}</code></pre>
          </div>
        `);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Footnote definitions [^1]: Note text
    const fnDefMatch = rawLine.match(/^\[\^([a-zA-Z0-9_-]+)\]:\s*(.*)$/);
    if (fnDefMatch) {
      flushList();
      flushTable();
      flushBlockquote();
      footnotes.push({
        id: fnDefMatch[1]!,
        text: fnDefMatch[2]!.trim(),
      });
      continue;
    }

    // Tables
    if (rawLine.trim().startsWith("|") && rawLine.trim().endsWith("|")) {
      flushList();
      flushBlockquote();
      inTable = true;
      const cells = rawLine
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Blockquotes & Callouts
    if (rawLine.startsWith(">")) {
      flushList();
      flushTable();
      inBlockquote = true;
      blockquoteLines.push(rawLine);
      continue;
    } else {
      flushBlockquote();
    }

    // Task Checklist items
    const taskMatch = rawLine.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      flushTable();
      flushBlockquote();
      if (!inList) {
        output.push('<ul class="task-list">');
        inList = true;
      }
      const isChecked = taskMatch[2]!.toLowerCase() === "x";
      const taskText = renderInline(taskMatch[3]!);
      output.push(`
        <li class="task-list-item ${isChecked ? "is-checked" : ""}">
          <input type="checkbox" class="task-checkbox" ${isChecked ? "checked" : ""} data-line-index="${i}" />
          <span>${taskText}</span>
        </li>
      `);
      continue;
    }

    // Unordered list items
    const listMatch = rawLine.match(/^(\s*)[-*+]\s+(.*)$/);
    if (listMatch) {
      flushTable();
      flushBlockquote();
      if (!inList) {
        output.push('<ul class="regular-list">');
        inList = true;
      }
      output.push(`<li>${renderInline(listMatch[2]!)}</li>`);
      continue;
    }

    // End of lists
    flushList();

    // Headings # ... ######
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const title = headingMatch[2]!.trim();
      const slug = slugify(title);
      headings.push({ id: slug, text: title, level });
      output.push(`<h${level} id="${slug}">${renderInline(title)}</h${level}>`);
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(rawLine.trim())) {
      output.push("<hr />");
      continue;
    }

    // Empty lines
    if (rawLine.trim() === "") {
      continue;
    }

    // Regular paragraph
    output.push(`<p>${renderInline(rawLine)}</p>`);
  }

  // Final flush
  flushList();
  flushTable();
  flushBlockquote();

  // Append Footnotes section if present
  if (footnotes.length > 0) {
    let fnHtml = '<div class="footnotes-section"><hr /><ol class="footnotes-list">';
    footnotes.forEach((fn) => {
      fnHtml += `<li id="fn-${escapeHtml(fn.id)}">${renderInline(fn.text)} <a href="#fnref-${escapeHtml(fn.id)}" class="footnote-backref">↩</a></li>`;
    });
    fnHtml += "</ol></div>";
    output.push(fnHtml);
  }

  return {
    html: output.join("\n"),
    headings,
    wikiLinks: Array.from(wikiLinksSet),
    tags: Array.from(tagsSet),
    properties,
  };
}
