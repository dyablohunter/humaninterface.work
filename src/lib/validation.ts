import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(4)
  .max(30)
  .regex(/^[a-z0-9.]+$/i, "letters, digits, dots only");

/**
 * Usernames nobody may register - role/brand/system impersonation, app
 * routes, service addresses, infra hostnames, and well-known third parties.
 * Comparison is alphanumeric-only (dots/separators stripped), so variants
 * like "ad.min.istrator" or "r-o-o-t" can't slip through.
 *
 * NOTE: "admin" is intentionally NOT in this list - the first account to
 * claim that username becomes the platform admin (see register route).
 * Tokens shorter than 4 chars are already rejected by usernameSchema; they
 * are kept here only to document intent.
 */
export const RESERVED_USERNAMES = new Set<string>([
  // ── Elevated-role / authority impersonation ───────────────────────────
  "administrator", "administrators", "admins", "adminteam", "adminteams",
  "admincp", "adminpanel", "siteadmin", "webadmin", "hostadmin", "globaladmin",
  "headadmin", "superadmin", "superadmins", "superuser", "superusers", "super",
  "root", "toor", "sudo", "sudoer", "sysadmin", "sysadmins", "sysop", "sysops",
  "operator", "operators", "moderator", "moderators", "mod", "mods", "modteam",
  "staff", "staffteam", "owner", "owners", "founder", "founders", "cofounder",
  "ceo", "cto", "cfo", "coo", "cio", "ciso", "president", "vicepresident",
  "director", "directors", "manager", "managers", "management", "supervisor",
  "official", "officials", "officialteam", "team", "teams", "crew", "employee",
  "employees", "authority", "authorities", "master", "supervisors", "lead",
  "leads", "headquarters", "trustandsafety", "trustsafety", "moderation",
  // ── Platform / brand ──────────────────────────────────────────────────
  "humaninterface", "humaninterfaces", "humaninterfacework",
  "humaninterfaceworkofficial", "hiwork", "platform", "platforms", "system",
  "systems", "network", "networks", "service", "services", "company",
  "corporate", "enterprise", "organization", "organisation", "brand",
  "officialaccount", "verified", "verifiedaccount", "verification",
  // ── Support / communications (RFC 2142 + common role addresses) ───────
  "support", "supportteam", "customersupport", "customerservice", "helpdesk",
  "help", "helpcenter", "contact", "contactus", "info", "information",
  "inquiries", "enquiries", "feedback", "suggestion", "suggestions", "abuse",
  "report", "reports", "reporting", "complaint", "complaints", "security",
  "securityteam", "infosec", "trust", "safety", "press", "pressoffice",
  "media", "news", "newsroom", "marketing", "sales", "partnerships",
  "partner", "partners", "affiliate", "affiliates", "legal", "legalteam",
  "compliance", "privacy", "dataprotection", "dpo", "gdpr", "ccpa", "terms",
  "termsofservice", "tos", "tou", "eula", "dmca", "copyright", "trademark",
  "postmaster", "webmaster", "hostmaster", "mailerdaemon", "daemon", "noreply",
  "donotreply", "notifications", "notification", "alerts", "alert", "mailer",
  "mailbox", "email", "mail", "newsletter", "subscribe", "unsubscribe",
  // ── Money / payments / crypto / protocol ──────────────────────────────
  "billing", "billingteam", "payment", "payments", "payouts", "payout",
  "invoice", "invoices", "escrow", "escrowwallet", "treasury", "treasurer",
  "wallet", "wallets", "refund", "refunds", "chargeback", "chargebacks",
  "fee", "fees", "feesteam", "finance", "financial", "accounting", "accounts",
  "accountspayable", "bank", "banking", "settlement", "settlements",
  "solana", "lamport", "lamports", "pyth", "oracle", "oracles", "crypto",
  "blockchain", "onchain", "ledger", "vault", "mint", "burn", "faucet",
  "airdrop", "staking", "stake", "validator", "validators", "devnet",
  "mainnet", "testnet", "mainnetbeta", "gas", "treasuryops",
  // ── App routes / framework reserved words ─────────────────────────────
  "api", "apis", "app", "apps", "application", "auth", "oauth", "oauth2",
  "sso", "saml", "login", "logout", "signin", "signout", "signup", "register",
  "registration", "verify", "confirm", "confirmation", "reset", "forgot",
  "password", "passwords", "passwd", "credential", "credentials", "token",
  "tokens", "nonce", "session", "sessions", "cookie", "cookies", "account",
  "profile", "profiles", "settings", "preferences", "config", "configuration",
  "dashboard", "console", "panel", "controlpanel", "cpanel", "manage",
  "myaccount", "user", "users", "username", "usernames", "member", "members",
  "people", "person", "work", "works", "task", "tasks", "taskfeed", "bid",
  "bids", "bidding", "dispute", "disputes", "milestone", "milestones", "slot",
  "slots", "evidence", "docs", "documentation", "apidocs", "reference",
  "guide", "guides", "manual", "faq", "faqs", "about", "aboutus", "home",
  "homepage", "index", "main", "landing", "search", "explore", "discover",
  "browse", "feed", "feeds", "trending", "popular", "latest", "list", "lists",
  "category", "categories", "tag", "tags", "filter", "filters", "page",
  "pages", "sitemap", "robots", "favicon", "assets", "static", "public",
  "private", "cdn", "image", "images", "img", "photo", "photos",
  "video", "videos", "file", "files", "upload", "uploads", "download",
  "downloads", "graphql", "webhook", "webhooks", "callback", "redirect",
  "status", "health", "healthcheck", "ping", "metrics", "debug", "trace",
  "logs", "error", "errors", "maintenance", "internal", "intranet",
  // ── Infra / hostnames / protocols ─────────────────────────────────────
  "www", "wwww", "web", "host", "localhost", "server", "servers", "gateway",
  "proxy", "smtp", "imap", "pop", "pop3", "ftp", "sftp", "ssh", "dns",
  "whois", "ntp", "ldap", "radius", "vpn", "router", "firewall", "loadbalancer",
  "nameserver", "broadcast", "anycast", "ipaddress", "localdomain", "example",
  "examples", "test", "testing", "tester", "tests", "sandbox", "staging",
  "production", "preview", "demo", "demos", "sample", "samples", "alpha",
  "beta", "canary", "nightly", "release", "snapshot",
  // ── Well-known third parties (impersonation) ──────────────────────────
  "anthropic", "claude", "openai", "chatgpt", "gpt", "google", "gemini",
  "deepmind", "meta", "facebook", "instagram", "whatsapp", "microsoft",
  "copilot", "apple", "amazon", "aws", "azure", "nvidia", "twitter",
  "tiktok", "discord", "telegram", "slack", "github", "gitlab", "phantom",
  "solflare", "metamask", "coinbase", "binance", "kraken", "stripe", "paypal",
  // ── Generic / placeholder / status ────────────────────────────────────
  "artificialintelligence", "robot", "bot", "bots", "agent",
  "agents", "assistant", "assistants", "chatbot", "model", "models", "llm",
  "anonymous", "anon", "anons", "guest", "guests", "nobody", "somebody",
  "everyone", "everybody", "someone", "noone", "null", "nil", "none", "void",
  "undefined", "unknown", "default", "defaults", "temp", "temporary",
  "deleted", "removed", "banned", "blocked", "suspended", "spam", "spammer",
  "scam", "scammer", "phishing", "fake", "impersonator", "official0",
  "premium", "vip", "verifiedbadge", "badge", "name", "developer",
  "developers", "development", "engineering", "devops", "devteam",
  "government", "police", "fbi", "cia", "irs", "court", "judge", "lawyer",
  "attorney", "notice", "noticeboard",
]);

