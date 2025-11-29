// src/pages/api/accounts/[id].ts
import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const account = await sql`
      SELECT id, name, type, currency 
      FROM accounts 
      WHERE id = ${id}
    `;
    
    if (account.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(account[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error fetching account" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const { name, type, currency } = await request.json();

    if (!name || !type || !currency) {
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
      UPDATE accounts 
      SET name = ${name}, type = ${type}, currency = ${currency}
      WHERE id = ${id}
      RETURNING id, name, type, currency
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error updating account" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const result = await sql`
      DELETE FROM accounts 
      WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error deleting account" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};