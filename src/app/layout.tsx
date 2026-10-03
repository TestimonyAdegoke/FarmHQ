import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap", style: ["normal", "italic"], axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: { default: "FarmHQ", template: "%s · FarmHQ" },
  description: "The operating system for modern farm businesses.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export const viewport: Viewport = { themeColor: "#2f5d3a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${serif.variable}`}><body>{children}<ServiceWorkerRegister/></body></html>;
}
