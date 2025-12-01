// src/lib/finance.ts - VERSIÓN CORREGIDA
import { sql, setRLSUser } from "@lib/db";


export async function getLatestExchangeRate() {
  const res = await sql`
    SELECT usd_to_cop, date
    FROM exchange_rates
    ORDER BY date DESC
    LIMIT 1
  `;
  if (!res.length) return { usd_to_cop: 3000, date: "2025-11-29" };
  return { usd_to_cop: Number(res[0].usd_to_cop), date: res[0].date };
}

/**
 * ✅ CORREGIDO: Dashboard con valores originales preservados
 */
export async function getDashboardData(userId: string) {
  // ✅ ACTIVAR RLS
  await setRLSUser(userId);
  // Obtener tasa actual
  const latestRate = await getLatestExchangeRate();

  const currentRate = latestRate.usd_to_cop;
  // Obtener todas las cuentas
  const accountsRaw = await sql`
    SELECT 
      a.id,
      a.name,
      a.type,
      a.currency,
      a.parent_account_id
    FROM accounts a
    WHERE a.user_id = ${userId}
  `;

  const accountsMap: Record<number, any> = {};
  accountsRaw.forEach(acc => {
    accountsMap[acc.id] = {
      id: acc.id,
      name: acc.name,
      type: acc.type,
      currency: acc.currency,
      parent_id: acc.parent_account_id,
      latest_value: 0,        // ✅ Valor en moneda ORIGINAL
      latest_value_cop: 0,    // ✅ Valor convertido a COP
      subaccounts: []
    };
  });

  // ✅ Obtener último balance por cuenta (new_value, no amount)
  const latestValues = await sql`
    SELECT DISTINCT ON (account_id)
      account_id,
      new_value,
      currency,
      usd_to_cop_rate,
      date
    FROM transactions
    WHERE user_id = ${userId}
    ORDER BY account_id, date DESC, created_at DESC, id DESC
  `;

  // ✅ CRÍTICO: Preservar valores originales Y conversión a COP
  latestValues.forEach(t => {
    const acc = accountsMap[t.account_id];
    if (!acc) return;

    const balanceNum = Number(t.new_value);

    // Usar tasa histórica si existe, sino usar tasa actual
    const rateToUse = t.currency === "USD" && t.usd_to_cop_rate
      ? Number(t.usd_to_cop_rate)
      : currentRate;

    // ✅ Guardar AMBOS valores
    acc.latest_value = balanceNum;  // Valor original (USD o COP)
    acc.latest_value_cop = t.currency === "USD"
      ? balanceNum * rateToUse
      : balanceNum;
  });

  // Estructura de cuentas padre/hijo
  Object.values(accountsMap).forEach(acc => {
    if (acc.parent_id && accountsMap[acc.parent_id]) {
      accountsMap[acc.parent_id].subaccounts.push(acc);
    }
  });

  const accounts = Object.values(accountsMap).filter(acc => !acc.parent_id);

  // ✅ Calcular totales con subcuentas (en moneda original Y COP)
  let totalPortfolioCurrentCOP = 0;

  accounts.forEach(acc => {
    let accTotalOriginal = acc.latest_value;
    let accTotalCOP = acc.latest_value_cop;

    acc.subaccounts.forEach((sub: any) => {
      // Solo sumar subcuentas si están en la MISMA moneda
      if (sub.currency === acc.currency) {
        accTotalOriginal += sub.latest_value;
      }
      accTotalCOP += sub.latest_value_cop;
    });

    acc.total_with_subs = accTotalOriginal;      // ✅ Total en moneda original
    acc.total_with_subs_cop = accTotalCOP;       // ✅ Total en COP
    totalPortfolioCurrentCOP += accTotalCOP;
  });

  // Obtener todas las transacciones
  const allTransactions = await sql`
    SELECT *
    FROM transactions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  // Calcular aportes y retiros
  let totalContributionsAllTime = 0;
  let totalWithdrawalsAllTime = 0;
  let monthlyContributions = 0;
  let monthlyWithdrawals = 0;

  const now = new Date();

  allTransactions.forEach(t => {
    const amountNum = Number(t.amount);
    const rateNum = t.usd_to_cop_rate ? Number(t.usd_to_cop_rate) : currentRate;
    const valueCOP = t.currency === "USD" ? amountNum * rateNum : amountNum;

    const tDate = new Date(t.date);
    const isThisMonth = tDate.getMonth() === now.getMonth() &&
      tDate.getFullYear() === now.getFullYear();

    // ✅ APORTES: initial_balance, contribution, income (EXCLUIR transfer_in)
    if (['initial_balance', 'contribution', 'income'].includes(t.type)) {
      totalContributionsAllTime += valueCOP;
      if (isThisMonth) monthlyContributions += valueCOP;
    }

    // ✅ RETIROS: withdrawal, expense, fee (EXCLUIR transfer_out)
    if (['withdrawal', 'expense', 'fee'].includes(t.type)) {
      totalWithdrawalsAllTime += valueCOP;
      if (isThisMonth) monthlyWithdrawals += valueCOP;
    }
  });

  // Cálculo de retorno neto
  const investedCapital = totalContributionsAllTime - totalWithdrawalsAllTime;
  const netReturn = totalPortfolioCurrentCOP - investedCapital;
  const returnPercentage = investedCapital > 0
    ? ((netReturn / investedCapital) * 100).toFixed(2)
    : "0.00";

  // Distribución por moneda
  const currencyDistributionMap: Record<string, number> = {};
  accounts.forEach(acc => {
    const value = acc.total_with_subs_cop;
    if (!currencyDistributionMap[acc.currency]) {
      currencyDistributionMap[acc.currency] = 0;
    }
    currencyDistributionMap[acc.currency] += value;
  });

  const currencyDistribution = Object.entries(currencyDistributionMap)
    .map(([currency, total_value_cop]) => ({ currency, total_value_cop }));

  // Movimientos recientes
  const movements = allTransactions
    .map(t => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      note: t.notes
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    totalPortfolioCurrentCOP: Number(totalPortfolioCurrentCOP.toFixed(2)),
    returnsCurrent: {
      netReturn: Number(netReturn.toFixed(2)),
      returnPercentage,
      investedCapital: Number(investedCapital.toFixed(2))
    },
    monthly: {
      contributions: Number(monthlyContributions.toFixed(2)),
      withdrawals: Number(monthlyWithdrawals.toFixed(2))
    },
    lifetime: {
      contributions: Number(totalContributionsAllTime.toFixed(2)),
      withdrawals: Number(totalWithdrawalsAllTime.toFixed(2))
    },
    accounts,
    currencyDistribution,
    movements
  };
}

/**
 * Registrar una contribución
 */
export async function registerContribution(data: {
  user_id: string;
  account_id: number;
  amount: number;
  currency: string;
  date: string;
  notes?: string | null;
  usd_to_cop_rate?: number;
}) {
  await setRLSUser(data.user_id);
  const last = await sql`
    SELECT new_value
    FROM transactions
    WHERE account_id = ${data.account_id}
    ORDER BY date DESC, created_at DESC, id DESC
    LIMIT 1
  `;
  const previous_value = last.length ? Number(last[0].new_value) : 0;
  const new_value = previous_value + Number(data.amount);

  const result = await sql`
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
      created_at,
      usd_to_cop_rate
    ) VALUES (
      ${data.user_id},
      ${data.account_id},
      'contribution',
      ${data.amount},
      ${data.currency},
      ${data.date},
      ${data.notes || null},
      ${previous_value},
      ${new_value},
      NOW(),
      ${data.usd_to_cop_rate || null}
    )
    RETURNING *
  `;

  return result[0];
}

/**
 * Registrar cualquier movimiento contable
 */
export async function registerAccountValue(data: {
  account_id: number;
  type: string;
  amount: number;
  currency: string;
  date: string;
  notes?: string;
  previous_value?: number | null;
  new_value?: number | null;
  user_id: string;
  usd_to_cop_rate?: number;
}) {
  await setRLSUser(data.user_id);
  let prev = data.previous_value;
  if (typeof prev === 'undefined' || prev === null) {
    const last = await sql`
      SELECT new_value
      FROM transactions
      WHERE account_id = ${data.account_id}
      ORDER BY date DESC, created_at DESC, id DESC
      LIMIT 1
    `;
    prev = last.length ? Number(last[0].new_value) : 0;
  }

  let newVal = data.new_value;
  if (typeof newVal === 'undefined' || newVal === null) {
    if (['withdrawal', 'transfer_out', 'fee', 'loss', 'expense'].includes(data.type)) {
      newVal = prev - Number(data.amount);
    } else {
      newVal = prev + Number(data.amount);
    }
  }

  const result = await sql`
    INSERT INTO transactions (
      account_id,
      type,
      amount,
      currency,
      date,
      notes,
      previous_value,
      new_value,
      created_at,
      user_id,
      usd_to_cop_rate
    ) VALUES (
     ${data.account_id},
     ${data.type},
     ${data.amount},
     ${data.currency},
     ${data.date},
     ${data.notes || null},
     ${prev},
     ${newVal},
     NOW(),
     ${data.user_id},
     ${data.usd_to_cop_rate || null}
    )
    RETURNING *
  `;
  return result[0];
}

/**
 * Obtener todos los balances del usuario
 */
export async function getAllAccountBalances(userId: string) {
  await setRLSUser(userId);
  return await sql`
    SELECT 
      a.id AS account_id,
      a.name AS account_name,
      a.type AS account_type,
      a.currency,
      a.parent_account_id,

      COALESCE(
        (
          SELECT t.new_value
          FROM transactions t
          WHERE t.account_id = a.id
          ORDER BY t.date DESC, t.created_at DESC, t.id DESC
          LIMIT 1
        ),
        0
      ) AS calculated_balance,

      COALESCE(
        (
          SELECT t.date
          FROM transactions t
          WHERE t.account_id = a.id
          ORDER BY t.date DESC, t.created_at DESC, t.id DESC
          LIMIT 1
        ),
        CURRENT_DATE
      ) AS last_update,

      (
        SELECT t.usd_to_cop_rate
        FROM transactions t
        WHERE t.account_id = a.id AND t.usd_to_cop_rate IS NOT NULL
        ORDER BY t.date DESC, t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS usd_to_cop_rate

    FROM accounts a
    WHERE a.user_id = ${userId}
    ORDER BY a.name ASC
  `;
}

export const calculateMetrics = (values: number[]) => {
  if (values.length < 2)
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };

  const returns = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }
  }

  if (returns.length === 0)
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const riskFreeRate = 0.05 / 252;
  const excessReturns = returns.map((r) => r - riskFreeRate);
  const avgExcessReturn =
    excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const sharpe =
    volatility > 0 ? (avgExcessReturn * 252) / (volatility / 100) : 0;

  let maxDrawdown = 0;
  let peak = values[0];
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = ((value - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return { volatility, sharpe, maxDrawdown, avgReturn: avgReturn * 252 * 100 };
};

export const calculateProjection = (values: number[], days: number) => {
  if (values.length < 2) return values[values.length - 1] || 0;

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = values;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return values[values.length - 1];
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return slope * (n + days) + intercept;
};