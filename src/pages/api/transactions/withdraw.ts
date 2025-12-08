// src/pages/api/transactions/withdraw.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { getLatestExchangeRate } from "@lib/finance";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context, '/dashboard/withdraw');
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/withdraw" },
      });
    }
    await setRLSUser(userId);

    const formData = csrfResult.formData!;
    const accountId = Number(formData.get("account_id"));
    const amount = Number(formData.get("amount"));
    const date = String(formData.get("date")) || new Date().toISOString().slice(0, 10);
    const description = String(formData.get("note") || "") || null;
    const categoryId = Number(formData.get("category_id")) || null; // NEW: Capturar categoría

    // Validaciones
    if (!accountId || !amount || amount <= 0) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/withdraw?error=" + encodeURIComponent("Datos inválidos") },
      });
    }

    // Validar que la cuenta existe y pertenece al usuario
    const accountCheck = await sql`
      SELECT id, currency
      FROM accounts
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    if (accountCheck.length === 0) {
      return new Response(null, { status: 302, headers: { Location: "/dashboard/withdraw?error=Cuenta_No_Encontrada" } });
    }

    const accountCurrency = accountCheck[0].currency;
    // Nota: Eliminamos la lógica de "currency" del form porque el retiro debe ser en la moneda de la cuenta siempre.
    // O validamos que el currency enviado (si lo hubiera) sea igual.
    const currency = accountCurrency;

    // ✅ Obtener tasa de cambio si es USD
    let usd_to_cop_rate: number | null = null;
    if (currency === "USD") {
      const latestRate = await getLatestExchangeRate();
      if (!latestRate) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/dashboard/withdraw?error=" + encodeURIComponent("No hay tasa de cambio registrada.")
          },
        });
      }
      usd_to_cop_rate = latestRate.usd_to_cop;
    }

    // ✅ Obtener el último balance de la cuenta
    const lastTransaction = await sql`
      SELECT new_value
      FROM transactions
      WHERE account_id = ${accountId}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;

    const previous_value = lastTransaction.length ? Number(lastTransaction[0].new_value) : 0;

    // Validar fondos insuficientes (Backend check)
    if (previous_value < amount) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/withdraw?error=" + encodeURIComponent("Fondos insuficientes") },
      });
    }

    // ✅ Calcular nuevo balance (withdrawal = resta)
    const new_value = previous_value - amount;

    // ✅ Insertar transacción tipo 'withdrawal' con CATEGORÍA
    await sql`
      INSERT INTO transactions (
        user_id, account_id, category_id, type, amount, currency, date, notes,
        previous_value, new_value, usd_to_cop_rate, created_at, updated_at
      ) VALUES (
        ${userId}, ${accountId}, ${categoryId}, 'withdrawal', ${amount}, ${currency}, ${date}, ${description},
        ${previous_value}, ${new_value}, ${usd_to_cop_rate}, NOW(), NOW()
      )
    `;

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/withdraw?withdraw_success=1" },
    });

  } catch (err: any) {
    return handleApiError({
      error: err,
      logMsg: "Error en endpoint withdraw",
      type: "/dashboard/withdraw"
    });
  }
};