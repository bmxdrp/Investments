import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { sql } from "@lib/db";

const resetSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(6),
    password_confirm: z.string().min(6),
}).refine((data) => data.password === data.password_confirm, {
    message: "Las contraseñas no coinciden",
    path: ["password_confirm"],
});

export const POST: APIRoute = async ({ request }) => {
    try {
        const form = Object.fromEntries(await request.formData());

        // Validación manual simple para redirigir con error legible
        if (form.password !== form.password_confirm) {
            return Response.redirect(new URL(`/auth/reset-password?token=${form.token}&error=` + encodeURIComponent("Las contraseñas no coinciden"), request.url), 303);
        }

        const parsed = resetSchema.parse(form);

        // 1. Buscar token válido
        const resets = await sql`
      SELECT user_id, expires_at 
      FROM password_resets 
      WHERE token = ${parsed.token} 
      AND used_at IS NULL
      LIMIT 1
    `;

        if (resets.length === 0) {
            return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent("Token inválido o expirado"), request.url), 303);
        }

        const reset = resets[0];

        // Verificar expiración
        if (new Date(reset.expires_at) < new Date()) {
            return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent("Token expirado"), request.url), 303);
        }

        // 2. Actualizar contraseña
        const passwordHash = await argon2.hash(parsed.password);

        await sql`
      UPDATE users 
      SET password_hash = ${passwordHash} 
      WHERE id = ${reset.user_id}
    `;

        // 3. Marcar token como usado
        await sql`
      UPDATE password_resets 
      SET used_at = NOW() 
      WHERE token = ${parsed.token}
    `;

        // 4. Redirigir a login
        return Response.redirect(new URL("/auth/login?success=password_reset", request.url), 303);

    } catch (error) {
        console.error("Error en reset-password:", error);
        const token = (await request.formData()).get("token");
        return Response.redirect(new URL(`/auth/reset-password?token=${token}&error=` + encodeURIComponent("Error al restablecer contraseña"), request.url), 303);
    }
};
