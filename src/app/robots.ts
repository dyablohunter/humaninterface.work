import type { MetadataRoute } from "next";

const BASE = process.env.APP_BASE_URL || "https://humaninterface.work";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/api/v1/",
          "/admin",
          "/me",
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
