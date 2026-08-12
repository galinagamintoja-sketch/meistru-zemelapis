import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://localpro.lt"),
  title: "LocalPro.lt - patikimi meistrai jūsų mieste",
  description: "Raskite patikimus, patvirtintus meistrus Lietuvoje pagal paslaugą ir miestą.",
  robots: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? { index: false, follow: false }
    : { index: true, follow: true }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt">
      <body>{children}</body>
    </html>
  );
}
