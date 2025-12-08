// src/pages/api/transactions/contribute.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { getLatestExchangeRate } from "@lib/finance";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context, '/dashboard/contribute');
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/contribute" },
      });
    }
    await setRLSUser(userId);

    const formData = csrfResult.formData!;
    const accountId = Number(formData.get("account_id"));
    const amount = Number(formData.get("amount"));
    const currency = String(formData.get("currency") || "COP").toUpperCase();
    const date = String(formData.get("date")) || new Date().toISOString().slice(0, 10);
    const description = String(formData.get("note") || "") || null;
    const categoryId = Number(formData.get("category_id")) || null; // NEW

    // Validaciones básicas
    if (!accountId || !amount || amount <= 0) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/contribute?error=" + encodeURIComponent("Datos inválidos") },
      });
    }

    // Validar que la cuenta existe y pertenece al usuario
    const accountCheck = await sql`
      SELECT id, currency
      FROM accounts
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    if (accountCheck.length === 0) {
      return new Response(null, { status: 302, headers: { Location: "/dashboard/contribute?error=Cuenta_No_Encontrada" } });
    }

    const accountCurrency = accountCheck[0].currency;

    if (currency !== accountCurrency) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/contribute?error=" + encodeURIComponent(`La cuenta es en ${accountCurrency}, no puedes aportar en ${currency}`)
        },
      });
    }

    // ✅ Obtener tasa de cambio si es USD
    let usd_to_cop_rate: number | null = null;
    if (currency === "USD") {
      const latestRate = await getLatestExchangeRate();
      if (!latestRate) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/dashboard/contribute?error=" + encodeURIComponent("No hay tasa de cambio registrada.")
          },
        });
      }
      usd_to_cop_rate = latestRate.usd_to_cop;
    }

    // ✅ Obtener el último balance
    const lastTransaction = await sql`
      SELECT new_value
      FROM transactions
      WHERE account_id = ${accountId}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;

    const previous_value = lastTransaction.length ? Number(lastTransaction[0].new_value) : 0;
    const new_value = previous_value + amount;

    // ✅ Insertar transacción con CATEGORY_ID
    await sql`
      INSERT INTO transactions (
        user_id, account_id, category_id, type, amount, currency, date, notes,
        previous_value, new_value, usd_to_cop_rate, created_at, updated_at
      ) VALUES (
        ${userId}, ${accountId}, ${categoryId}, 'contribution', ${amount}, ${currency}, ${date}, ${description},
        ${previous_value}, ${new_value}, ${usd_to_cop_rate}, NOW(), NOW()
      )
    `;

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/contribute?success=1" },
    });

  } catch (err: any) {
    return handleApiError({
      error: err,
      logMsg: "Error en endpoint contribute",
      type: "/dashboard/contribute"
    });
  }
};