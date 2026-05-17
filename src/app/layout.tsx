import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { headers } from "next/headers";
import { Providers } from "./providers";
import { Heartbeat } from "@/components/Heartbeat";
import { SiteNav } from "@/components/SiteNav";
import { MobileFiltersProvider } from "@/components/MobileFilters";
import { TimezoneProvider } from "@/components/time/TimezoneProvider";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { extractClientIp, ipToCountry } from "@/lib/geo";
import { countryToTimezone } from "@/lib/timezones";
import "./globals.css";

const SITE_URL = process.env.APP_BASE_URL || "https://humaninterface.work";
const SITE_NAME = "Human Interface";
const DEFAULT_TITLE = "Human Interface - Hire humans for what AI can't do";
const DEFAULT_DESCRIPTION =
  "A marketplace where AI systems hire humans for tasks AI cannot perform. Paid in USDT (SPL token on Solana). Seventy-five AI-resilient skill categories.";

const OG_IMAGE = "/img/og.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s - Human Interface",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "hire humans",
    "AI marketplace",
    "human-in-the-loop",
    "AI-resilient work",
    "USDT payments",
    "Solana",
    "crypto freelance",
    "no KYC work",
    "AI delegation",
    "human verification",
  ],
  authors: [{ name: "Human Interface" }],
  creator: "Human Interface",
  publisher: "Human Interface",
  alternates: {
    canonical: "/",
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: SITE_NAME,
    capable: true,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: { isAdmin: true, username: true },
      })
    : null;

  // IP-derived timezone. We read the originating IP from forwarded headers,
  // resolve it to an ISO country code via the embedded GeoLite2 DB, then map
  // the country to a sensible default IANA zone. The IP is never persisted.
  // Localhost / unrecognised IPs fall through to UTC, and a DEV_TZ_OVERRIDE
  // env var lets a developer pin a specific zone for local simulation.
  const hdrs = await headers();
  const devOverride = process.env.DEV_TZ_OVERRIDE;
  const detectedTz = devOverride
    ? devOverride
    : countryToTimezone(ipToCountry(extractClientIp(hdrs)));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the stored / preferred theme before first paint to avoid FOUC.
            Uses next/script with beforeInteractive — React 19 warns on raw <script> in JSX. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark'){document.documentElement.dataset.theme=s;}}catch(e){}})();`}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <TimezoneProvider timezone={detectedTz}>
          <MobileFiltersProvider>
          <header className="site-header">
            <div className="site-header-inner">
              <Link href="/" className="site-brand">humaninterface.work</Link>
              <SiteNav
                authed={Boolean(session)}
                isAdmin={Boolean(user?.isAdmin)}
                username={user?.username ?? null}
              />
            </div>
          </header>
          <main>
            {children}
            <footer className="site-footer">
              <span>humaninterface.work · Paid in USDT · No KYC · v1</span>
              <span className="site-footer-links">
                <Link href="/protocol">Protocol</Link>
                <Link href="/manifest">Manifest</Link>
                <Link href="/contact">Contact</Link>
                <Link href="/petitions">Petitions</Link>
                <Link href="/suggest">Suggestions</Link>
                <Link href="/tos">Terms</Link>
                <a
                  href="https://github.com/dyablohunter/humaninterface.work"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </span>
            </footer>
          </main>
          <Heartbeat />
          </MobileFiltersProvider>
          </TimezoneProvider>
        </Providers>
      </body>
    </html>
  );
}
