import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  const isProduction = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
  return isProduction ? {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/meistras/", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL
  } : { rules: { userAgent: "*", disallow: "/" } };
}
