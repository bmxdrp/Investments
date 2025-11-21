import { asRows } from "@lib/db";

/**
 * Obtiene la tasa de cambio más reciente
 */
export async function getLatestExchangeRate(sql) {
  const rates = await sql`
    SELECT usd_to_cop
    FROM exchange_rates
    ORDER BY date DESC
    LIMIT 1;
  `;
  
  return parseFloat(String(rates[0]?.usd_to_cop ?? "0"));
}

/**
 * Obtiene las contribuciones totales del mes actual
 * Usa la tasa de cambio histórica del día del aporte
 */
export async function getMonthlyContributions(sql, month, fallbackRate) {
  const result = await sql`
    SELECT COALESCE(
      SUM(
        CASE 
          WHEN c.currency = 'COP' THEN c.amount
          WHEN c.currency = 'USD' THEN c.amount * COALESCE(
            (SELECT er.usd_to_cop 
             FROM exchange_rates er 
             WHERE er.date <= c.date 
             ORDER BY er.date DESC 
             LIMIT 1),
            ${fallbackRate}::numeric
          )
          ELSE 0
        END
      ), 0) as total
    FROM contributions c
    WHERE c.date >= ${month + '-01'};
  `;
  
  return parseFloat(String(result[0]?.total ?? "0"));
}

/**
 * Obtiene los retiros totales del mes actual
 * Usa la tasa de cambio histórica del día del retiro
 */
export async function getMonthlyWithdrawals(sql, month, fallbackRate) {
  const result = await sql`
    SELECT COALESCE(
      SUM(
        CASE 
          WHEN w.currency = 'COP' THEN w.amount
          WHEN w.currency = 'USD' THEN w.amount * COALESCE(
            (SELECT er.usd_to_cop 
             FROM exchange_rates er 
             WHERE er.date <= w.date 
             ORDER BY er.date DESC 
             LIMIT 1),
            ${fallbackRate}::numeric
          )
          ELSE 0
        END
      ), 0) as total
    FROM withdrawals w
    WHERE w.date >= ${month + '-01'};
  `;
  
  return parseFloat(String(result[0]?.total ?? "0"));
}

/**
 * Obtiene el total histórico de contribuciones
 * Usa la tasa de cambio histórica del día del aporte
 */
export async function getTotalContributions(sql, fallbackRate) {
  const result = await sql`
    SELECT COALESCE(SUM(
      CASE 
        WHEN c.currency = 'COP' THEN c.amount
        WHEN c.currency = 'USD' THEN c.amount * COALESCE(
          (SELECT er.usd_to_cop 
           FROM exchange_rates er 
           WHERE er.date <= c.date 
           ORDER BY er.date DESC 
           LIMIT 1),
          ${fallbackRate}::numeric
        )
        ELSE 0
      END
    ), 0) as total
    FROM contributions c;
  `;
  
  return parseFloat(String(result[0]?.total ?? "0"));
}

/**
 * Obtiene el total histórico de retiros
 * Usa la tasa de cambio histórica del día del retiro
 */
export async function getTotalWithdrawals(sql, fallbackRate) {
  const result = await sql`
    SELECT COALESCE(SUM(
      CASE 
        WHEN w.currency = 'COP' THEN w.amount
        WHEN w.currency = 'USD' THEN w.amount * COALESCE(
          (SELECT er.usd_to_cop 
           FROM exchange_rates er 
           WHERE er.date <= w.date 
           ORDER BY er.date DESC 
           LIMIT 1),
          ${fallbackRate}::numeric
        )
        ELSE 0
      END
    ), 0) as total
    FROM withdrawals w;
  `;
  
  return parseFloat(String(result[0]?.total ?? "0"));
}

/**
 * Obtiene todas las cuentas con sus valores más recientes
 */
export async function getAccounts(sql) {
  return await sql`
    SELECT a.id, a.name, a.type, a.currency, a.parent_account_id,
      COALESCE((
        SELECT value FROM portfolio_values pv
        WHERE pv.account_id = a.id
        ORDER BY date DESC LIMIT 1
      ), 0) AS latest_value
    FROM accounts a
    ORDER BY 
      COALESCE(a.parent_account_id, a.id) ASC,
      CASE WHEN a.parent_account_id IS NULL THEN 0 ELSE 1 END ASC,
      a.name ASC;
  `;
}

/**
 * Organiza las cuentas en una estructura jerárquica
 */
