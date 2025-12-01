import { defineMiddleware } from "astro:middleware";
import { sql } from "@lib/db";

const PROTECTED_ROUTES = ["/admin", "/api"];
const UNPROTECTED_ROUTES = ["/api/auth/login","/api/auth/register", "/api/cron"];

// Cache de sesiones para reducir consultas a DB
const sessionCache = new Map<string, { userId: string; expiresAt: Date }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const cacheTimestamps = new Map<string, number>();

function extractSessionId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
  return match?.[1] ?? null;
}

async function validateSession(sessionId: string): Promise<string | null> {
  // Verificar cache primero
  const now = Date.now();
  const cachedTimestamp = cacheTimestamps.get(sessionId);
  
  if (cachedTimestamp && now - cachedTimestamp < CACHE_TTL) {
    const cached = sessionCache.get(sessionId);
    if (cached && cached.expiresAt > new Date()) {
      return cached.userId;
    }
  }

  // Consultar base de datos
  try {
    const rows = await sql`
      SELECT user_id, expires_at
      FROM sessions
      WHERE id = ${sessionId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      sessionCache.delete(sessionId);
      cacheTimestamps.delete(sessionId);
      return null;
    }

    const session = rows[0];
    const expiresAt = new Date(session.expires_at);

    if (expiresAt <= new Date()) {
      // Sesión expirada, limpiar de DB de forma asíncrona
      sql`DELETE FROM sessions WHERE id = ${sessionId}`.catch(() => {});
      sessionCache.delete(sessionId);
      cacheTimestamps.delete(sessionId);
      return null;
    }

    // Actualizar cache
    sessionCache.set(sessionId, {
      userId: session.user_id,
      expiresAt,
    });
    cacheTimestamps.set(sessionId, now);

    return session.user_id;
  } catch (error) {
    console.error("Error validating session:", error);
    return null;
  }
}

function isProtectedRoute(path: string): boolean {
  // Verificar primero las rutas no protegidas (más específicas)
  if (UNPROTECTED_ROUTES.some((route) => path.startsWith(route))) {
    return false;
  }
  
  // Luego verificar las rutas protegidas
  return PROTECTED_ROUTES.some((route) => path.startsWith(route));
}

function createRedirectResponse(returnTo: string, baseUrl: URL): Response {
  const encoded = encodeURIComponent(returnTo);
  const redirectUrl = new URL(`/auth/login?returnTo=${encoded}`, baseUrl);
  
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
    },
  });
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, locals, url } = ctx;

  // Inicializar userId
  locals.userId = null;

  // Extraer sessionId de cookies
  const cookieHeader = request.headers.get("cookie") || "";
  const sessionId = extractSessionId(cookieHeader);

  // Validar sesión si existe
  if (sessionId) {
    locals.userId = await validateSession(sessionId);
  }

  // Verificar protección de ruta
  const path = url.pathname;
  
  if (isProtectedRoute(path) && !locals.userId) {
    return createRedirectResponse(path, url);
  }

  return next();
});

// Función de utilidad para limpiar cache periódicamente (opcional)
export function clearExpiredCache(): void {
  const now = Date.now();
  
  for (const [sessionId, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp > CACHE_TTL) {
      sessionCache.delete(sessionId);
      cacheTimestamps.delete(sessionId);
    }
  }
}