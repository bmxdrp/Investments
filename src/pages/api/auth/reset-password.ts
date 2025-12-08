import type { APIRoute } from "astro";
import { z } from "zod";
import argon2 from "argon2";
import { sql } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

const resetSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(6),
    password_confirm: z.string().min(6),
}).refine((data) => data.password === data.password_confirm, {
    message: "Las contraseñas no coinciden",
    path: ["password_confirm"],
});

export const POST: APIRoute = async (context) => {
    const { request } = context;
    try {
        // 🔒 Validar CSRF
        const csrfResult = await validateCsrf(context, '/auth/reset-password');
        if (!csrfResult.success) {
            return csrfResult.response!;
        }

        const formData = csrfResult.formData!;
        const form = Object.fromEntries(formData);

        // Validación manual simple para redirigir con error legible
        if (form.password !== form.password_confirm) {
            const token = form.token as string;
            return Response.redirect(new URL(`/auth/reset-password?token=${token}&error=` + encodeURIComponent("Las contraseñas no coinciden"), request.url), 303);
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
        if (error instanceof z.ZodError) {
            return Response.redirect(new URL("/auth/login?error=" + encodeURIComponent("Datos inválidos"), request.url), 303);
        }

        return handleApiError({
            error,
            logMsg: "Error en reset-password",
            type: new URL("/auth/login", request.url).toString() // Redirigir a login en error grave
        });
    }
};
