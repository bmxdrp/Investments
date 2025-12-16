import { defineMiddleware } from "astro:middleware";
import { sql } from "@lib/db";
import { getCookie, isRouteMatch } from "@lib/auth.utils";

const PROTECTED = ["/dashboard", "/api"];
const ADMIN = ["/admin"];
const PUBLIC = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/cron/update-rate",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
];

const ADMIN_ROLE_ID = import.meta.env.ADMIN_ROLE_ID;

type SessionData = {
  userId: string;
  userRoleId: string;
  expiresAt: Date;
};

const cache = new Map<string, SessionData>();
const cacheTTL = new Map<string, number>();
const TTL = 24 * 60 * 60 * 1000; // cached for 24 hours

async function validateSession(id: string): Promise<SessionData | null> {
  const now = Date.now();
  const cached = cache.get(id);

  if (cached && now - (cacheTTL.get(id) ?? 0) < TTL && cached.expiresAt > new Date()) {
    return cached;
  }

  const rows = await sql`
    SELECT s.user_id, s.expires_at, r.id AS role_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE s.id = ${id}
    LIMIT 1
  `;

  if (!rows.length) return null;

  const expiresAt = new Date(rows[0].expires_at);
  if (expiresAt <= new Date()) return null;

  const session: SessionData = {
    userId: rows[0].user_id,
    userRoleId: rows[0].role_id,
    expiresAt,
  };

  cache.set(id, session);
  cacheTTL.set(id, now);

  return session;
}

export const onRequest = defineMiddleware(async ({ request, locals, url }, next) => {
  const cookies = request.headers.get("cookie") ?? "";
  const path = url.pathname;

  locals.userId = null;
  locals.userRoleId = null;

  // ========= AUTH =========
  const sessionId = getCookie("session", cookies);
  if (sessionId) {
    const session = await validateSession(sessionId);
    if (session) {
      locals.userId = session.userId;
      locals.userRoleId = session.userRoleId;
    }
  }

  if (!isRouteMatch(path, PUBLIC) && isRouteMatch(path, PROTECTED) && !locals.userId) {
    return Response.redirect(
      new URL(`/auth/login?returnTo=${encodeURIComponent(path)}`, url),
      302
    );
  }

  if (isRouteMatch(path, ADMIN) && locals.userRoleId !== ADMIN_ROLE_ID) {
    return Response.redirect(new URL("/403", url), 302);
  }

  // ========= CSRF =========
  const { generateCsrfToken } = await import("@lib/csrf");
  locals.csrfToken ||= getCookie("csrf-token", cookies) ?? generateCsrfToken();

  const response = await next();
  const headers = new Headers(response.headers);

  headers.append(
    "Set-Cookie",
    `csrf-token=${locals.csrfToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
  );

  // ========= SECURITY HEADERS =========
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()"
  );

  if (import.meta.env.PROD) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // ========= CORS =========
  const origin = request.headers.get("origin");
  if (origin && (import.meta.env.DEV || origin.includes("yourdomain.com"))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
