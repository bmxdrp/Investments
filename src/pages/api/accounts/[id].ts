// src/pages/api/accounts/[id].ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

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
    return handleApiError({
      error,
      logMsg: "Error fetching account",
      type: "json",
      status: 500
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const { params, locals } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) return csrfResult.response!;

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    await setRLSUser(userId);

    const { id } = params;
    // ✅ Usamos jsonBody para no re-leer el stream
    const body = csrfResult.jsonBody;
    const { name, type, currency } = body || {};

    if (!name || !type || !currency) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(JSON.stringify({ error: "Invalid currency" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const result = await sql`
      UPDATE accounts 
      SET name = ${name}, type = ${type}, currency = ${currency}
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, name, type, currency
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result[0]), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return handleApiError({ error, logMsg: "Error updating account", type: "json", status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const { params, locals } = context;
  try {
    // 🔒 Validar CSRF
    // DELETE puede no tener body, pero validateCsrf ahora busca en headers 'X-CSRF-Token'.
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) return csrfResult.response!;

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    await setRLSUser(userId);

    const { id } = params;
    const result = await sql`
      DELETE FROM accounts 
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Account not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return handleApiError({ error, logMsg: "Error deleting account", type: "json", status: 500 });
  }
};