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
      return new Response(JSON.stringify({ error: "El correo ya está registrado" }), {
        status: 400,
      });
    }

    // Generar UUID como id
    const id = randomUUID();

    // Encriptar contraseña
    const password_hash = await argon2.hash(parsed.password);

    // Insertar usuario
    const user = await sql`
      INSERT INTO users (id, email, password_hash)
      VALUES (${id}, ${parsed.email}, ${password_hash})
      RETURNING id, email;
    `;

    return new Response(JSON.stringify({ user: user[0] }), {
      status: 200,
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error en el servidor" }), {
      status: 500,
    });
  }
};
