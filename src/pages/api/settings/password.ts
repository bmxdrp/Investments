import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { handleApiError } from "@lib/error-handler";
import argon2 from "argon2";

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const userId = locals.userId;
        if (!userId) return new Response("Unauthorized", { status: 401 });
        await setRLSUser(userId);

        const formData = await request.formData();
        const currentPassword = formData.get("current_password") as string;
        const newPassword = formData.get("new_password") as string;
        const confirmPassword = formData.get("confirm_password") as string;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return Response.redirect(new URL("/dashboard/settings?error=Faltan campos", request.url), 302);
        }

        if (newPassword !== confirmPassword) {
            return Response.redirect(new URL("/dashboard/settings?error=Las contraseñas no coinciden", request.url), 302);
        }

        if (newPassword.length < 8) {
            return Response.redirect(new URL("/dashboard/settings?error=La contraseña es muy corta", request.url), 302);
        }

        // Verificar contraseña actual
        const user = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
        if (user.length === 0) return new Response("User not found", { status: 404 });

        const valid = await argon2.verify(user[0].password_hash, currentPassword);
        if (!valid) {
            return Response.redirect(new URL("/dashboard/settings?error=Contraseña actual incorrecta", request.url), 302);
        }

        // Actualizar
        const newHash = await argon2.hash(newPassword);
        await sql`
            UPDATE users 
            SET password_hash = ${newHash}, updated_at = NOW()
            WHERE id = ${userId}
        `;

        return Response.redirect(new URL("/dashboard/settings?success=password_updated", request.url), 302);
    } catch (error) {
        return handleApiError({ error, logMsg: "Update Password Error", type: "/dashboard/settings" });
    }
}
