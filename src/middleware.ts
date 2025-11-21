import { defineMiddleware } from "astro:middleware";
import { neon } from "@neondatabase/serverless";

const sql = neon(import.meta.env.DATABASE_URL);

const PROTECTED_ROUTES = ["/admin", "/api"];
const UNPROTECTED_ROUTES = ["/api/fetch/usd_to_cop"];


export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, locals, url } = ctx;

  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
  const sessionId = match?.[1] ?? null;

  locals.userId = null;

  if (sessionId) {
    const rows = await sql`
      SELECT user_id, expires_at
      FROM sessions
      WHERE id = ${sessionId}
    `;

    if (rows.length > 0) {
      const session = rows[0];

      if (new Date(session.expires_at) > new Date()) {
        locals.userId = session.user_id;
      }
    }
  }

  const path = url.pathname;

  if (PROTECTED_ROUTES.some((p) => path.startsWith(p)) && !UNPROTECTED_ROUTES.includes(path)) {
    if (!locals.userId) {
      const encoded = encodeURIComponent(path);
      const redirectUrl = new URL(`/auth/login?returnTo=${encoded}`, url);
      return Response.redirect(redirectUrl.toString(), 302);
    }
  }
  return next();
});
