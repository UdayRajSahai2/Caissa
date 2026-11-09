import { applyUci } from "@/lib/chess-board";
import raw from "@/messages/learn-en.json";

/** The general Learn curriculum (LRN-01). Content lives in messages/learn-en.json; moves are checked by the backend suite (LRN-03). */
export type LearnStep = { uci: string; san: string; caption: string };
export type LearnDiagram = { fen: string; caption: string; steps: LearnStep[] };
export type LearnSection = { heading: string; paragraphs: string[]; diagram: LearnDiagram | null };
export type LearnLesson = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  level: string;
  minutes: number;
  sections: LearnSection[];
  takeaway: string;
};
export type LearnCategory = { id: string; title: string; blurb: string; lessons: LearnLesson[] };

export const CURRICULUM: readonly LearnCategory[] = readCurriculum(raw);

export function allLessons(): LearnLesson[] {
  return CURRICULUM.flatMap((category) => category.lessons);
}

export function findLesson(slug: string): LearnLesson | null {
  return allLessons().find((lesson) => lesson.slug === slug) ?? null;
}

/** The lessons before and after this one, in curriculum order, for "Previous" and "Next" links. */
export function neighbours(slug: string): { previous: LearnLesson | null; next: LearnLesson | null } {
  const lessons = allLessons();
  const index = lessons.findIndex((lesson) => lesson.slug === slug);
  return {
    previous: index > 0 ? (lessons[index - 1] ?? null) : null,
    next: index >= 0 ? (lessons[index + 1] ?? null) : null,
  };
}

/** Board positions for a diagram: the start, then the position after each step. */
export function diagramPositions(diagram: LearnDiagram): string[] {
  const positions = [diagram.fen];
  for (const step of diagram.steps) {
    positions.push(applyUci(positions[positions.length - 1] ?? diagram.fen, step.uci));
  }
  return positions;
}

/** Narrows the JSON at the boundary: a malformed lesson fails loudly at build time, not on screen. */
export function readCurriculum(value: unknown): LearnCategory[] {
  const data = record(value, "curriculum");
  const lessons = list(data.lessons, "lessons").map(readLesson);
  return list(data.categories, "categories").map((item) => {
    const category = record(item, "category");
    const id = text(category.id, "category.id");
    return {
      id,
      title: text(category.title, `${id}.title`),
      blurb: text(category.blurb, `${id}.blurb`),
      lessons: lessons.filter((lesson) => lesson.category === id),
    };
  });
}

function readLesson(value: unknown): LearnLesson {
  const lesson = record(value, "lesson");
  const slug = text(lesson.slug, "lesson.slug");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`lesson slug "${slug}" must be lowercase letters, digits, and hyphens`);
  }
  return {
    slug,
    category: text(lesson.category, `${slug}.category`),
    title: text(lesson.title, `${slug}.title`),
    summary: text(lesson.summary, `${slug}.summary`),
    level: text(lesson.level, `${slug}.level`),
    minutes: count(lesson.minutes, `${slug}.minutes`),
    takeaway: text(lesson.takeaway, `${slug}.takeaway`),
    sections: list(lesson.sections, `${slug}.sections`).map((item, index) => {
      const section = record(item, `${slug}.sections[${index}]`);
      return {
        heading: text(section.heading, `${slug}.heading`),
        paragraphs: list(section.paragraphs, `${slug}.paragraphs`).map((paragraph) => text(paragraph, `${slug}.paragraph`)),
        diagram: section.diagram === undefined ? null : readDiagram(section.diagram, slug),
      };
    }),
  };
}

function readDiagram(value: unknown, slug: string): LearnDiagram {
  const diagram = record(value, `${slug}.diagram`);
  return {
    fen: text(diagram.fen, `${slug}.fen`),
    caption: text(diagram.caption, `${slug}.caption`),
    steps: list(diagram.steps, `${slug}.steps`).map((item) => {
      const step = record(item, `${slug}.step`);
      return {
        uci: text(step.uci, `${slug}.uci`),
        san: text(step.san, `${slug}.san`),
        caption: text(step.caption, `${slug}.step.caption`),
      };
    }),
  };
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${where} must be a list`);
  }
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where} must be non-empty text`);
  }
  return value;
}

function count(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${where} must be a whole number`);
  }
  return value;
}
