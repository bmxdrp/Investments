// src/pages/api/accounts/index.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

    const accounts = await sql`
      SELECT id, name, type, currency 
      FROM accounts 
      WHERE user_id = ${userId}
      ORDER BY id DESC
    `;

    return new Response(JSON.stringify(accounts), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error fetching accounts" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

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
      INSERT INTO accounts (name, type, currency, user_id)
      VALUES (${name}, ${type}, ${currency}, ${userId})
      RETURNING id, name, type, currency
    `;

    return new Response(JSON.stringify(result[0]), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error creating account" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};