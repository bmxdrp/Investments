import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { setRLSUser, sql } from "@lib/db";
import nodemailer from "nodemailer";
import { applyRateLimit } from "@lib/ratelimit";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8), // Mejorado a 8 según auditoría
  password_confirm: z.string().min(8),
});

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context, '/auth/register');
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    // 🔒 Rate limiting - 3 intentos cada 15 minutos
    const rateLimitResult = await applyRateLimit(request, '/api/auth/register', 'email');
    if (!rateLimitResult.success) {
      return rateLimitResult.response!;
    }

    // Generar UUID como id
    const id = randomUUID();
    const form = Object.fromEntries(csrfResult.formData!);
    const parsed = registerSchema.parse(form);

    if (parsed.password !== parsed.password_confirm) {
      return Response.redirect(new URL("/auth/register?error=" + encodeURIComponent("Las contraseñas no coinciden"), request.url), 303);
    }

    // Verificar si ya existe
    const existing = await sql`
      SELECT id FROM users WHERE email = ${parsed.email}
    `;

    if (existing.length > 0) {
      // 🛡️ SECURITY: Prevención de enumeración de usuarios
      // Retornamos éxito simulado. En un sistema real, enviaríamos un email diciendo "Ya tienes cuenta".
      // No revelamos que el correo ya existe.
      return Response.redirect(new URL("/auth/register?success=1", request.url), 303);
    }

    // Encriptar contraseña
    const password_hash = await argon2.hash(parsed.password);

    // Insertar usuario (sin verificar)
    await setRLSUser(id);
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
    if (err instanceof z.ZodError) {
      return Response.redirect(new URL("/auth/register?error=" + encodeURIComponent("Datos inválidos"), request.url), 303);
    }

    return handleApiError({
      error: err,
      logMsg: "Error crítico en registro de usuario",
      type: new URL("/auth/register", request.url).toString()
    });
  }
};
