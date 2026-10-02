import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FarmHQ",
    short_name: "FarmHQ",
    description: "The operating system for modern farm businesses.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: "#1f6b45",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
