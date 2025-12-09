import { defineMiddleware } from "astro:middleware";
import { sql } from "@lib/db";

const PROTECTED_ROUTES = ["/dashboard", "/api"];
const ADMIN_ROUTES = ["/admin"];
const UNPROTECTED_ROUTES = [
  "/api/auth/login", 
  "/api/auth/register", 
  "/api/cron/update-rate", 
  "/api/auth/forgot-password", 
  "/api/auth/reset-password", 
  "/api/auth/verify-email"
];

// Cache de sesiones para reducir consultas a DB
const sessionCache = new Map<string, { userId: string; userRole: string | null; expiresAt: Date }>();
const CACHE_TTL = 120 * 60 * 1000; // 2 horas
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

  // Gestionar token CSRF (Persistente vía Cookie)
  const { generateCsrfToken } = await import('@lib/csrf');

  // Intentar leer token existente de la cookie
  const cookies = request.headers.get("cookie") || "";
  const csrfCookieMatch = cookies.match(/(?:^|; )csrf-token=([^;]+)/);
  let csrfToken = csrfCookieMatch?.[1];

  // Si no existe o es inválido, generar uno nuevo
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
  }

  locals.csrfToken = csrfToken;

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

  // Continuar con la petición
  const response = await next();

  // ========================================
  // ✅ SOLUCIÓN: CLONAR LA RESPUESTA PARA PODER MODIFICAR HEADERS
  // ========================================
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers), // Clonar headers
  });

  // Guardar/Renovar cookie CSRF
  if (locals.csrfToken) {
    newResponse.headers.append('Set-Cookie', `csrf-token=${locals.csrfToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`); // 1 hora
  }

  // ========================================
  // SECURITY HEADERS
  // ========================================

  // Prevenir clickjacking - no permitir que el sitio sea embebido en iframes
  newResponse.headers.set('X-Frame-Options', 'DENY');

  // Prevenir MIME type sniffing
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');

  // Habilitar protección XSS del navegador (legacy, pero útil para navegadores antiguos)
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');

  // Controlar qué información de referrer se envía
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Forzar HTTPS en producción (HSTS)
  if (import.meta.env.PROD) {
    newResponse.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Controlar permisos de APIs del navegador
  newResponse.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );

  // Content Security Policy (CSP)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  newResponse.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // ========================================
  // CORS CONFIGURATION
  // ========================================

  const origin = request.headers.get('origin');

  // Lista de orígenes permitidos
  const allowedOrigins = [
    'http://localhost:4321',
    'http://localhost:3000',
    'https://yourdomain.com',
    'https://www.yourdomain.com',
  ];

  // En desarrollo, permitir localhost
  if (import.meta.env.DEV && origin?.includes('localhost')) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  // En producción, solo permitir orígenes específicos
  else if (origin && allowedOrigins.includes(origin)) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Manejar preflight requests (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: newResponse.headers,
    });
  }

  return newResponse;
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