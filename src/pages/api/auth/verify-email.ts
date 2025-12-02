import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async ({ url }) => {
    try {
        const token = url.searchParams.get("token");

        if (!token) {
            return Response.redirect(new URL("/auth/verify-email?error=" + encodeURIComponent("Token inválido"), url), 303);
        }

        // Buscar token válido
        const verifications = await sql`
      SELECT user_id, expires_at 
      FROM email_verifications 
      WHERE token = ${token}
      LIMIT 1
    `;

        if (verifications.length === 0) {
            return Response.redirect(new URL("/auth/verify-email?token=" + token + "&error=" + encodeURIComponent("Token inválido o ya usado"), url), 303);
        }

        const verification = verifications[0];

        // Verificar expiración
        if (new Date(verification.expires_at) < new Date()) {
            return Response.redirect(new URL("/auth/verify-email?token=" + token + "&error=" + encodeURIComponent("Token expirado"), url), 303);
        }

        // Marcar email como verificado
        await sql`
      UPDATE users 
      SET email_verified_at = NOW() 
      WHERE id = ${verification.user_id}
    `;

        // Eliminar token usado
        await sql`
      DELETE FROM email_verifications 
      WHERE token = ${token}
    `;

        // Redirigir a login con mensaje de éxito
        return Response.redirect(new URL("/auth/login?success=email_verified", url), 303);

    } catch (error) {
        console.error("Error en verify-email:", error);
        return Response.redirect(new URL("/auth/verify-email?error=" + encodeURIComponent("Error al verificar el correo"), url), 303);
    }
};
