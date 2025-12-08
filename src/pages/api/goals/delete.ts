import type { APIRoute } from "astro";
import { deleteGoal } from "@lib/goals";
import { setRLSUser } from "@lib/db";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const userId = locals.userId;
        if (!userId) return new Response("Unauthorized", { status: 401 });
        await setRLSUser(userId);

        const formData = await request.formData();
        const id = Number(formData.get("id"));

        if (!id) {
            return new Response("Invalid ID", { status: 400 });
        }

        await deleteGoal(id, userId);

        return Response.redirect(new URL("/dashboard/goals?success=deleted", request.url), 302);
    } catch (error) {
        return handleApiError({ error, logMsg: "Delete Goal Error", type: "/dashboard/goals" });
    }
}
