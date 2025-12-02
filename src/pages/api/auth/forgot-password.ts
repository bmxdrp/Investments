import type { APIRoute } from "astro";
import { z } from "zod";
import { sql, setRLSUser } from "@lib/db";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

const forgotSchema = z.object({
  email: z.string().email(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = Object.fromEntries(await request.formData());
    const parsed = forgotSchema.parse(form);
    // 1. Buscar usuario
    const user = await sql`
      SELECT id FROM users WHERE email = ${parsed.email} LIMIT 1
    `;

    if (user.length > 0) {
      const userId = user[0].id;
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hora
      setRLSUser(userId);

      // 2. Guardar token en DB (asumiendo tabla password_resets)
      // Si la tabla no existe, esto fallará, pero crearemos la tabla después.
      await sql`
        INSERT INTO password_resets (user_id, token, expires_at)
        VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
      `;

      // 3. Enviar correo con Nodemailer
      const resetLink = new URL("/auth/reset-password", request.url);
      resetLink.searchParams.set("token", token);

      const transporter = nodemailer.createTransport({
        host: import.meta.env.SMTP_HOST,
        port: Number(import.meta.env.SMTP_PORT),
        secure: false, // true solo si es 465
        auth: {
          user: import.meta.env.SMTP_USER,
          pass: import.meta.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Capyte" <${import.meta.env.SMTP_USER}>`,
        to: parsed.email,
        subject: 'Restablecer contraseña - Capyte',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #d97706;">Restablecer Contraseña</h1>
            <p>Has solicitado restablecer tu contraseña en Capyte.</p>
            <p>Haz clic en el siguiente enlace para continuar:</p>
            <a href="${resetLink.toString()}" style="display: inline-block; background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px;">Restablecer Contraseña</a>
            <p style="margin-top: 24px; color: #666; font-size: 12px;">Si no solicitaste esto, puedes ignorar este correo.</p>
          </div>
        `,
      });
    }

    // Siempre retornar éxito por seguridad (para no revelar si el email existe)
    return Response.redirect(new URL("/auth/forgot-password?success=1", request.url), 303);

  } catch (error) {
    console.error("Error en forgot-password:", error);
    // En caso de error de sistema, sí mostramos error genérico
    return Response.redirect(new URL("/auth/forgot-password?error=" + encodeURIComponent("Error al procesar la solicitud"), request.url), 303);
  }
};
