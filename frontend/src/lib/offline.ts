/** PWA-02: the service worker, in production only (in development it would fight hot reload). */

export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Without the worker the site still works online; only the offline copy is lost.
  });
}

/** Sign-out: delete cached pages and API answers so the next person on this device sees none of them. */
export function clearOfflineCache(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.controller?.postMessage("clear");
}
