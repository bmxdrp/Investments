import type { NeonQueryFunction } from "@neondatabase/serverless";
import { asRows } from "@lib/db";

export async function getPortfolioValueCOP(sql: NeonQueryFunction<any, any>) {
  const accounts = asRows<{ id: number; currency: string }>(
    await sql`SELECT id, currency FROM accounts;`
  );

  // Obtener la tasa de cambio más reciente
  const rates = asRows<{ usd_to_cop: string | number }>(
    await sql`
      SELECT usd_to_cop
      FROM exchange_rates
      ORDER BY date DESC
      LIMIT 1;
    `
  );

  // Convertir string a número (PostgreSQL devuelve NUMERIC como string)
  const usdToCop = parseFloat(String(rates[0]?.usd_to_cop ?? "0"));

  let total = 0;

  for (const acc of accounts) {
    const pv = asRows<{ value: string | number }>(
      await sql`
        SELECT value
        FROM portfolio_values
        WHERE account_id = ${acc.id}
        ORDER BY date DESC
        LIMIT 1;
      `
    );

    if (pv.length === 0) continue;

    // Convertir value a número (también puede venir como string)
    let value = parseFloat(String(pv[0].value));
    
    // Convertir USD a COP usando la tasa actual
    if (acc.currency === "USD") {
      value *= usdToCop;
    }

    total += value;
  }
  
  return total;
}

/**
 * Obtiene el valor histórico del portafolio en COP para una fecha específica
 * Útil para calcular retornos históricos con tasas de cambio correctas
 */
export async function getPortfolioValueCOPAtDate(
  sql: NeonQueryFunction<any, any>,
  date: string
) {
  const accounts = asRows<{ id: number; currency: string }>(
    await sql`SELECT id, currency FROM accounts;`
  );

  // Obtener la tasa de cambio para esa fecha específica
  const rates = asRows<{ usd_to_cop: string | number }>(
    await sql`
      SELECT usd_to_cop
      FROM exchange_rates
      WHERE date <= ${date}
      ORDER BY date DESC
      LIMIT 1;
    `
  );

  const usdToCop = parseFloat(String(rates[0]?.usd_to_cop ?? "0"));

  let total = 0;

  for (const acc of accounts) {
    const pv = asRows<{ value: string | number }>(
      await sql`
        SELECT value
        FROM portfolio_values
        WHERE account_id = ${acc.id}
        AND date <= ${date}
        ORDER BY date DESC
        LIMIT 1;
      `
    );

    if (pv.length === 0) continue;

    let value = parseFloat(String(pv[0].value));
    
    if (acc.currency === "USD") {
      value *= usdToCop;
    }

    total += value;
  }
  
  return total;
}

/**
 * Optimización: Obtiene el valor del portafolio con una sola query
 * Mucho más eficiente que el loop anterior
 */
export async function getPortfolioValueCOPOptimized(
  sql: NeonQueryFunction<any, any>
) {
  const result = asRows<{ total: string | number }>(
    await sql`
      WITH latest_rates AS (
        SELECT usd_to_cop
        FROM exchange_rates
        ORDER BY date DESC
        LIMIT 1
      ),
      latest_values AS (
        SELECT DISTINCT ON (account_id)
          pv.account_id,
          pv.value,
          a.currency
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ORDER BY pv.account_id, pv.date DESC
      )
      SELECT COALESCE(SUM(
        CASE 
          WHEN lv.currency = 'USD' THEN lv.value * lr.usd_to_cop
          ELSE lv.value
        END
      ), 0) as total
      FROM latest_values lv
      CROSS JOIN latest_rates lr;
    `
  );

  return parseFloat(String(result[0]?.total ?? "0"));
}