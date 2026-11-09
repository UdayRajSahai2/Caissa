import type { ExportLine } from "@/lib/weakness-copy";

/** Colors and fonts read from the design tokens, so the image matches the theme on screen (C-10). */
export type ImageTheme = {
  bg: string;
  text: string;
  text2: string;
  accent: string;
  primary: string;
  header: string;
  onHeader: string;
  display: string;
  body: string;
};

const WIDTH = 1200;
const PAD = 64;
const SCALE = 2;
const RULE = 6;

const STYLE: Record<ExportLine["kind"], { font: (theme: ImageTheme) => string; size: number; before: number }> = {
  title: { font: (theme) => `700 44px ${theme.display}`, size: 44, before: 0 },
  subtitle: { font: (theme) => `400 22px ${theme.body}`, size: 22, before: 12 },
  section: { font: (theme) => `700 31px ${theme.display}`, size: 31, before: 48 },
  headline: { font: (theme) => `700 24px ${theme.body}`, size: 24, before: 28 },
  figure: { font: (theme) => `700 24px ${theme.body}`, size: 24, before: 6 },
  body: { font: (theme) => `400 21px ${theme.body}`, size: 21, before: 8 },
  meta: { font: (theme) => `400 18px ${theme.body}`, size: 18, before: 48 },
};

export function readImageTheme(element: Element): ImageTheme {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: token("--bg"),
    text: token("--text"),
    text2: token("--text-2"),
    accent: token("--accent"),
    primary: token("--primary"),
    header: token("--header-bg"),
    onHeader: token("--on-header"),
    display: token("--font-display"),
    body: token("--font-body"),
  };
}

/** Draws the report and resolves to a PNG blob, or null when the browser has no canvas support. */
export async function reportImage(lines: readonly ExportLine[], theme: ImageTheme): Promise<Blob | null> {
  if ("fonts" in document) {
    await document.fonts.ready;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  const height = paint(context, lines, theme, false);
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  context.scale(SCALE, SCALE);
  paint(context, lines, theme, true);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Lays out every line. With draw false it only measures, so the canvas can be sized before drawing. */
function paint(context: CanvasRenderingContext2D, lines: readonly ExportLine[], theme: ImageTheme, draw: boolean): number {
  const header = lines.filter((line) => line.kind === "title" || line.kind === "subtitle");
  const rest = lines.filter((line) => line.kind !== "title" && line.kind !== "subtitle");
  const bandHeight = PAD + measure(context, header, theme) + PAD;
  const total = bandHeight + RULE + PAD + measure(context, rest, theme) + PAD;
  if (!draw) {
    return total;
  }
  context.fillStyle = theme.bg;
  context.fillRect(0, 0, WIDTH, total);
  context.fillStyle = theme.header;
  context.fillRect(0, 0, WIDTH, bandHeight);
  context.fillStyle = theme.accent;
  context.fillRect(0, bandHeight, WIDTH, RULE);
  write(context, header, theme, PAD, () => theme.onHeader);
  write(context, rest, theme, bandHeight + RULE + PAD, (kind) => colorFor(kind, theme));
  return total;
}

function measure(context: CanvasRenderingContext2D, lines: readonly ExportLine[], theme: ImageTheme): number {
  let height = 0;
  lines.forEach((line, index) => {
    const style = STYLE[line.kind];
    context.font = style.font(theme);
    height += (index === 0 ? 0 : style.before) + wrap(context, line.text).length * lineHeight(style.size);
  });
  return height;
}

function write(
  context: CanvasRenderingContext2D,
  lines: readonly ExportLine[],
  theme: ImageTheme,
  top: number,
  color: (kind: ExportLine["kind"]) => string,
): void {
  let y = top;
  context.textBaseline = "top";
  lines.forEach((line, index) => {
    const style = STYLE[line.kind];
    context.font = style.font(theme);
    context.fillStyle = color(line.kind);
    y += index === 0 ? 0 : style.before;
    for (const row of wrap(context, line.text)) {
      context.fillText(row, PAD, y);
      y += lineHeight(style.size);
    }
  });
}

function colorFor(kind: ExportLine["kind"], theme: ImageTheme): string {
  if (kind === "section") {
    return theme.accent;
  }
  if (kind === "figure") {
    return theme.primary;
  }
  if (kind === "meta") {
    return theme.text2;
  }
  return theme.text;
}

function lineHeight(size: number): number {
  return Math.round(size * 1.45);
}

function wrap(context: CanvasRenderingContext2D, text: string): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = row ? `${row} ${word}` : word;
    if (row && context.measureText(next).width > WIDTH - PAD * 2) {
      rows.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  rows.push(row);
  return rows;
}
