// src/pages/api/transactions/transfer.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context, '/dashboard/transfer');
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    const userId = locals.userId;
    if (!userId) {
      return new Response("No autorizado", { status: 401 });
    }

    // ✅ RLS
    await setRLSUser(userId as string);

    // ✅ USAMOS FORMDATA (NO JSON)
    const formData = csrfResult.formData!;

    const from_account_id = Number(formData.get("from_account_id"));
    const to_account_id = Number(formData.get("to_account_id"));
    const amount = Number(formData.get("amount"));
    const date =
      String(formData.get("date")) ||
      new Date().toISOString().slice(0, 10);
    const notes = String(formData.get("notes") || "") || null;
    const usd_to_cop = Number(formData.get("usd_to_cop")) || 4000;

    if (!from_account_id || !to_account_id || amount <= 0) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/transfer?error=" + encodeURIComponent("Datos inválidos") }
      });
    }

    if (from_account_id === to_account_id) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/transfer?error=" + encodeURIComponent("No puedes transferir a la misma cuenta") }
      });
    }

    /* ================================
       1️⃣ INICIAR TRANSACCIÓN
    ================================== */
    await sql`BEGIN`;

    /* ================================
       2️⃣ OBTENER CUENTAS (✅ MONEDA REAL)
    ================================== */
    const [fromAccount] = await sql`
      SELECT id, name, currency
      FROM accounts
      WHERE id = ${from_account_id}
        AND user_id = ${userId}
    `;

    const [toAccount] = await sql`
      SELECT id, name, currency
      FROM accounts
      WHERE id = ${to_account_id}
        AND user_id = ${userId}
    `;

    if (!fromAccount || !toAccount) {
      await sql`ROLLBACK`;
      return new Response(null, {
        status: 302,
        headers: { Location: "/dashboard/transfer?error=" + encodeURIComponent("Cuenta no encontrada") }
      });
    }

    /* ================================
       3️⃣ OBTENER BALANCE ACTUAL REAL ✅
    ================================== */
    const [fromBalanceRow] = await sql`
      SELECT COALESCE(new_value, 0) AS balance
      FROM transactions
      WHERE account_id = ${from_account_id}
      AND user_id = ${userId}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `;

    const currentBalanceFrom = Number(fromBalanceRow?.balance || 0);

    /* ================================
       4️⃣ VALIDACIÓN REAL DE FONDOS ✅
    ================================== */
    if (currentBalanceFrom < amount) {
      await sql`ROLLBACK`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard/transfer?error=" + encodeURIComponent(
            `Fondos insuficientes en ${fromAccount.name}. Disponible: ${currentBalanceFrom} ${fromAccount.currency}`
          )
        }
      });
    }

    /* ================================
       5️⃣ BASE PARA RECONSTRUIR HISTÓRICO
    ================================== */
    const [baseFrom] = await sql`
      SELECT COALESCE(new_value, 0) AS value
      FROM transactions
      WHERE account_id = ${from_account_id}
        AND user_id = ${userId}
        AND date < ${date}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;

    const [baseTo] = await sql`
      SELECT COALESCE(new_value, 0) AS value
      FROM transactions
      WHERE account_id = ${to_account_id}
        AND user_id = ${userId}
        AND date < ${date}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;

    const previousFrom = Number(baseFrom?.value || 0);
    const previousTo = Number(baseTo?.value || 0);

    const newFromValue = previousFrom - amount;
    const newToValue = previousTo + amount;

    /* ================================
       6️⃣ INSERTAR TRANSFER_OUT ✅
    ================================== */
    const [fromTx] = await sql`
      INSERT INTO transactions (
        account_id,
        type,
        amount,
        currency,
        date,
        notes,
        previous_value,
        new_value,
        usd_to_cop_rate,
        user_id

      ) VALUES (
        ${from_account_id},
        'transfer_out',
        ${amount},
        ${fromAccount.currency},  -- ✅ MONEDA REAL
        ${date},
        ${notes},
        ${previousFrom},
        ${newFromValue},
        ${usd_to_cop},
        ${userId}
      )
      RETURNING id
    `;

    /* ================================
       7️⃣ INSERTAR TRANSFER_IN ✅
    ================================== */
    const [toTx] = await sql`
      INSERT INTO transactions (
        account_id,
        type,
        amount,
        currency,
        date,
        notes,
        previous_value,
        new_value,
        user_id,
        usd_to_cop_rate,
        related_transaction_id
      ) VALUES (
        ${to_account_id},
        'transfer_in',
        ${amount},
        ${toAccount.currency},  -- ✅ MONEDA REAL
        ${date},
        ${notes},
        ${previousTo},
        ${newToValue},
        ${userId},
        ${usd_to_cop},
        ${fromTx.id}
      )
      RETURNING id
    `;

    await sql`
      UPDATE transactions
      SET related_transaction_id = ${toTx.id}
      WHERE id = ${fromTx.id}
      AND user_id = ${userId}
    `;

    /* ================================
       8️⃣ RECÁLCULO ROBUSTO ✅
    ================================== */
    const recalcAccount = async (accountId: number) => {
      const txs = await sql`
        SELECT id, amount, type
        FROM transactions
        WHERE account_id = ${accountId}
          AND user_id = ${userId}
          AND date >= ${date}
        ORDER BY date ASC, created_at ASC, id ASC
      `;

      const [startBase] = await sql`
        SELECT COALESCE(new_value, 0) AS value
        FROM transactions
        WHERE account_id = ${accountId}
          AND user_id = ${userId}
          AND date < ${date}
        ORDER BY date DESC, created_at DESC, id DESC
        LIMIT 1
      `;

      let running = Number(startBase?.value || 0);

      for (const tx of txs) {
        const amt = Number(tx.amount);
        const prev = running;

        if (
          tx.type === "contribution" ||
          tx.type === "transfer_in" ||
          tx.type === "initial_balance"
        ) {
          running += amt;
        } else {
          running -= amt;
        }

        await sql`
          UPDATE transactions
          SET previous_value = ${prev},
              new_value = ${running}
          WHERE id = ${tx.id}
          AND user_id = ${userId}
        `;
      }
    };

    await recalcAccount(from_account_id);
    await recalcAccount(to_account_id);

    /* ================================
       9️⃣ COMMIT FINAL ✅
    ================================== */
    await sql`COMMIT`;

    return new Response(null, { status: 302, headers: { Location: "/dashboard/transfer?success=1" } });

  } catch (error: any) {
    try { await sql`ROLLBACK`; } catch (e) { console.error('Error in rollback', e); }

    return handleApiError({
      error,
      logMsg: "Transfer Critical Error",
      type: "/dashboard/transfer"
    });
  }
};
