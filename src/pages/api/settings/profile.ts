import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const userId = locals.userId;
        if (!userId) return new Response("Unauthorized", { status: 401 });
        await setRLSUser(userId);

        const formData = await request.formData();
        const name = formData.get("name") as string;

        if (!name || name.trim().length === 0) {
            return new Response("Nombre inválido", { status: 400 });
        }

        await sql`
            UPDATE users 
            SET name = ${name}, updated_at = NOW()
            WHERE id = ${userId}
        `;

        return Response.redirect(new URL("/dashboard/settings?success=profile_updated", request.url), 302);
    } catch (error) {
        return handleApiError({ error, logMsg: "Update Profile Error", type: "/dashboard/settings" });
    }
}
