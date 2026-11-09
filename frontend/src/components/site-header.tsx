import { Suspense } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { messages } from "@/messages/en";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <Link className="logo" href="/">
          <span className="logo-mark" aria-hidden="true" />
          {messages.logo}
        </Link>
        {/* The nav reads the URL's ?view=; until that is known, plain links still work. */}
        <Suspense fallback={<StaticNav />}>
          <SiteNav />
        </Suspense>
        <div className="header-tools">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function StaticNav() {
  return (
    <nav className="site-nav-static" aria-label={messages.navLabel}>
      <Link href="/">{messages.navAnalyze}</Link>
      <Link href="/learn">{messages.navLearn}</Link>
    </nav>
  );
}
