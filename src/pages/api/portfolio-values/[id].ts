// src/pages/api/portfolio-values/[id].ts
import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const value = await sql`
      SELECT 
        pv.id,
        pv.account_id,
        pv.date,
        pv.value,
        pv.currency,
        a.name as account_name
      FROM portfolio_values pv
      JOIN accounts a ON pv.account_id = a.id
      WHERE pv.id = ${id}
    `;
    
    if (value.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio value not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(value[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error fetching portfolio value" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
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
      UPDATE portfolio_values
      SET account_id = ${account_id}, date = ${date}, value = ${value}, currency = ${currency}
      WHERE id = ${id}
      RETURNING id, account_id, date, value, currency
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio value not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error updating portfolio value" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const result = await sql`
      DELETE FROM portfolio_values
      WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio value not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error deleting portfolio value" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};