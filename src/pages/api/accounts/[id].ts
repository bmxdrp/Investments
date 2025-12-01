// src/pages/api/accounts/[id].ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

    const { id } = params;
    const account = await sql`
      SELECT id, name, type, currency 
      FROM accounts 
      WHERE id = ${id} AND user_id = ${userId}
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

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

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
      WHERE id = ${id} AND user_id = ${userId}
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

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

    const { id } = params;
    const result = await sql`
      DELETE FROM accounts 
      WHERE id = ${id} AND user_id = ${userId}
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