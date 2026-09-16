import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import SiteFooter from "../components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://localpro.lt"),
  title: { default: "LocalPro.lt", template: "%s" },
  icons: {
    icon: "/brand/localpro-icon.png",
    shortcut: "/brand/localpro-icon.png",
    apple: "/brand/localpro-icon.png"
  },
  robots: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? { index: false, follow: false }
    : { index: true, follow: true }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt">
      <body>{children}<SiteFooter /></body>
    </html>
  );
}