/**
 * True if the name is reserved. Comparison strips every non-alphanumeric
 * character and lowercases, so "Ad.Min.Istrator", "r_o_o_t", "s-u-p-p-o-r-t"
 * all collapse to their reserved form. (Usernames only allow [a-z0-9.], but
 * the broader strip is a cheap safety net.)
 */
export function isReservedUsername(name: string): boolean {
  const lower = name.trim().toLowerCase();
  const alnum = lower.replace(/[^a-z0-9]/g, "");
  return RESERVED_USERNAMES.has(lower) || RESERVED_USERNAMES.has(alnum);
}

export const solanaPubkeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "must be a base58 string");

export const txSignatureSchema = z
  .string()
  .min(64)
  .max(120)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "must be a base58 string");

export const registerSchema = z.object({
  username: usernameSchema,
  pubkey: solanaPubkeySchema,
  // Optional and ignored for API clients - every API registration is an AI
  // account. Only the first-party web signup (x-hi-web header) may request
  // HUMAN. See the register route.
  role: z.enum(["HUMAN", "AI"]).optional(),
  tosVersion: z.string().min(1),
});

export const registerVerifySchema = z.object({
  pubkey: solanaPubkeySchema,
  signature: z
    .string()
    .min(80)
    .max(100)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "must be a base58 string"),
});

export const loginChallengeSchema = z.object({
  pubkey: solanaPubkeySchema,
});

export const loginSchema = z.object({
  pubkey: solanaPubkeySchema,
  signature: z
    .string()
    .min(80)
    .max(100)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "must be a base58 string"),
});

export const suggestionSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const petitionSchema = z.object({
  title: z.string().trim().min(6).max(140),
  body: z.string().trim().min(20).max(5000),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  body: z.string().min(1).max(5000),
});
