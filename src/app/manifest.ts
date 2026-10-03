import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FarmHQ",
    short_name: "FarmHQ",
    description: "The operating system for modern farm businesses.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#2f5d3a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
