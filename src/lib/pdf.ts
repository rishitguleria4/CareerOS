import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Converts ASCII-incompatible characters and LaTeX escapes to clean WinAnsi text for 100% ATS text extraction. */
function cleanLatexInline(raw: string): string {
  return raw
    .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, "$2")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\(?:emph|textit|scshape|Huge|Large|large|small)\b\s*/g, "")
    .replace(/\\(?:emph|textit)\{([^}]*)\}/g, "$1")
    .replace(/\$\|\$/g, " | ")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^")
    .replace(/\\\\/g, "")
    .replace(/\\vspace\{[^}]*\}/g, "")
    .replace(/[{}]/g, "")
    .replace(/[•·]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts balanced brace arguments from a LaTeX macro invocation, e.g. \cmd{arg1}{arg2} */
function extractBraceArgs(str: string, startIdx: number, count: number): string[] {
  const args: string[] = [];
  let i = startIdx;
  while (i < str.length && args.length < count) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (str[i] !== "{") break;
    let depth = 0;
    let buf = "";
    for (; i < str.length; i++) {
      if (str[i] === "{" && str[i - 1] !== "\\") {
        if (depth > 0) buf += str[i];
        depth++;
      } else if (str[i] === "}" && str[i - 1] !== "\\") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        buf += str[i];
      } else {
        buf += str[i];
      }
    }
    args.push(buf);
  }
  return args;
}

function wrapTextByWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Compiles a tailored LaTeX (.tex) resume (Jake's Resume single-column ATS template)
 * into a 100% ATS-parseable PDF with Times/Helvetica typography, horizontal section rules,
 * right-aligned links/dates, and clean bullet hierarchies.
 */
export async function generateResumePdf(source: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const PAGE_W = 612; // Letter width (8.5in * 72)
  const PAGE_H = 792; // Letter height (11in * 72)
  const MARGIN_X = 36; // 0.5in margin (Jake's Resume standard)
  const MARGIN_TOP = 36;
  const MARGIN_BOTTOM = 36;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const ensureSpace = (need: number) => {
    if (y - need < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  };

  // Detect whether input is LaTeX (.tex) or legacy Markdown
  const isLatex = source.includes("\\documentclass") || source.includes("\\section{");

  if (!isLatex) {
    // Fallback for any older markdown records
    for (const raw of source.split("\n")) {
      const line = cleanLatexInline(raw);
      if (!line) {
        y -= 5;
        continue;
      }
      const wrapped = wrapTextByWidth(line, regular, 10, CONTENT_W);
      for (const part of wrapped) {
        ensureSpace(14);
        page.drawText(part, { x: MARGIN_X, y, size: 10, font: regular, color: rgb(0.08, 0.08, 0.1) });
        y -= 13;
      }
    }
    return doc.save();
  }

  // Extract body between \begin{document} and \end{document}
  const beginIdx = source.indexOf("\\begin{document}");
  const endIdx = source.lastIndexOf("\\end{document}");
  const body =
    beginIdx !== -1
      ? source.slice(beginIdx + "\\begin{document}".length, endIdx !== -1 ? endIdx : undefined)
      : source;

  // 1. Parse and render \begin{center} ... \end{center} header
  const centerMatch = body.match(/\\begin\{center\}([\s\S]*?)\\end\{center\}/);
  if (centerMatch) {
    const centerLines = centerMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("%"));

    if (centerLines[0]) {
      const nameText = cleanLatexInline(centerLines[0]).toUpperCase();
      const nameW = bold.widthOfTextAtSize(nameText, 20);
      page.drawText(nameText, {
        x: Math.max(MARGIN_X, (PAGE_W - nameW) / 2),
        y,
        size: 20,
        font: bold,
        color: rgb(0.05, 0.05, 0.07),
      });
      y -= 16;
    }

    for (let i = 1; i < centerLines.length; i++) {
      const subText = cleanLatexInline(centerLines[i]);
      if (!subText) continue;
      const f = i === 1 ? bold : regular;
      const sz = i === 1 ? 10.5 : 9.5;
      const wrapped = wrapTextByWidth(subText, f, sz, CONTENT_W);
      for (const part of wrapped) {
        const w = f.widthOfTextAtSize(part, sz);
        page.drawText(part, {
          x: Math.max(MARGIN_X, (PAGE_W - w) / 2),
          y,
          size: sz,
          font: f,
          color: rgb(0.12, 0.12, 0.15),
        });
        y -= 13;
      }
    }
    y -= 4;
  }

  // Remove the center block and process line by line
  const restBody = body.replace(/\\begin\{center\}[\s\S]*?\\end\{center\}/, "");
  const lines = restBody.split("\n");

  for (let rawLine of lines) {
    const trimmed = rawLine.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%") ||
      trimmed.startsWith("\\resumeSubHeadingList") ||
      trimmed.startsWith("\\resumeItemList") ||
      trimmed.startsWith("\\begin{itemize}") ||
      trimmed.startsWith("\\end{itemize}") ||
      trimmed === "\\small{\\item{" ||
      trimmed === "}}"
    ) {
      continue;
    }

    // \section{...}
    const secMatch = trimmed.match(/^\\section\{([^}]*)\}/);
    if (secMatch) {
      ensureSpace(26);
      y -= 5;
      const secTitle = cleanLatexInline(secMatch[1]).toUpperCase();
      page.drawText(secTitle, {
        x: MARGIN_X,
        y,
        size: 11,
        font: bold,
        color: rgb(0.05, 0.05, 0.08),
      });
      y -= 3.5;
      page.drawLine({
        start: { x: MARGIN_X, y },
        end: { x: PAGE_W - MARGIN_X, y },
        thickness: 0.65,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= 12;
      continue;
    }

    // \resumeProjectHeading{left}{right}
    if (trimmed.startsWith("\\resumeProjectHeading")) {
      const args = extractBraceArgs(trimmed, "\\resumeProjectHeading".length, 2);
      const leftRaw = args[0] ?? "";
      const rightText = cleanLatexInline(args[1] ?? "");

      ensureSpace(16);
      // Split left into project title and italic tech stack if separated by $|$
      const parts = leftRaw.split(/\$\|\$/);
      const projTitle = cleanLatexInline(parts[0] ?? "");
      const projTech = cleanLatexInline(parts.slice(1).join(" | "));

      page.drawText(projTitle, {
        x: MARGIN_X,
        y,
        size: 10.2,
        font: bold,
        color: rgb(0.05, 0.05, 0.08),
      });

      if (projTech) {
        const titleW = bold.widthOfTextAtSize(projTitle + "  |  ", 10.2);
        page.drawText("|  " + projTech, {
          x: MARGIN_X + titleW - bold.widthOfTextAtSize("|  ", 10.2),
          y,
          size: 9.6,
          font: italic,
          color: rgb(0.2, 0.2, 0.24),
        });
      }

      if (rightText) {
        const rw = regular.widthOfTextAtSize(rightText, 9.5);
        page.drawText(rightText, {
          x: PAGE_W - MARGIN_X - rw,
          y,
          size: 9.5,
          font: regular,
          color: rgb(0.2, 0.2, 0.26),
        });
      }
      y -= 13;
      continue;
    }

    // \resumeSubheading{title}{date}{subtitle}{location}
    if (trimmed.startsWith("\\resumeSubheading")) {
      const args = extractBraceArgs(trimmed, "\\resumeSubheading".length, 4);
      const title = cleanLatexInline(args[0] ?? "");
      const date = cleanLatexInline(args[1] ?? "");
      const subtitle = cleanLatexInline(args[2] ?? "");
      const loc = cleanLatexInline(args[3] ?? "");

      ensureSpace(subtitle || loc ? 26 : 15);
      page.drawText(title, {
        x: MARGIN_X,
        y,
        size: 10.2,
        font: bold,
        color: rgb(0.05, 0.05, 0.08),
      });
      if (date) {
        const dw = regular.widthOfTextAtSize(date, 9.5);
        page.drawText(date, { x: PAGE_W - MARGIN_X - dw, y, size: 9.5, font: regular });
      }
      y -= 12.5;
      if (subtitle || loc) {
        if (subtitle) {
          page.drawText(subtitle, { x: MARGIN_X, y, size: 9.5, font: italic, color: rgb(0.2, 0.2, 0.24) });
        }
        if (loc) {
          const lw = italic.widthOfTextAtSize(loc, 9.5);
          page.drawText(loc, { x: PAGE_W - MARGIN_X - lw, y, size: 9.5, font: italic });
        }
        y -= 12.5;
      }
      continue;
    }

    // \resumeItem{...}
    if (trimmed.startsWith("\\resumeItem")) {
      const args = extractBraceArgs(trimmed, "\\resumeItem".length, 1);
      const itemText = cleanLatexInline(args[0] ?? trimmed);
      if (!itemText) continue;
      const wrapped = wrapTextByWidth(itemText, regular, 9.8, CONTENT_W - 14);
      for (let i = 0; i < wrapped.length; i++) {
        ensureSpace(13);
        if (i === 0) {
          page.drawText("-", { x: MARGIN_X + 4, y, size: 9.8, font: bold, color: rgb(0.1, 0.1, 0.12) });
        }
        page.drawText(wrapped[i], {
          x: MARGIN_X + 13,
          y,
          size: 9.8,
          font: regular,
          color: rgb(0.1, 0.1, 0.13),
        });
        y -= 12.5;
      }
      continue;
    }

    // Skills row: \textbf{Category}{: skill1, skill2}
    const skillCatMatch = trimmed.match(/^\\textbf\{([^}]*)\}\{:?\s*([\s\S]*)/);
    if (skillCatMatch) {
      const catLabel = cleanLatexInline(skillCatMatch[1]) + ": ";
      const catValues = cleanLatexInline(skillCatMatch[2]);
      const catW = bold.widthOfTextAtSize(catLabel, 9.8);
      const wrapped = wrapTextByWidth(catValues, regular, 9.8, CONTENT_W - catW);
      for (let i = 0; i < wrapped.length; i++) {
        ensureSpace(13);
        if (i === 0) {
          page.drawText(catLabel, { x: MARGIN_X, y, size: 9.8, font: bold, color: rgb(0.06, 0.06, 0.09) });
          page.drawText(wrapped[i], { x: MARGIN_X + catW, y, size: 9.8, font: regular, color: rgb(0.1, 0.1, 0.13) });
        } else {
          page.drawText(wrapped[i], { x: MARGIN_X + 12, y, size: 9.8, font: regular, color: rgb(0.1, 0.1, 0.13) });
        }
        y -= 12.8;
      }
      continue;
    }

    // Fallback plain LaTeX line
    const fallback = cleanLatexInline(trimmed);
    if (fallback) {
      const wrapped = wrapTextByWidth(fallback, regular, 9.8, CONTENT_W);
      for (const part of wrapped) {
        ensureSpace(13);
        page.drawText(part, { x: MARGIN_X, y, size: 9.8, font: regular, color: rgb(0.1, 0.1, 0.13) });
        y -= 12.5;
      }
    }
  }

  return doc.save();
}
