import Link from "next/link";
import { messages } from "@/messages/en";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <div className="footer-copy">
          <p>{messages.githubPending}</p>
          <p>
            {messages.pieceCredit}{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="license noreferrer">
              CC BY-NC-SA 4.0
            </a>
            .
          </p>
        </div>
        <nav className="footer-links" aria-label="About">
          <Link href="/accessibility">{messages.footerA11y}</Link>
          <Link href="/privacy">{messages.footerPrivacy}</Link>
        </nav>
      </div>
    </footer>
  );
}
