import type { APIRoute } from "astro";
import { setRLSUser, sql } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
    const { params, locals } = context;
    const userId = locals.userId;
    const userRole = locals.userRole;

    try {
        // 🔒 Validar CSRF
        // Este endpoint devuelve redirects, por lo que validateCsrf puede encargarse de redirigir si falla.
        // Asumimos un contexto de formulario HTML.
        const csrfResult = await validateCsrf(context, '/admin/users');
        if (!csrfResult.success) {
            return csrfResult.response!;
        }

        // Verificar autenticación y permisos de admin
        if (!userId || userRole !== 'admin') {
            return new Response(JSON.stringify({ error: "No autorizado" }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { id } = params;

        if (!id) {
            return Response.redirect(new URL(`/admin/users?error=${encodeURIComponent("ID de usuario requerido")}`, context.request.url), 302);
        }

        // Establecer contexto de usuario para RLS
        await setRLSUser(userId);

        // Verificar que el usuario no se esté eliminando a sí mismo
        if (id === userId) {
            return Response.redirect(new URL(`/admin/users?error=${encodeURIComponent("No puedes eliminarte a ti mismo")}`, context.request.url), 302);
        }

        // Verificar que el usuario existe
        const userToDelete = await sql`
        SELECT id, email FROM users WHERE id = ${id}
        `;

        if (userToDelete.length === 0) {
            return Response.redirect(new URL(`/admin/users?error=${encodeURIComponent("Usuario no encontrado")}`, context.request.url), 302);
        }

        // Eliminar sesiones del usuario
        await sql`DELETE FROM sessions WHERE user_id = ${id}`;

        // Eliminar el usuario
        await sql`DELETE FROM users WHERE id = ${id}`;
        return Response.redirect(new URL(`/admin/users?success=${encodeURIComponent("Usuario eliminado exitosamente")}`, context.request.url), 302);

    } catch (error) {
        return handleApiError({
            error,
            logMsg: "Error deleting user",
            type: "/admin/users" // Redirect con error genérico
        });
    }
};
