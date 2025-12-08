// src/pages/api/portfolio-values/[id].ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const userId = locals.userId as string;
    if (userId) {
      await setRLSUser(userId);
    }

    const { id } = params;
    // NOTA: Este endpoint consulta la tabla 'portfolio_values' antigua.
    // Si la migración a 'transactions' fue completa, este endpoint podría estar obsoleto.

    // Primero verificamos si existen columnas, si falla SQL es porque la tabla no existe o cambió schema.
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
      ${userId ? sql`AND a.user_id = ${userId}` : sql``}
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
    return handleApiError({ error, logMsg: "Error fetching portfolio value", type: "json" });
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
    // ✅ Usar jsonBody
    const body = csrfResult.jsonBody;
    const { account_id, date, value, currency } = body || {};

    if (!account_id || !date || !value || !currency) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(JSON.stringify({ error: "Invalid currency" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const result = await sql`
      UPDATE portfolio_values
      SET account_id = ${account_id}, date = ${date}, value = ${value}, currency = ${currency}
      WHERE id = ${id}
      RETURNING id, account_id, date, value, currency
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio value not found or access denied" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result[0]), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return handleApiError({ error, logMsg: "Error updating portfolio value", type: "json" });
  }
};

export const DELETE: APIRoute = async (context) => {
  const { params, locals } = context;
  try {
    // 🔒 Validar CSRF (headers)
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) return csrfResult.response!;

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    await setRLSUser(userId);

    const { id } = params;
    const result = await sql`
      DELETE FROM portfolio_values
      WHERE id = ${id}
      RETURNING id
    `;

    if (result.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio value not found or access denied" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return handleApiError({ error, logMsg: "Error deleting portfolio value", type: "json" });
  }
};