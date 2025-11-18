import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  const rows = await sql`
    SELECT 
      pv.date,
      SUM(
        CASE 
          WHEN pv.currency = 'USD'
            THEN pv.value * (SELECT usd_to_cop FROM exchange_rates WHERE date = pv.date)
          ELSE pv.value
        END
      ) AS total_cop
    FROM portfolio_values pv
    GROUP BY pv.date
    ORDER BY pv.date;
  `;

  return new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json" },
  });
};
