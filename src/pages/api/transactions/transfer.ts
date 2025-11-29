// src/pages/api/transactions/transfer.ts
import type { APIRoute } from "astro";
import { sql } from "@lib/db";
import { getLatestExchangeRate } from "@lib/finance";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.userId;
    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/transfer" },
      });
    }

    const formData = await request.formData();
    const fromAccountId = Number(formData.get("from_account_id"));
    const toAccountId = Number(formData.get("to_account_id"));
    const amount = Number(formData.get("amount")); // Monto en moneda de origen
    const date = String(formData.get("date")) || new Date().toISOString().slice(0, 10);
    const description = String(formData.get("note") || "") || null;

    // 1. Validaciones Básicas
    if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
      throw new Error("Datos inválidos");
    }

    if (fromAccountId === toAccountId) {
      throw new Error("La cuenta de origen y destino no pueden ser la misma");
    }

    // 2. Obtener información de las cuentas
    const accounts = await sql`
      SELECT id, currency, name 
      FROM accounts 
      WHERE id IN (${fromAccountId}, ${toAccountId}) AND user_id = ${userId}
    `;

    const fromAccount = accounts.find(a => a.id === fromAccountId);
    const toAccount = accounts.find(a => a.id === toAccountId);

    if (!fromAccount || !toAccount) {
      throw new Error("Una de las cuentas no existe o no te pertenece");
    }

    // 3. Obtener tasa de cambio actual
    const latestRate = await getLatestExchangeRate();
    const currentUsdRate = latestRate?.usd_to_cop || 4000; // Fallback seguro

    // 4. Calcular monto de destino (Conversión de Divisas)
    let finalAmount = amount;
    let exchangeRateUsed = null;

    if (fromAccount.currency !== toAccount.currency) {
      if (fromAccount.currency === 'USD' && toAccount.currency === 'COP') {
        // USD -> COP
        finalAmount = amount * currentUsdRate;
        exchangeRateUsed = currentUsdRate;
      } else if (fromAccount.currency === 'COP' && toAccount.currency === 'USD') {
        // COP -> USD
        finalAmount = amount / currentUsdRate;
        exchangeRateUsed = currentUsdRate;
      }
    }

    // 5. Obtener balances anteriores
    const lastFrom = await sql`
      SELECT new_value FROM transactions 
      WHERE account_id = ${fromAccountId} 
      ORDER BY date DESC, created_at DESC, id DESC LIMIT 1
    `;
    const prevFrom = lastFrom.length ? Number(lastFrom[0].new_value) : 0;

    const lastTo = await sql`
      SELECT new_value FROM transactions 
      WHERE account_id = ${toAccountId} 
      ORDER BY date DESC, created_at DESC, id DESC LIMIT 1
    `;
    const prevTo = lastTo.length ? Number(lastTo[0].new_value) : 0;

    // Validar fondos suficientes
    if (prevFrom < amount) {
      throw new Error(`Fondos insuficientes en ${fromAccount.name}. Disponible: ${prevFrom} ${fromAccount.currency}`);
    }

    // 6. Ejecutar Transacción (Atomicidad simulada)
    // Insertar Salida (Transfer Out)
    const outResult = await sql`
      INSERT INTO transactions (
        user_id, account_id, type, amount, currency, date, description,
        previous_value, new_value, related_account_id, usd_to_cop_rate, created_at
      ) VALUES (
        ${userId}, ${fromAccountId}, 'transfer_out', ${amount}, ${fromAccount.currency}, ${date}, 
        ${description || `Transferencia a ${toAccount.name}`},
        ${prevFrom}, ${prevFrom - amount}, ${toAccountId}, ${exchangeRateUsed}, NOW()
      )
      RETURNING id
    `;
    const outId = outResult[0].id;

    // Insertar Entrada (Transfer In)
    const inResult = await sql`
      INSERT INTO transactions (
        user_id, account_id, type, amount, currency, date, description,
        previous_value, new_value, related_account_id, related_transaction_id, usd_to_cop_rate, created_at
      ) VALUES (
        ${userId}, ${toAccountId}, 'transfer_in', ${finalAmount}, ${toAccount.currency}, ${date}, 
        ${description || `Transferencia desde ${fromAccount.name}`},
        ${prevTo}, ${prevTo + finalAmount}, ${fromAccountId}, ${outId}, ${exchangeRateUsed}, NOW()
      )
      RETURNING id
    `;
    const inId = inResult[0].id;

    // Actualizar referencia cruzada en la salida
    await sql`
      UPDATE transactions 
      SET related_transaction_id = ${inId} 
      WHERE id = ${outId}
    `;

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/transfer?success=1" },
    });

  } catch (err: any) {
    console.error("Transfer Error:", err);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/admin/transfer?error=" + encodeURIComponent(err.message || "Error en la transferencia"),
      },
    });
  }
};