export function organizeAccountsHierarchy(accounts) {
  const hierarchy = accounts.reduce((acc, account) => {
    if (account.parent_account_id === null) {
      acc.push({
        ...account,
        subaccounts: accounts.filter(sub => sub.parent_account_id === account.id),
        total_with_subs: 0
      });
    }
    return acc;
  }, []);

  // Calcular totales incluyendo subcuentas
  hierarchy.forEach((account) => {
    if (account.subaccounts.length > 0) {
      account.total_with_subs = parseFloat(String(account.latest_value)) + 
        account.subaccounts.reduce((sum, sub) => 
          sum + parseFloat(String(sub.latest_value)), 0
        );
    } else {
      account.total_with_subs = parseFloat(String(account.latest_value));
    }
  });

  return hierarchy;
}

/**
 * Obtiene los últimos movimientos (contribuciones y retiros)
 */
export async function getRecentMovements(sql, limit = 10) {
  return await sql`
    SELECT 'contribution' AS type, date, amount, currency, note
    FROM contributions
    UNION ALL
    SELECT 'withdrawal' AS type, date, amount, currency, note
    FROM withdrawals
    ORDER BY date DESC
    LIMIT ${limit};
  `;
}

/**
 * Obtiene la distribución del portafolio por moneda
 */
export async function getCurrencyDistribution(sql, currentRate) {
  return await sql`
    SELECT 
      a.currency,
      SUM(
        COALESCE(
          (SELECT value 
           FROM portfolio_values pv
           WHERE pv.account_id = a.id
           ORDER BY date DESC
           LIMIT 1),
          0
        ) * 
        CASE 
          WHEN a.currency = 'USD' THEN ${currentRate}::numeric
          ELSE 1
        END
      ) AS total_value_cop
    FROM accounts a
    GROUP BY a.currency
    ORDER BY total_value_cop DESC;
  `;
}

/**
 * Calcula el retorno neto y el porcentaje ROI
 */
export function calculateReturns(totalPortfolio, totalContributions, totalWithdrawals) {
  const netReturn = totalPortfolio - totalContributions + totalWithdrawals;
  const returnPercentage = totalContributions > 0 
    ? ((netReturn / totalContributions) * 100).toFixed(2)
    : "0.00";
  
  return { netReturn, returnPercentage };
}

/**
 * Función helper para obtener todos los datos del dashboard
 * Esta es la función principal que puedes usar en tu página
 */
export async function getDashboardData(sql) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  
  // Obtener tasa de cambio actual
  const currentRate = await getLatestExchangeRate(sql);
  
  // Obtener datos del mes
  const [monthlyContributions, monthlyWithdrawals] = await Promise.all([
    getMonthlyContributions(sql, thisMonth, currentRate),
    getMonthlyWithdrawals(sql, thisMonth, currentRate)
  ]);
  
  // Obtener totales históricos
  const [totalContributions, totalWithdrawals] = await Promise.all([
    getTotalContributions(sql, currentRate),
    getTotalWithdrawals(sql, currentRate)
  ]);
  
  // Obtener cuentas y organizarlas
  const accounts = await getAccounts(sql);
  const accountsHierarchy = organizeAccountsHierarchy(accounts);
  
  // Obtener movimientos y distribución
  const [movements, currencyDistribution] = await Promise.all([
    getRecentMovements(sql, 10),
    getCurrencyDistribution(sql, currentRate)
  ]);
  
  return {
    currentRate,
    monthly: {
      contributions: monthlyContributions,
      withdrawals: monthlyWithdrawals
    },
    totals: {
      contributions: totalContributions,
      withdrawals: totalWithdrawals
    },
    accounts: accountsHierarchy,
    movements,
    currencyDistribution
  };
}

// ============================================
// FUNCIONES DE PORTAFOLIO
// ============================================

/**
 * Obtiene el valor total del portafolio en COP
 * Usa la tasa de cambio más reciente para convertir USD a COP
 */
export async function getPortfolioValueCOP(sql) {
  const accounts = asRows(
    await sql`SELECT id, currency FROM accounts;`
  );

  // Obtener la tasa de cambio más reciente
  const rates = asRows(
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
    const pv = asRows(
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
export async function getPortfolioValueCOPAtDate(sql, date) {
  const accounts = asRows(
    await sql`SELECT id, currency FROM accounts;`
  );

  // Obtener la tasa de cambio para esa fecha específica
  const rates = asRows(
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
    const pv = asRows(
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
export async function getPortfolioValueCOPOptimized(sql) {
  const result = asRows(
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