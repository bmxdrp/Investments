import type { NeonQueryFunction } from "@neondatabase/serverless";
import { asRows } from "@lib/db";


export async function getPortfolioValueCOP(sql: NeonQueryFunction<any, any>) {
  const accounts = asRows<{ id: number; currency: string }>(
    await sql`SELECT id, currency FROM accounts;`
  );

  const rates = asRows<{ usd_to_cop: number }>(
    await sql`
      SELECT usd_to_cop
      FROM exchange_rates
      ORDER BY date DESC
      LIMIT 1;
    `
  );

  const usdToCop = Number(rates[0]?.usd_to_cop ?? 0);

  let total = 0;

  for (const acc of accounts) {
    const pv = asRows<{ value: number }>(
      await sql`
        SELECT value
        FROM portfolio_values
        WHERE account_id = ${acc.id}
        ORDER BY date DESC
        LIMIT 1;
      `
    );

    if (pv.length === 0) continue;

    let value = Number(pv[0].value);
    if (acc.currency === "USD") value *= usdToCop;

    total += value;
  }

  return total;
}
