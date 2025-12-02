import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { sql } from "@lib/db";
import nodemailer from "nodemailer";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  password_confirm: z.string().min(6),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // Generar UUID como id
    const id = randomUUID();
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

    // Encriptar contraseña
    const password_hash = await argon2.hash(parsed.password);

    // Insertar usuario (sin verificar)
    await sql.unsafe(`SET app.user_id = '${id}'`);
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified_at)
      VALUES (${id}, ${parsed.email}, ${password_hash}, NULL);
    `;

    // Generar token de verificación
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 horas

    await sql`
      INSERT INTO email_verifications (user_id, token, expires_at)
      VALUES (${id}, ${token}, ${expiresAt.toISOString()})
    `;

    // Enviar correo de verificación
    const verifyLink = new URL("/auth/verify-email", request.url);
    verifyLink.searchParams.set("token", token);

    const transporter = nodemailer.createTransport({
      host: import.meta.env.SMTP_HOST,
      port: Number(import.meta.env.SMTP_PORT),
      secure: false,
      auth: {
        user: import.meta.env.SMTP_USER,
        pass: import.meta.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Capyte" <${import.meta.env.SMTP_USER}>`,
      to: parsed.email,
      subject: 'Verifica tu correo - Capyte',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d97706;">¡Bienvenido a Capyte!</h1>
          <p>Gracias por registrarte. Para completar tu registro, verifica tu correo electrónico.</p>
          <p>Haz clic en el siguiente enlace para verificar tu cuenta:</p>
          <a href="${verifyLink.toString()}" style="display: inline-block; background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Verificar Correo</a>
          <p style="margin-top: 24px; color: #666; font-size: 12px;">Este enlace expirará en 24 horas.</p>
        </div>
      `,
    });

    return Response.redirect(new URL("/auth/register?success=1", request.url), 303);

  } catch (err) {
    console.error(err);
    return Response.redirect(new URL("/auth/register?error=" + encodeURIComponent("Error al registrar el usuario"), request.url), 303);
  }
};
