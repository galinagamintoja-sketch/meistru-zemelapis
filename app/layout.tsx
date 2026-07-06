import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocalPro.lt - patikimi meistrai jūsų mieste",
  description: "Map-first Lithuanian tradesperson marketplace for finding approved specialists by city, service and operating area."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt">
      <body>{children}</body>
    </html>
  );
}
