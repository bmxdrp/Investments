import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
    try {
        // Fetch account details
        const accounts = await sql`
      SELECT id, name, currency FROM accounts ORDER BY id;
    `;

        const historyByAccount: Record<string, any> = {};

        for (const account of accounts) {
            const history = await sql`
        SELECT date, value, currency
        FROM account_value_history
        WHERE account_id = ${account.id}
        ORDER BY date ASC;
      `;

            historyByAccount[account.id] = {
                name: account.name,
                currency: account.currency,
                data: history.map(h => ({
                    date: h.date,
                    value: parseFloat(h.value)
                }))
            };
        }

        return new Response(JSON.stringify(historyByAccount), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Error fetching portfolio history:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
