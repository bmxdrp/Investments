// src/pages/api/portfolio-values/index.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { registerAccountValue, getLatestExchangeRate, getAllAccountBalances } from "@lib/finance";

/**
 * ✅ GET: Historial de valores (solo ajustes, ganancias, pérdidas, iniciales)
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    const userId = locals.userId as string;
    if (userId) {
      await setRLSUser(userId);
    }

    const values = await sql`
      SELECT 
        t.id,
        t.account_id,
        t.user_id,
        t.date,
        t.created_at,
        t.amount AS value,
        t.currency,
        t.usd_to_cop_rate,
        t.previous_value,
        t.new_value,
        a.name AS account_name,
        a.type AS account_type
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.type IN ('adjustment', 'gain', 'loss', 'initial_balance')
      ${userId ? sql`AND t.user_id = ${userId}` : sql``}
      ORDER BY t.date DESC, t.created_at DESC, a.name
    `;

    return new Response(JSON.stringify(values), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("GET portfolio-values error:", error);
    return new Response(
      JSON.stringify({ error: "Error fetching portfolio values" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/**
 * ✅ POST: Registrar ajuste manual como transaction
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.userId as string;

    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/activity" },
      });
    }
    await setRLSUser(userId);

    // Parsear JSON o FormData
    let data: any;
    const contentType = request.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      data = await request.json();
    } else {
      const formData = await request.formData();
      data = {
        account_id: Number(formData.get("account_id")),
        user_id: formData.get("user_id") || userId,
        date: formData.get("date"),
        amount: Number(formData.get("value")),
        currency: formData.get("currency"),
        usd_to_cop_rate: Number(formData.get("usd_to_cop_rate")),
        previous_value: Number(formData.get("previous_value")),
      };
    }

    const {
      account_id,
      date,
      amount,
      currency,
      usd_to_cop_rate,
      previous_value
    } = data;

    // Validaciones básicas
    if (!account_id || !date || !amount || !currency) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(
        JSON.stringify({ error: "Moneda inválida" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (amount < 0 || (previous_value ?? 0) < 0) {
      return new Response(
        JSON.stringify({ error: "Los valores no pueden ser negativos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Registrar ajuste en transactions
    const newTransaction = await registerAccountValue({
      account_id,
      type: "adjustment",
      amount,
      currency,
      date,
      notes: "Ajuste manual por usuario",
      previous_value: previous_value ?? 0,
      new_value: amount,
      user_id: userId,
      usd_to_cop_rate: usd_to_cop_rate || null
    });

    // Redirigir con éxito
    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/activity?success=1" }
    });

  } catch (error: any) {
    console.error("POST portfolio-values error:", error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/dashboard/activity?error=" + encodeURIComponent(error.message || "Error al guardar")
      }
    });
  }
};