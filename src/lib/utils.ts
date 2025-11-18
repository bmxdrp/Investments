import { getPortfolioValueCOP } from "@lib/portfolio";
import type { Postgres } from "@neondatabase/serverless";

// ----------------------
// 1. OBTENER CUENTAS
// ----------------------
export async function getAccounts(sql: Postgres) {
  return await sql`
    SELECT a.id, a.name, a.type, a.currency,
      COALESCE((
        SELECT value FROM portfolio_values pv
        WHERE pv.account_id = a.id
        ORDER BY date DESC LIMIT 1
      ), 0) AS latest_value
    FROM accounts a
    ORDER BY a.name ASC;
  `;
}

// ----------------------
// 2. ESTADÍSTICAS DEL MES
// ----------------------
export async function getMonthlyStats(sql: Postgres) {
  const thisMonth = new Date().toISOString().slice(0, 7); // "2025-11"
  
  const contributionsThisMonth = await sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM contributions
    WHERE date >= ${thisMonth + '-01'};
  `;

  const withdrawalsThisMonth = await sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM withdrawals
    WHERE date >= ${thisMonth + '-01'};
  `;

  return {
    contributions: Number(contributionsThisMonth[0].total),
    withdrawals: Number(withdrawalsThisMonth[0].total),
  };
}

// ----------------------
// 3. TOTALES HISTÓRICOS
// ----------------------
export async function getTotalStats(sql: Postgres) {
  const totalContributions = await sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM contributions;
  `;

  const totalWithdrawals = await sql`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM withdrawals;
  `;

  return {
    totalContributions: Number(totalContributions[0].total),
    totalWithdrawals: Number(totalWithdrawals[0].total),
  };
}

// ----------------------
// 4. RETORNO NETO Y ROI
// ----------------------
export async function getNetReturn(sql: Postgres) {
  const totalPortfolio = await getPortfolioValueCOP(sql);
  const { totalContributions, totalWithdrawals } = await getTotalStats(sql);
  
  const netReturn = totalPortfolio - totalContributions + totalWithdrawals;
  const returnPercentage = totalContributions > 0 
    ? ((netReturn / totalContributions) * 100).toFixed(2)
    : "0";

  return {
    netReturn,
    returnPercentage,
    totalPortfolio,
  };
}

// ----------------------
// 5. ÚLTIMOS MOVIMIENTOS
// ----------------------
export async function getRecentMovements(sql: Postgres, limit: number = 10) {
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

// ----------------------
// 6. DISTRIBUCIÓN POR MONEDA
// ----------------------
export async function getDistributionByCurrency(sql: Postgres) {
  return await sql`
    SELECT 
      currency,
      SUM(latest_value) as total_value
    FROM (
      SELECT a.currency,
        COALESCE((
          SELECT value FROM portfolio_values pv
          WHERE pv.account_id = a.id
          ORDER BY date DESC LIMIT 1
        ), 0) AS latest_value
      FROM accounts a
    ) AS subquery
    GROUP BY currency
    ORDER BY total_value DESC;
  `;
}

// ----------------------
// 7. DATOS COMPLETOS DEL DASHBOARD
// ----------------------
export async function getDashboardData(sql: Postgres) {
  const [
    accounts,
    monthlyStats,
    totalStats,
    netReturnData,
    movements,
    distributionByCurrency,
  ] = await Promise.all([
    getAccounts(sql),
    getMonthlyStats(sql),
    getTotalStats(sql),
    getNetReturn(sql),
    getRecentMovements(sql, 10),
    getDistributionByCurrency(sql),
  ]);

  return {
    accounts,
    monthlyStats,
    totalStats,
    netReturn: netReturnData.netReturn,
    returnPercentage: netReturnData.returnPercentage,
    totalPortfolio: netReturnData.totalPortfolio,
    movements,
    distributionByCurrency,
  };
}