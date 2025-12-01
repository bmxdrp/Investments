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
        return new Response(JSON.stringify({ error: "ID de usuario requerido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // Establecer contexto de usuario para RLS
        await sql.unsafe(`SET app.user_id = '${userId}'`);

        // Verificar que el usuario no se esté eliminando a sí mismo
        if (id === userId) {
            return redirect(`/admin/users?error=${encodeURIComponent("No puedes eliminarte a ti mismo")}`);
        }

        // Verificar que el usuario existe
        const userToDelete = await sql`
      SELECT id, email FROM users WHERE id = ${id}
    `;

        if (userToDelete.length === 0) {
            return redirect(`/admin/users?error=${encodeURIComponent("Usuario no encontrado")}`);
        }

        // Eliminar sesiones del usuario
        await sql`DELETE FROM sessions WHERE user_id = ${id}`;

        // Eliminar el usuario
        await sql`DELETE FROM users WHERE id = ${id}`;

        console.log(`User ${userToDelete[0].email} deleted by admin ${userId}`);

        return redirect(`/admin/users?success=${encodeURIComponent("Usuario eliminado exitosamente")}`);
    } catch (error) {
        console.error("Error deleting user:", error);
        return redirect(`/admin/users?error=${encodeURIComponent("Error al eliminar el usuario")}`);
    }
};
