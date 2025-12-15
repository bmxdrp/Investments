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
        const csrfResult = await validateCsrf(context, '/admin/roles');
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
            return Response.redirect(new URL(`/admin/roles?error=${encodeURIComponent("ID de rol requerido")}`, context.request.url), 302);
        }

        // Establecer contexto de usuario para RLS
        await setRLSUser(userId);

        // Verificar que el rol existe
        const roleToDelete = await sql`
            SELECT id, name FROM roles WHERE id = ${id}
        `;

        if (roleToDelete.length === 0) {
            return Response.redirect(new URL(`/admin/roles?error=${encodeURIComponent("Rol no encontrado")}`, context.request.url), 302);
        }

        const roleName = roleToDelete[0].name;

        // Prevenir eliminación de roles del sistema
        if (roleName === 'admin' || roleName === 'user') {
            return Response.redirect(new URL(`/admin/roles?error=${encodeURIComponent("No se pueden eliminar los roles del sistema (admin, user)")}`, context.request.url), 302);
        }

        // Verificar si hay usuarios con este rol
        const usersWithRole = await sql`
            SELECT COUNT(*) as count FROM users WHERE role_id = ${id}
        `;

        if (parseInt(usersWithRole[0].count) > 0) {
            return Response.redirect(new URL(`/admin/roles?error=${encodeURIComponent("No se puede eliminar un rol que tiene usuarios asignados")}`, context.request.url), 302);
        }

        // Eliminar el rol
        await sql`DELETE FROM roles WHERE id = ${id}`;
        return Response.redirect(new URL(`/admin/roles?success=${encodeURIComponent("Rol eliminado exitosamente")}`, context.request.url), 302);

    } catch (error) {
        return handleApiError({
            error,
            logMsg: "Error deleting role",
            type: "/admin/roles"
        });
    }
};
