import type { APIRoute } from "astro";
import { createGoal } from "@lib/goals";
import { setRLSUser } from "@lib/db";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const userId = locals.userId;
        if (!userId) return new Response("Unauthorized", { status: 401 });
        await setRLSUser(userId);

        const formData = await request.formData();
        const goal = {
            user_id: userId,
            name: formData.get("name") as string,
            target_amount: Number(formData.get("target_amount")),
            current_amount: Number(formData.get("current_amount") || 0),
            currency: formData.get("currency") as 'COP' | 'USD',
            target_date: formData.get("target_date") as string || null,
            color: formData.get("color") as string,
            icon: formData.get("icon") as string
        };

        if (!goal.name || !goal.target_amount) {
            return new Response("Missing fields", { status: 400 });
        }

        await createGoal(goal);

        return Response.redirect(new URL("/dashboard/goals?success=created", request.url), 302);
    } catch (error) {
        return handleApiError({ error, logMsg: "Create Goal Error", type: "/dashboard/goals" });
    }
}
