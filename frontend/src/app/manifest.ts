import type { MetadataRoute } from "next";
import { messages } from "@/messages/en";

/** PWA-01: lets a phone add Caissa to its home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.logo,
    short_name: messages.logo,
    description: messages.homeLead,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e1420",
    theme_color: "#0e1420",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
