import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { sql } from "@lib/db";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  password_confirm: z.string().min(6),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = Object.fromEntries(await request.formData());
    const parsed = registerSchema.parse(form);

    if (parsed.password !== parsed.password_confirm) {
      return new Response(JSON.stringify({ error: "Las contraseñas no coinciden" }), {
        status: 400,
      });
    }

    // Verificar si ya existe
    const existing = await sql`
      SELECT id FROM users WHERE email = ${parsed.email}
    `;

    if (existing.length > 0) {
      console.error("Error:", "El correo ya está registrado");
    return Response.redirect(new URL("/auth/register?error=" + encodeURIComponent("El correo ya está registrado"), request.url), 303);
    }

    // Generar UUID como id
    const id = randomUUID();

    // Encriptar contraseña
    const password_hash = await argon2.hash(parsed.password);

    // Insertar usuario
    const user = await sql`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (${id}, ${parsed.email}, ${password_hash}, 'common_user')
      RETURNING id, email;
    `;

    return Response.redirect(new URL("/auth/register?success=1", request.url), 303);

  } catch (err) {
    console.error(err);
    return Response.redirect(new URL("/auth/register?error=" + encodeURIComponent("Error al registrar el usuario"), request.url), 303);
  }
};
