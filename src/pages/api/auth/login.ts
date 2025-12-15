import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { sql } from "@lib/db";
import { randomUUID } from "node:crypto";
import { applyRateLimit } from "@lib/ratelimit";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST: APIRoute = async (context) => {
  try {
    const { request } = context;

    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context, '/auth/login');
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    // 🔒 Rate limiting - 5 intentos cada 15 minutos
    const rateLimitResult = await applyRateLimit(request, '/api/auth/login', 'auth');
    if (!rateLimitResult.success) {
      return rateLimitResult.response!;
    }

    const url = new URL(request.url);
    const raw = url.searchParams.get("returnTo") || "/dashboard";
    const returnTo = raw.startsWith("/") ? raw : "/dashboard";

    const form = Object.fromEntries(csrfResult.formData!);
    const parsed = loginSchema.parse(form);

    // Buscar usuario
    const user = await sql`
      SELECT id, password_hash, email_verified_at, name, role_id
      FROM users 
      WHERE email = ${parsed.email}
      LIMIT 1
    `;

    if (user.length === 0) {
      const err = new Error("Credenciales incorrectas.");
      console.error("Auth Fail:", err.message);
      // ✅ CORRECTO: Construir URL completa para redirect
      return new Response(null, {
        status: 303,
        headers: {
          "Location": `/auth/login?error=${encodeURIComponent(err.message)}`
        }
      });
    }

    const found = user[0];

    // Validar contraseña
    const valid = await argon2.verify(found.password_hash, parsed.password);
    if (!valid) {
      const err = new Error("Credenciales incorrectas.");
      return new Response(null, {
        status: 303,
        headers: {
          "Location": `/auth/login?error=${encodeURIComponent(err.message)}`
        }
      });
    }

    // Verificar que el email esté verificado
    if (!found.email_verified_at) {
      const err = new Error("Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o la carpeta de spam.");
      return new Response(null, {
        status: 303,
        headers: {
          "Location": `/auth/login?error=${encodeURIComponent(err.message)}`
        }
      });
    }

    // Crear sesión con duración basada en "Remember Me"
    const sessionId = randomUUID();
    const rememberMe = form.remember_me === "on";

    // 7 días si "Remember Me" está activado, 2 horas si no
    const sessionDuration = rememberMe
      ? 1000 * 60 * 60 * 24 * 7  // 7 días
      : 1000 * 60 * 60 * 2;       // 2 horas

    const expiresAt = new Date(Date.now() + sessionDuration);

    await sql`
      INSERT INTO sessions (id, user_id, expires_at, name, role_id)
      VALUES (${sessionId}, ${found.id}, ${expiresAt.toISOString()}, ${found.name}, ${found.role_id})
    `;
    
    // ✅ CORRECTO: Crear Response con cookie y redirect en un solo paso
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(sessionDuration / 1000)}`,
        "Location": returnTo
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(null, {
        status: 303,
        headers: {
          "Location": `/auth/login?error=${encodeURIComponent("Datos inválidos")}`
        }
      });
    }
    return handleApiError({
      error,
      logMsg: "Login server error",
      type: new URL("/auth/login", context.request.url).toString()
    });
  }
};

export const GET: APIRoute = ({ url }) => {
  const returnTo = url.searchParams.get("returnTo") || "/";
  return new Response(null, {
    status: 302,
    headers: {
      "Location": `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    }
  });
};