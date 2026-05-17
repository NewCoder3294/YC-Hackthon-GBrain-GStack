import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://watchdog-yc.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/map", "/live", "/feed", "/contribute"],
        disallow: ["/api/", "/c/", "/incidents/", "/triage", "/openclaw", "/kg", "/enrichment", "/wall"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
