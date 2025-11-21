import type { APIRoute } from "astro";
import { asRows, sql } from "@lib/db";

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();

    const accountId = Number(form.get("account_id"));
    const date = String(form.get("date"));
    const amount = Number(form.get("amount"));
    const note = String(form.get("note") ?? "");

    // Validación: verificar que los campos requeridos estén presentes
    if (!accountId || !date) {
      return Response.redirect(
        new URL("/admin?withdraw_success=0&error=" + encodeURIComponent("Faltan campos requeridos"), request.url),
        303
      );
    }

    // Validación: el monto debe ser positivo
    if (amount <= 0) {
      return Response.redirect(
        new URL("/admin?withdraw_success=0&error=" + encodeURIComponent("El monto debe ser mayor a 0"), request.url),
        303
      );
    }

    // 1. Obtener el currency de la cuenta
    const accountRows = asRows<{ currency: string }>(
      await sql`
        SELECT currency
        FROM accounts
        WHERE id = ${accountId};
      `
    );

    if (accountRows.length === 0) {
      return Response.redirect(
        new URL("/admin?withdraw_success=0&error=" + encodeURIComponent("Cuenta no encontrada"), request.url),
        303
      );
    }

    const currency = accountRows[0].currency;

    // 2. Insertar retiro en la tabla withdraws
    await sql`
      INSERT INTO withdrawals (account_id, date, amount, currency, note)
      VALUES (${accountId}, ${date}, ${amount}, ${currency}, ${note});
    `;

    // 3. Obtener último valor del portafolio
    const lastValueRows = asRows<{ value: number }>(
      await sql`
        SELECT value
        FROM portfolio_values
        WHERE account_id = ${accountId}
        ORDER BY date DESC
        LIMIT 1;
      `
    );

    const lastValue = lastValueRows.length > 0 ? Number(lastValueRows[0].value) : 0;

    // 4. Calcular nuevo valor (restando el retiro)
    const newValue = lastValue - amount;

    // Validación: verificar que no quede saldo negativo
    if (newValue < 0) {
      // Revertir la inserción del retiro
      await sql`
        DELETE FROM withdrawals
        WHERE account_id = ${accountId} 
          AND date = ${date} 
          AND amount = ${amount}
          AND note = ${note}
        ORDER BY id DESC
        LIMIT 1;
      `;

      return Response.redirect(
        new URL("/admin?withdraw_success=0&error=" + encodeURIComponent("Fondos insuficientes"), request.url),
        303
      );
    }

    // 5. Ver si ya existe valor para esa fecha (único por account_id + date)
    const existing = asRows<{ id: number }>(
      await sql`
        SELECT id
        FROM portfolio_values
        WHERE account_id = ${accountId} AND date = ${date};
      `
    );

    if (existing.length > 0) {
      // actualizar
      await sql`
        UPDATE portfolio_values
        SET value = ${newValue}
        WHERE id = ${existing[0].id};
      `;
    } else {
      // insertar
      await sql`
        INSERT INTO portfolio_values (account_id, date, value, currency)
        VALUES (${accountId}, ${date}, ${newValue}, ${currency});
      `;
    }

    return Response.redirect(new URL("/admin?withdraw_success=1", request.url), 303);

  } catch (err: any) {
    console.error("Error creating withdrawal:", err);
    return Response.redirect(
      new URL("/admin?withdraw_success=0&error=" + encodeURIComponent(err.message), request.url),
      303
    );
  }
};