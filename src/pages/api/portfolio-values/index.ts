// src/pages/api/portfolio-values/index.ts
import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  try {
    const values = await sql`
      SELECT 
        pv.id,
        pv.account_id,
        pv.date,
        pv.value,
        pv.currency,
        a.name as account_name,
        a.type as account_type
      FROM portfolio_values pv
      JOIN accounts a ON pv.account_id = a.id
      ORDER BY pv.date DESC, a.name
    `;
    
    return new Response(JSON.stringify(values), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error fetching portfolio values" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { account_id, date, value, currency } = await request.json();
    
    if (!account_id || !date || !value || !currency) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(JSON.stringify({ error: "Invalid currency" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await sql`
      INSERT INTO portfolio_values (account_id, date, value, currency)
      VALUES (${account_id}, ${date}, ${value}, ${currency})
      RETURNING id, account_id, date, value, currency
    `;

    return new Response(JSON.stringify(result[0]), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error creating portfolio value" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};