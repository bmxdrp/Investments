import { defineMiddleware } from "astro:middleware";
import { sql } from "@lib/db";

const PROTECTED_ROUTES = ["/dashboard", "/api"];
const ADMIN_ROUTES = ["/admin"];
const UNPROTECTED_ROUTES = ["/api/auth/login", "/api/auth/register", "/api/cron", "/api/auth/forgot-password", "/api/auth/reset-password"];

// Cache de sesiones para reducir consultas a DB
const sessionCache = new Map<string, { userId: string; userRole: string | null; expiresAt: Date }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const cacheTimestamps = new Map<string, number>();

function extractSessionId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
  return match?.[1] ?? null;
}

async function validateSession(sessionId: string): Promise<{ userId: string; userRole: string | null } | null> {
  // Verificar cache primero
  const now = Date.now();
  const cachedTimestamp = cacheTimestamps.get(sessionId);

  if (cachedTimestamp && now - cachedTimestamp < CACHE_TTL) {
    const cached = sessionCache.get(sessionId);
    if (cached && cached.expiresAt > new Date()) {
      return { userId: cached.userId, userRole: cached.userRole };
    }
  }

  // Consultar base de datos con JOIN para obtener el rol
  try {
    const rows = await sql`
      SELECT s.user_id, s.expires_at, r.name as role_name
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE s.id = ${sessionId}
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
      sql`DELETE FROM sessions WHERE id = ${sessionId}`.catch(() => { });
      sessionCache.delete(sessionId);
      cacheTimestamps.delete(sessionId);
      return null;
    }

    // Actualizar cache
    const sessionData = {
      userId: session.user_id,
      userRole: session.role_name || null,
      expiresAt,
    };

    sessionCache.set(sessionId, sessionData);
    cacheTimestamps.set(sessionId, now);

    return { userId: session.user_id, userRole: session.role_name || null };
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

function isAdminRoute(path: string): boolean {
  return ADMIN_ROUTES.some((route) => path.startsWith(route));
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

function createForbiddenResponse(baseUrl: URL): Response {
  const redirectUrl = new URL("/403", baseUrl);

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
    },
  });
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, locals, url } = ctx;

  // Inicializar userId y userRole
  locals.userId = null;
  locals.userRole = null;

  // Extraer sessionId de cookies
  const cookieHeader = request.headers.get("cookie") || "";
  const sessionId = extractSessionId(cookieHeader);

  // Validar sesión si existe
  if (sessionId) {
    const sessionData = await validateSession(sessionId);
    if (sessionData) {
      locals.userId = sessionData.userId;
      locals.userRole = sessionData.userRole;
    }
  }

  // Verificar protección de ruta
  const path = url.pathname;

  // Verificar si la ruta requiere autenticación
  if (isProtectedRoute(path) && !locals.userId) {
    return createRedirectResponse(path, url);
  }

  // Verificar si la ruta requiere rol de administrador
  if (isAdminRoute(path) && locals.userRole !== 'admin') {
    console.log(`Access denied to ${path} for user ${locals.userId} with role ${locals.userRole}`);
    return createForbiddenResponse(url);
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