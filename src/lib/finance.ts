import { sql, setRLSUser } from "@lib/db";

export interface Transaction {
  type: string;
  amount: number;
  currency: string;
  date: string;
  usd_to_cop_rate?: number;
  new_value?: number;
}

export interface MetricData {
  value: number;
  flow: number;
}

export interface PortfolioMetrics {
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  avgReturn: number;
  totalReturns?: number;
}

export const formatCurrency = (value: number, currency: string = "COP") => {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: currency === "USD" ? 1 : 1,
    maximumFractionDigits: currency === "USD" ? 2 : 2,
  });
};

export const toCOP = (value: number, currency: string, rate: number) => {
  return currency === "USD" ? value * rate : value;
};

// ==========================================
// CÁLCULOS FINANCIEROS
// ==========================================

export const calculateMetrics = (data: MetricData[]): PortfolioMetrics => {
  if (data.length < 2) {
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };
  }

  const returns: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const prevValue = data[i - 1].value;
    const currValue = data[i].value;
    const flow = data[i].flow; 

    const denominator = prevValue + flow;

    if (denominator > 0) {
      const gain = currValue - denominator;
      const dailyReturn = gain / denominator;

      if (Math.abs(dailyReturn) < 0.5) {
        returns.push(dailyReturn);
      }
    }
  }

  if (returns.length === 0) {
    return { volatility: 0, sharpe: 0, maxDrawdown: 0, avgReturn: 0 };
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const riskFreeRate = 0.05 / 252;
  const excessReturns = returns.map((r) => r - riskFreeRate);
  const avgExcessReturn = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const sharpe = volatility > 0 ? (avgExcessReturn * 252) / (volatility / 100) : 0;

  let maxDrawdown = 0;
  let peak = -Infinity;
  let cumulative = 100;
  
  for (const r of returns) {
    cumulative = cumulative * (1 + r);
    if (cumulative > peak) peak = cumulative;
    const drawdown = ((cumulative - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  if (peak === -Infinity) maxDrawdown = 0;

  return { 
    volatility: Number(volatility.toFixed(2)), 
    sharpe: Number(sharpe.toFixed(2)), 
    maxDrawdown: Number(maxDrawdown.toFixed(2)), 
    avgReturn: Number((avgReturn * 252 * 100).toFixed(2)) 
  };
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

// ==========================================
// CONSULTAS DE BASE DE DATOS
// ==========================================

export async function getLatestExchangeRate() {
  const res = await sql`
    SELECT usd_to_cop, date
    FROM exchange_rates
    ORDER BY date DESC
    LIMIT 1
  `;
  if (!res.length) return { usd_to_cop: 3900, date: new Date().toISOString() };
  return { usd_to_cop: Number(res[0].usd_to_cop), date: res[0].date };
}

export async function getDashboardData(userId: string) {
  await setRLSUser(userId);
  const { usd_to_cop: currentRate } = await getLatestExchangeRate();

  const accountsRaw = await sql`
    SELECT id, name, type, currency, parent_account_id
    FROM accounts 
    WHERE user_id = ${userId} AND is_active = true
  `;

  const accountsMap: Record<number, any> = {};
  accountsRaw.forEach(acc => {
    accountsMap[acc.id] = { ...acc, latest_value: 0, latest_value_cop: 0, subaccounts: [] };
  });

  const latestValues = await sql`
    SELECT DISTINCT ON (account_id) account_id, new_value, currency, usd_to_cop_rate
    FROM transactions
    WHERE user_id = ${userId}
    ORDER BY account_id, date DESC, created_at DESC, id DESC
  `;

  latestValues.forEach(t => {
    const acc = accountsMap[t.account_id];
    if (!acc) return;
    const val = Number(t.new_value);
    const rate = t.currency === "USD" && t.usd_to_cop_rate ? Number(t.usd_to_cop_rate) : currentRate;
    
    acc.latest_value = val;
    acc.latest_value_cop = t.currency === "USD" ? val * rate : val;
  });

  const accounts = [];
  for (const id in accountsMap) {
    const acc = accountsMap[id];
    if (acc.parent_account_id && accountsMap[acc.parent_account_id]) {
      accountsMap[acc.parent_account_id].subaccounts.push(acc);
    } else {
      accounts.push(acc);
    }
  }

  let totalPortfolioCurrentCOP = 0;
  accounts.forEach(acc => {
    let totalOriginal = acc.latest_value;
    let totalCOP = acc.latest_value_cop;
    
    acc.subaccounts.forEach((sub: any) => {
      if (sub.currency === acc.currency) totalOriginal += sub.latest_value;
      totalCOP += sub.latest_value_cop;
    });

    acc.subaccounts.sort((a: any, b: any) => b.latest_value - a.latest_value);

    acc.total_with_subs = totalOriginal;
    acc.total_with_subs_cop = totalCOP;
    totalPortfolioCurrentCOP += totalCOP;
  });

  const allTransactions = await sql`
    SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY created_at DESC
  `;

  let totalContrib = 0;
  let totalWithd = 0;
  let monthContrib = 0;
  let monthWithd = 0;
  const now = new Date();

  const movements = allTransactions.map(t => {
    const val = Number(t.amount);
    const rate = t.usd_to_cop_rate ? Number(t.usd_to_cop_rate) : currentRate;
    const valCOP = t.currency === "USD" ? val * rate : val;
    const difference = t.new_value - t.previous_value;
    const isMonth = new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear();

    if (['initial_balance', 'contribution', 'income'].includes(t.type)) {
      totalContrib += valCOP;
      if (isMonth) monthContrib += valCOP;
    }
    if (['withdrawal', 'expense', 'fee'].includes(t.type)) {
      totalWithd += valCOP;
      if (isMonth) monthWithd += valCOP;
    }

    return {
      id: t.id,
      type: t.type,
      amount: val,
      difference,
      currency: t.currency,
      date: t.date,
      note: t.notes
    };
  });

  const investedCapital = totalContrib - totalWithd;
  const netReturn = totalPortfolioCurrentCOP - investedCapital;
  const returnPercentage = investedCapital > 0 ? ((netReturn / investedCapital) * 100).toFixed(2) : "0.00";

  const distMap: Record<string, number> = {};
  accounts.forEach(acc => {
    distMap[acc.currency] = (distMap[acc.currency] || 0) + acc.total_with_subs_cop;
  });
  const currencyDistribution = Object.entries(distMap).map(([c, v]) => ({ currency: c, total_value_cop: v }));

  return {
    totalPortfolioCurrentCOP: Number(totalPortfolioCurrentCOP.toFixed(2)),
    returnsCurrent: {
      netReturn: Number(netReturn.toFixed(2)),
      returnPercentage,
      investedCapital: Number(investedCapital.toFixed(2))
    },
    monthly: { contributions: monthContrib, withdrawals: monthWithd },
    lifetime: { contributions: totalContrib, withdrawals: totalWithd },
    accounts,
    currencyDistribution,
    movements: movements.slice(0, 50)
  };
}

/**
 * Obtiene análisis detallado de portafolio para Statistics Page (Heavy Logic)
 */
export async function getDetailedPortfolioStats(userId: string, periodDays: number) {
  await setRLSUser(userId);
  const { usd_to_cop: currentRate } = await getLatestExchangeRate();

  // 1. Obtener todas las cuentas y sus transacciones recientes
  const allAccounts = await sql`
    SELECT id, name, currency, parent_account_id, type
    FROM accounts 
    WHERE user_id = ${userId} AND is_active = true
    ORDER BY parent_account_id NULLS FIRST, id
  `;

  // 2. Pre-fetch de datos
  const historyRaw = await sql`
    SELECT account_id, date::date, new_value, amount, type, usd_to_cop_rate
    FROM transactions
    WHERE user_id = ${userId}
    AND date >= CURRENT_DATE - ${periodDays}::int * INTERVAL '1 day'
    ORDER BY date ASC, id ASC
  `;
  
  const startBalancesRaw = await sql`
    SELECT DISTINCT ON (account_id) account_id, new_value 
    FROM transactions 
    WHERE user_id = ${userId} 
    AND date < CURRENT_DATE - ${periodDays}::int * INTERVAL '1 day'
    ORDER BY account_id, date DESC, id DESC
  `;
  const startBalMap = new Map(startBalancesRaw.map(r => [r.account_id, Number(r.new_value)]));

  const dates: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - periodDays);
  const end = new Date();
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }

  const processAccount = (accId: number, currency: string) => {
    const accHistory = historyRaw.filter(r => r.account_id === accId);
    let currentVal = startBalMap.get(accId) || 0;
    
    const timeline = dates.map(date => {
      const daysMoves = accHistory.filter(h => new Date(h.date).toISOString().split('T')[0] === date);
      let flow = 0;
      let extFlow = 0;
      
      if (daysMoves.length > 0) {
        const lastMove = daysMoves[daysMoves.length - 1];
        currentVal = Number(lastMove.new_value);
        daysMoves.forEach(m => {
          const amt = Number(m.amount);
          const type = m.type.toLowerCase().trim();
          
          const isDeposit = type === 'contribution' || type === 'initial_balance';
          const isWithdrawal = type === 'withdrawal';
          // Using flexible matching for transfers to be safe, though valid types are 'transfer_in' and 'transfer_out'
          const isTransferIn = type.includes('transfer') && type.includes('in'); 
          const isTransferOut = type.includes('transfer') && type.includes('out');

          if (isDeposit || isTransferIn) flow += amt;
          if (isWithdrawal || isTransferOut) flow -= amt;
          
          if (isDeposit) extFlow += amt;
          if (isWithdrawal) extFlow -= amt;
        });
      }
      return { date, value: currentVal, flow, extFlow };
    });

    const metrics = calculateMetrics(timeline);
    
    const startBal = startBalMap.get(accId) || 0;
    const endBal = timeline[timeline.length - 1].value;
    const totalFlow = timeline.reduce((sum, t) => sum + t.flow, 0);
    const totalPosFlow = timeline.reduce((sum, t) => sum + (t.flow > 0 ? t.flow : 0), 0);
    
    // For reporting (Aportes/Retiros UI), we use external flows only
    const totalContrib = timeline.reduce((sum, t) => sum + (t.extFlow > 0 ? t.extFlow : 0), 0);
    const totalWithdraw = timeline.reduce((sum, t) => sum + (t.extFlow < 0 ? -t.extFlow : 0), 0);
    const totalExtFlow = totalContrib - totalWithdraw;

    // For local stats (individual account performance), we treat transfers as capital
    // Gain = Final Value - Initial Value - (Net Capital Flow)
    // Net Capital Flow = All inflows (deposits + transfers in) - All outflows (withdrawals + transfers out)
    const gain = endBal - startBal - totalFlow;
    
    // Invested Capital used for ROI denominator
    // Traditionally: Start Balance + Weighted Net Flows.
    // Simplified: Start Balance + Total Inflows (Deposits + Transfers In)
    const invested = startBal + totalPosFlow;
    
    const roi = invested > 0 ? (gain / invested) * 100 : 0;

    const values = timeline.map(t => t.value);
    const growthFactor = metrics.avgReturn / 100 / 365;
    const useCompound = growthFactor > 0 && metrics.volatility < 50;
    const dailyGrowth = (calculateProjection(values, 0) - calculateProjection(values, -1));

    const project = (days: number) => {
        if (useCompound) return endBal * Math.pow(1 + growthFactor, days);
        return endBal + (dailyGrowth * days);
    };

    return {
      timeline, currentValue: endBal, startBalance: startBal,
      netFlow: totalFlow, netExtFlow: totalExtFlow,
      totalContrib, totalWithdraw,
      gain, invested, roi, metrics,
      projections: { m3: project(90), m6: project(180), y1: project(365) }
    };
  };

  const parentAccounts = allAccounts.filter(a => !a.parent_account_id);
  
  const accountsWithStats = parentAccounts.map(parent => {
    const parentStats = processAccount(parent.id, parent.currency);
    const subs = allAccounts.filter(a => a.parent_account_id === parent.id);
    const subStats = subs.map(sub => ({ ...sub, stats: processAccount(sub.id, sub.currency) }));

    const totalCurrentVal = parentStats.currentValue + subStats.reduce((sum, s) => sum + s.stats.currentValue, 0);
    const totalCurrentValCOP = toCOP(parentStats.currentValue, parent.currency, currentRate) + subStats.reduce((sum, s: any) => sum + toCOP(s.stats.currentValue, s.currency, currentRate), 0);
    
    const totalStartCOP = toCOP(parentStats.startBalance, parent.currency, currentRate) + subStats.reduce((sum, s: any) => sum + toCOP(s.stats.startBalance, s.currency, currentRate), 0);
    
    const parentContribCOP = toCOP(parentStats.totalContrib, parent.currency, currentRate);
    const parentWithdrawCOP = toCOP(parentStats.totalWithdraw, parent.currency, currentRate);
    const subsContribCOP = subStats.reduce((sum, s: any) => sum + toCOP(s.stats.totalContrib, s.currency, currentRate), 0);
    const subsWithdrawCOP = subStats.reduce((sum, s: any) => sum + toCOP(s.stats.totalWithdraw, s.currency, currentRate), 0);

    const totalContribCOP = parentContribCOP + subsContribCOP;
    const totalWithdrawCOP = parentWithdrawCOP + subsWithdrawCOP;
    const totalExtFlowCOP = totalContribCOP - totalWithdrawCOP;
    
    const totalGainCOP = totalCurrentValCOP - totalStartCOP - totalExtFlowCOP;
    const totalInvestedCOP = totalStartCOP + totalExtFlowCOP;
    const consolidatedROI = totalInvestedCOP > 0 ? (totalGainCOP / totalInvestedCOP) * 100 : 0;

    const totalVol = (parentStats.metrics.volatility + subStats.reduce((sum, s) => sum + s.stats.metrics.volatility, 0)) / (subStats.length + 1);
    
    let riskLevel = "bajo";
    if (totalVol > 30) riskLevel = "muy alto";
    else if (totalVol > 15) riskLevel = "alto";
    else if (totalVol > 8) riskLevel = "medio";

    let wins = 0;
    const pTime = parentStats.timeline;
    for(let i=1; i<pTime.length; i++) if(pTime[i].value > pTime[i-1].value) wins++;
    const winRate = pTime.length > 1 ? (wins / (pTime.length - 1)) * 100 : 0;

    return {
      id: parent.id, name: parent.name, currency: parent.currency, type: parent.type,
      currentValue: totalCurrentVal, totalCurrentCOP: totalCurrentValCOP,
      roi: consolidatedROI, volatility: totalVol, sharpe: parentStats.metrics.sharpe,
      maxDrawdown: Math.max(parentStats.metrics.maxDrawdown, ...subStats.map(s => s.stats.metrics.maxDrawdown)),
      avgReturn: parentStats.metrics.avgReturn,
      riskLevel, winRate, beta: 1.0, 
      trend: parentStats.projections.m3 > totalCurrentVal ? 'up' : 'down',
      projection3m: parentStats.projections.m3 + subStats.reduce((s, sub) => s + sub.stats.projections.m3, 0),
      projection6m: parentStats.projections.m6 + subStats.reduce((s, sub) => s + sub.stats.projections.m6, 0),
      projection12m: parentStats.projections.y1 + subStats.reduce((s, sub) => s + sub.stats.projections.y1, 0),
      invested: totalInvestedCOP, withdrawn: 0, profitLoss: totalGainCOP,
      totalContribCOP, totalWithdrawCOP,
      historyLength: parentStats.timeline.length,
      subaccounts: subStats.map((s: any) => ({
        ...s, currentValue: s.stats.currentValue, roi: s.stats.roi,
        volatility: s.stats.metrics.volatility, sharpe: s.stats.metrics.sharpe
      })),
      allocation: 0
    };
  });

  const totalPortfolioCOP = accountsWithStats.reduce((sum, a) => sum + a.totalCurrentCOP, 0);
  accountsWithStats.forEach(a => {
    a.allocation = totalPortfolioCOP > 0 ? (a.totalCurrentCOP / totalPortfolioCOP) * 100 : 0;
  });
  accountsWithStats.sort((a,b) => b.totalCurrentCOP - a.totalCurrentCOP);

  const totalGain = accountsWithStats.reduce((sum, a) => sum + a.profitLoss, 0);
  const totalInvested = accountsWithStats.reduce((sum, a) => sum + a.invested, 0);
  const portfolioROI = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  
  const weightedVol = accountsWithStats.reduce((sum, a) => sum + a.volatility * (a.allocation/100), 0);
  const weightedSharpe = accountsWithStats.reduce((sum, a) => sum + a.sharpe * (a.allocation/100), 0);
  const maxDD = Math.max(...accountsWithStats.map(a => a.maxDrawdown));
  
  const periodContributions = accountsWithStats.reduce((sum, a) => sum + a.totalContribCOP, 0);
  const periodWithdrawals = accountsWithStats.reduce((sum, a) => sum + a.totalWithdrawCOP, 0);
  const netFlow = periodContributions - periodWithdrawals;

  const portfolioHistory = await sql`
    WITH dates AS (
        SELECT generate_series(CURRENT_DATE - ${periodDays}::int * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day')::date AS date
    )
    SELECT d.date, SUM(
        CASE WHEN a.currency = 'USD' THEN COALESCE(lx.new_value, 0) * COALESCE(lx.usd_to_cop_rate, ${currentRate})
        ELSE COALESCE(lx.new_value, 0) END
    ) as total_cop
    FROM dates d
    CROSS JOIN accounts a
    LEFT JOIN LATERAL (
        SELECT new_value, usd_to_cop_rate FROM transactions t 
        WHERE t.account_id = a.id AND t.user_id = ${userId} AND t.date <= d.date 
        ORDER BY t.date DESC, t.id DESC LIMIT 1
    ) lx ON true
    WHERE a.user_id = ${userId} AND a.is_active = true
    GROUP BY d.date
    ORDER BY d.date ASC
  `;
  
  const chartValues = portfolioHistory.map(h => Number(h.total_cop));
  const chartLabels = portfolioHistory.map(h => new Date(h.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" }));
  const isUptrend = chartValues.length > 1 && chartValues[chartValues.length - 1] >= chartValues[0];
  const chartColor = isUptrend ? "34,197,94" : "239,68,68";

  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: "Valor Total (COP)",
      data: chartValues,
      borderColor: `rgb(${chartColor})`,
      backgroundColor: `rgba(${chartColor}, 0.1)`,
      fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, borderWidth: 2
    }]
  };

  const recommendations = [];
  const highVol = accountsWithStats.filter(a => a.volatility > 30);
  if (highVol.length) recommendations.push({ type: 'warning', title: 'Alta Volatilidad', description: 'Reducir exposición: ' + highVol.map(a=>a.name).join(', ') });
  
  const goodSharpe = accountsWithStats.filter(a => a.sharpe > 1.5);
  if (goodSharpe.length) recommendations.push({ type: 'success', title: 'Buen Rendimiento', description: 'Aumentar: ' + goodSharpe.map(a=>a.name).join(', ') });

  return {
    totalPortfolio: totalPortfolioCOP,
    portfolioROI,
    netFlow,
    periodContributions,
    periodWithdrawals,
    sharpe: weightedSharpe,
    volatility: weightedVol,
    maxDrawdown: maxDD,
    
    accounts: accountsWithStats,
    chartData,
    recommendations,
    currentRate
  };
}

export async function registerContribution(data: any) {
  await setRLSUser(data.user_id);
  const last = await sql`SELECT new_value FROM transactions WHERE account_id=${data.account_id} ORDER BY date DESC, created_at DESC LIMIT 1`;
  const prev = last.length ? Number(last[0].new_value) : 0;
  const neue = prev + Number(data.amount);

  return await sql`
    INSERT INTO transactions (user_id, account_id, type, amount, currency, date, notes, previous_value, new_value, created_at, usd_to_cop_rate)
    VALUES (${data.user_id}, ${data.account_id}, 'contribution', ${data.amount}, ${data.currency}, ${data.date}, ${data.notes||null}, ${prev}, ${neue}, NOW(), ${data.usd_to_cop_rate||null})
    RETURNING *
  `;
}