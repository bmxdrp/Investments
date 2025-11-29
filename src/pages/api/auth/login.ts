import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { sql } from "@lib/db";
import { randomUUID } from "node:crypto";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("returnTo") || "/admin";
    const returnTo = raw.startsWith("/") ? raw : "/admin";


    const form = Object.fromEntries(await request.formData());
    const parsed = loginSchema.parse(form);

    // Buscar usuario
    const user = await sql`
      SELECT id, password_hash 
      FROM users 
      WHERE email = ${parsed.email}
      LIMIT 1
    `;

    if (user.length === 0) {
      const err = new Error("Usuario o contraseña incorrectos");
      console.error("Error:", err.message);
    return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent(err.message), request.url), 303);
    }

    const found = user[0];

    // Validar contraseña
    const valid = await argon2.verify(found.password_hash, parsed.password);
    if (!valid) {
      const err = new Error("Usuario o contraseña incorrectos");
      console.error("Error:", err.message);
    return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent(err.message), request.url), 303);
    }

    // Crear sesión
    const sessionId = randomUUID();
   const expiresAt = new Date(Date.now() + 1000 * 60 * 30000); // 30 minutos (arreglar despues)

    await sql`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (${sessionId}, ${found.id}, ${expiresAt.toISOString()})
    `;

    // Cookie
    const headers = new Headers({
      "Set-Cookie":
        `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expiresAt.toUTCString()}`,
      "Location": returnTo,
    });

    return new Response(null, { status: 302, headers });

  } catch (error) {
      console.error("Error de servidor:", error);
    return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent("error de servidor"), request.url), 303);
  }
};
export const GET: APIRoute = ({ url }) => {
  const returnTo = url.searchParams.get("returnTo") || "/";
  return Response.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`, 302);
};