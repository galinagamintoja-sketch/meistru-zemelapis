import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import SiteFooter from "../components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://localpro.lt"),
  title: "LocalPro.lt - patikimi meistrai jūsų mieste",
  description: "Raskite patikimus, patvirtintus meistrus Lietuvoje pagal paslaugą ir miestą.",
  icons: {
    icon: "/brand/localpro-icon.png",
    shortcut: "/brand/localpro-icon.png",
    apple: "/brand/localpro-icon.png"
  },
  openGraph: {
    siteName: "LocalPro.lt",
    title: "LocalPro.lt - patikimi meistrai jūsų mieste",
    description: "Raskite patikimus, patvirtintus meistrus Lietuvoje pagal paslaugą ir miestą.",
    images: [{ url: "/brand/localpro-logo-source.jpg", width: 1280, height: 1280, alt: "LocalPro.lt" }],
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "LocalPro.lt - patikimi meistrai jūsų mieste",
    description: "Raskite patikimus, patvirtintus meistrus Lietuvoje pagal paslaugą ir miestą.",
    images: ["/brand/localpro-logo-source.jpg"]
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
