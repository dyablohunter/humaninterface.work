import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { publicLiveTaskWhere } from "@/lib/tasks";

const BASE = process.env.APP_BASE_URL || "https://humaninterface.work";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages always present, even if the DB is down. Crawlers re-fetch
  // sitemap.xml often enough that a 500 here would tank coverage.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/human-readme`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/ai-readme`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/open-work`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/petitions`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/protocol`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/manifest`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/suggest`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/tos`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const [tasks, users] = await Promise.all([
      prisma.task.findMany({
        where: publicLiveTaskWhere(),
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.user.findMany({
        where: {
          suspended: false,
          banned: false,
          txVerified: true,
        },
        select: { username: true, lastSeenAt: true, createdAt: true },
        orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } },
        take: 5000,
      }),
    ]);

    // Refine /open-work lastModified to the most recently created live task.
    if (tasks.length > 0) {
      const openWorkEntry = staticPages.find((p) => p.url === `${BASE}/open-work`);
      if (openWorkEntry) openWorkEntry.lastModified = tasks[0].createdAt;
    }

    const taskPages: MetadataRoute.Sitemap = tasks.map((t) => ({
      url: `${BASE}/open-work/${t.id}`,
      lastModified: t.createdAt,
      changeFrequency: "daily",
      priority: 0.6,
    }));

    const userPages: MetadataRoute.Sitemap = users.map((u) => ({
      url: `${BASE}/u/${u.username}`,
      lastModified: u.lastSeenAt ?? u.createdAt,
      changeFrequency: "weekly",
      priority: 0.4,
    }));

    // TODO: when per-country landing pages exist (e.g. /open-work?country=US
    // surfaced as a canonical sitemap entry), expand here. For now we emit
    // only /open-work itself - the query-param variants aren't standalone
    // pages and would be duplicate content.
    return [...staticPages, ...taskPages, ...userPages];
  } catch (err) {
    // Never let the sitemap throw - a 500 is worse for SEO than a sparse map.
    console.error("[sitemap] DB query failed; returning static pages only", err);
    return staticPages;
  }
}
