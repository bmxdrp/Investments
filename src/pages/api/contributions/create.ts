import type { APIRoute } from "astro";
import { asRows, sql } from "@lib/db";

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();

    const accountId = Number(form.get("account_id"));
    const date = String(form.get("date"));
    const amount = Number(form.get("amount"));
    const currency = String(form.get("currency"));
    const note = String(form.get("note") ?? "");

    // 1. Insertar contribución
    await sql`
      INSERT INTO contributions (account_id, date, amount, currency, note)
      VALUES (${accountId}, ${date}, ${amount}, ${currency}, ${note});
    `;

    // 2. Obtener último valor del portafolio
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

    // 3. Calcular nuevo valor
    const newValue = lastValue + amount;

    // 4. Ver si ya existe valor para esa fecha (único por account_id + date)
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

    return Response.redirect("/admin?contribution_success=1", 303);


  } catch (err: any) {
    console.error("Error creating contribution:", err);
    return Response.redirect(new URL("/admin?contribution_success=0&error=" + encodeURIComponent(err.message), request.url), 303);

  }
};