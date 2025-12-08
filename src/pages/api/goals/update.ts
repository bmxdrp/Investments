import type { APIRoute } from "astro";
import { updateGoalAmount } from "@lib/goals";
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
        const current_amount = Number(formData.get("current_amount"));

        if (!id || isNaN(current_amount)) {
            return new Response("Invalid data", { status: 400 });
        }

        await updateGoalAmount(id, userId, current_amount);

        return Response.redirect(new URL("/dashboard/goals?success=updated", request.url), 302);
    } catch (error) {
        return handleApiError({ error, logMsg: "Update Goal Error", type: "/dashboard/goals" });
    }
}
