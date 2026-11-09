import type { Metadata } from "next";
import { messages } from "@/messages/en";

export const metadata: Metadata = {
  title: messages.a11yTitle,
};

export default function AccessibilityPage() {
  return (
    <article className="shell prose page-pad">
      <h1>{messages.a11yTitle}</h1>
      <p>
        Caissa is designed to align with WCAG 2.2 Level AA, the accessibility baseline of GIGW 3.0, and IS
        17802. This page is not a certification. No formal audit has been completed.
      </p>
      <h2>Last reviewed</h2>
      <p>7 November 2026.</p>
      <h2>Known limitations</h2>
      <ul>
        <li>
          Automated checks (axe) report no serious or critical issues on the landing page, player analysis, puzzles,
          lessons, and the Learn pages, in light and dark themes. Automated checks find only part of all barriers.
        </li>
        <li>A full manual pass with NVDA or VoiceOver, and a 200% zoom pass, have not been completed yet.</li>
        <li>
          The puzzle board does not list legal destination squares for a selected piece; it announces the selection
          and the result of each move.
        </li>
        <li>Board sounds have no captions of their own. Every result they signal is also shown as text.</li>
        <li>Color theme, sound setting, and the last player analyzed are saved in local storage on this device only.</li>
      </ul>
      <h2 id="report">Report a barrier</h2>
      <p>
        When the source repository is public, open an issue titled “Accessibility barrier” and describe the
        page, what you were trying to do, and the assistive tool you used. Until that repository exists, this
        statement is the record of the target and the gaps.
      </p>
    </article>
  );
}
