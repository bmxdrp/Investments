// src/pages/api/contribute.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { getLatestExchangeRate } from "@lib/finance";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/contribute" },
      });
    }
    await setRLSUser(userId);

    const formData = await request.formData();
    const accountId = Number(formData.get("account_id"));
    const amount = Number(formData.get("amount"));
    const currency = String(formData.get("currency") || "COP").toUpperCase();
    const date = String(formData.get("date")) || new Date().toISOString().slice(0, 10);
    const description = String(formData.get("note") || "") || null;

    // Validaciones
    if (!accountId || !amount || amount <= 0) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/contribute?error=" + encodeURIComponent("Datos inválidos")
        },
      });
    }

    // Validar que la cuenta existe y pertenece al usuario
    const accountCheck = await sql`
      SELECT id, currency
      FROM accounts
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    if (accountCheck.length === 0) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/contribute?error=" + encodeURIComponent("Cuenta no encontrada")
        },
      });
    }

    const accountCurrency = accountCheck[0].currency;

    // Validar que la moneda coincide con la cuenta
    if (currency !== accountCurrency) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/contribute?error=" + encodeURIComponent(
            `La cuenta es en ${accountCurrency}, no puedes aportar en ${currency}`
          )
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
            Location: "/dashboard/contribute?error=" + encodeURIComponent(
              "No hay tasa de cambio registrada. Por favor, registra una tasa primero."
            )
          },
        });
      }
      usd_to_cop_rate = latestRate.usd_to_cop;
    }

    // ✅ Obtener el último balance de la cuenta (previous_value)
    const lastTransaction = await sql`
      SELECT new_value
      FROM transactions
      WHERE account_id = ${accountId}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;

    const previous_value = lastTransaction.length
      ? Number(lastTransaction[0].new_value)
      : 0;

    // ✅ Calcular nuevo balance (contribution = suma)
    const new_value = previous_value + amount;

    // ✅ Insertar transacción tipo 'contribution'
    await sql`
      INSERT INTO transactions (
        user_id,
        account_id,
        type,
        amount,
        currency,
        date,
        notes,
        previous_value,
        new_value,
        usd_to_cop_rate,
        created_at,
        updated_at
      ) VALUES (
        ${userId},
        ${accountId},
        'contribution',
        ${amount},
        ${currency},
        ${date},
        ${description},
        ${previous_value},
        ${new_value},
        ${usd_to_cop_rate},
        NOW(),
        NOW()
      )
    `;

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/contribute?success=1" },
    });

  } catch (err: any) {
    console.error("❌ Error en contribute endpoint:", err);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/dashboard/contribute?error=" + encodeURIComponent(
          err.message || "Error al registrar aporte"
        ),
      },
    });
  }
};