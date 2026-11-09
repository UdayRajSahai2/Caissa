"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/offline";

/** PWA-02: registers the offline worker once the page has loaded. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
