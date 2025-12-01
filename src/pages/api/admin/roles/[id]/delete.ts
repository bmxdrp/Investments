import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
    const userId = locals.userId;
    const userRole = locals.userRole;

    // Verificar autenticación y permisos de admin
    if (!userId || userRole !== 'admin') {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { id } = params;

    if (!id) {
        return new Response(JSON.stringify({ error: "ID de rol requerido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // Establecer contexto de usuario para RLS
        await sql.unsafe(`SET app.user_id = '${userId}'`);

        // Verificar que el rol existe
        const roleToDelete = await sql`
      SELECT id, name FROM roles WHERE id = ${id}
    `;

        if (roleToDelete.length === 0) {
            return redirect(`/admin/roles?error=${encodeURIComponent("Rol no encontrado")}`);
        }

        const roleName = roleToDelete[0].name;

        // Prevenir eliminación de roles del sistema
        if (roleName === 'admin' || roleName === 'user') {
            return redirect(`/admin/roles?error=${encodeURIComponent("No se pueden eliminar los roles del sistema (admin, user)")}`);
        }

        // Verificar si hay usuarios con este rol
        const usersWithRole = await sql`
      SELECT COUNT(*) as count FROM users WHERE role_id = ${id}
    `;

        if (parseInt(usersWithRole[0].count) > 0) {
            return redirect(`/admin/roles?error=${encodeURIComponent("No se puede eliminar un rol que tiene usuarios asignados")}`);
        }

        // Eliminar el rol
        await sql`DELETE FROM roles WHERE id = ${id}`;

        console.log(`Role ${roleName} deleted by admin ${userId}`);

        return redirect(`/admin/roles?success=${encodeURIComponent("Rol eliminado exitosamente")}`);
    } catch (error) {
        console.error("Error deleting role:", error);
        return redirect(`/admin/roles?error=${encodeURIComponent("Error al eliminar el rol")}`);
    }
};
