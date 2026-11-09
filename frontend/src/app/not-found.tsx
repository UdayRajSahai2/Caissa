import type { Metadata } from "next";
import Link from "next/link";
import { messages } from "@/messages/en";

export const metadata: Metadata = { title: messages.notFoundTitle };

/** Never echoes the address that was asked for (backend rules: no raw invalid input). */
export default function NotFound() {
  return (
    <article className="shell prose page-pad">
      <h1>{messages.notFoundTitle}</h1>
      <p>{messages.notFoundBody}</p>
      <p>
        <Link href="/">{messages.notFoundHome}</Link>
      </p>
    </article>
  );
}
