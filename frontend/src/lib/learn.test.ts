import { describe, expect, it } from "vitest";
import { allLessons, CURRICULUM, diagramPositions, findLesson, neighbours, readCurriculum } from "@/lib/learn";

describe("learn curriculum", () => {
  it("has fifteen lessons across five topics, each with text and at least one board", () => {
    expect(CURRICULUM.map((category) => category.id)).toEqual(["openings", "tactics", "checkmates", "strategy", "endgames"]);
    expect(allLessons()).toHaveLength(15);
    for (const lesson of allLessons()) {
      expect(lesson.sections.length).toBeGreaterThan(0);
      expect(lesson.sections.some((section) => section.diagram !== null)).toBe(true);
    }
  });

  it("finds lessons and their neighbours in curriculum order", () => {
    expect(findLesson("forks")?.title).toBe("Forks: one move, two targets");
    expect(findLesson("nope")).toBeNull();
    expect(neighbours("opening-principles").previous).toBeNull();
    expect(neighbours("opening-principles").next?.slug).toBe("early-queen");
    expect(neighbours("rook-behind-passed-pawn").next).toBeNull();
  });

  it("plays a diagram's moves to the final position", () => {
    const mate = findLesson("back-rank-mate")?.sections[0]?.diagram;
    expect(mate).toBeTruthy();
    const positions = mate ? diagramPositions(mate) : [];
    expect(positions).toHaveLength(2);
    expect(positions[1]?.split(" ")[0]).toBe("3R2k1/5ppp/8/8/8/8/5PPP/6K1");
  });

  it("rejects malformed lesson data loudly instead of rendering it", () => {
    expect(() => readCurriculum({ categories: [], lessons: [{ slug: "Bad Slug" }] })).toThrow(/lowercase/);
    expect(() =>
      readCurriculum({
        categories: [{ id: "a", title: "A", blurb: "b" }],
        lessons: [{ slug: "x", category: "a", title: "", summary: "s", level: "l", minutes: 3, takeaway: "t", sections: [] }],
      }),
    ).toThrow(/x.title/);
    expect(() => readCurriculum(null)).toThrow(/curriculum/);
  });
});
