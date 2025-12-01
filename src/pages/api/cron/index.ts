import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  const summary: Record<string, any> = {};
  try {
    // 1️⃣ Fetch USD → COP rate and store it
    const apiKey = import.meta.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error("CURRENCY_API_KEY no está configurada en las variables de entorno");
    }

    const res = await fetch(
      `https://currencyapi.net/api/v1/rates?base=USD&output=json&key=${apiKey}`
    );
    const data = await res.json();
    const rate = data?.rates?.COP;

    if (!rate) {
      throw new Error("No se pudo obtener USD → COP");
    }

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Bogota",
    });

    // Insertar en Neon
    await sql`
      INSERT INTO exchange_rates (date, usd_to_cop)
      VALUES (${today}, ${rate})
      ON CONFLICT (date) DO UPDATE SET
        usd_to_cop = ${rate};
    `;

    const usdToCop = Number(rate);
    summary.usdToCopRate = usdToCop;

    // 2️⃣ Calculate Global Metrics using 'transactions' table

    // Fetch all transactions for contributions/withdrawals calculation
    const allTransactions = await sql`
      SELECT type, amount, currency, usd_to_cop_rate, date
      FROM transactions
    `;

    let totalContributions = 0;
    let totalWithdrawals = 0;

    for (const t of allTransactions) {
      const amount = Number(t.amount);
      // Use historical rate for past transactions if available, else current
      const txRate = t.currency === 'USD' && t.usd_to_cop_rate ? Number(t.usd_to_cop_rate) : usdToCop;
      const valueCOP = t.currency === 'USD' ? amount * txRate : amount;

      if (['initial_balance', 'contribution', 'transfer_in'].includes(t.type)) {
        totalContributions += valueCOP;
      } else if (['withdrawal', 'transfer_out', 'fee'].includes(t.type)) {
        totalWithdrawals += valueCOP;
      }
    }

    // Fetch latest balance for each account for Portfolio Value
    const latestBalances = await sql`
      SELECT DISTINCT ON (account_id) account_id, new_value, currency
      FROM transactions
      ORDER BY account_id, date DESC, created_at DESC, id DESC
    `;

    let currentPortfolioValue = 0;
    const accountBalancesMap = new Map();

    for (const b of latestBalances) {
      const val = Number(b.new_value);
      accountBalancesMap.set(b.account_id, { value: val, currency: b.currency });

      // For current portfolio value, use CURRENT rate
      const valCOP = b.currency === 'USD' ? val * usdToCop : val;
      currentPortfolioValue += valCOP;
    }

    const netReturn = currentPortfolioValue + totalWithdrawals - totalContributions;
    const returnPercentage = totalContributions > 0 ? (netReturn / totalContributions) * 100 : 0;

    await sql`
      INSERT INTO net_return_history (
        date,
        total_contributions,
        total_withdrawals,
        net_return,
        updated_at
      ) VALUES (
        ${today},
        ${totalContributions},
        ${totalWithdrawals},
        ${netReturn},
        NOW() AT TIME ZONE 'America/Bogota'
      )
      ON CONFLICT (date) DO UPDATE SET
        total_contributions = ${totalContributions},
        total_withdrawals = ${totalWithdrawals},
        net_return = ${netReturn},
        updated_at = NOW() AT TIME ZONE 'America/Bogota';
    `;
    summary.netReturn = {
      date: today,
      totalContributions,
      totalWithdrawals,
      currentPortfolioValue,
      netReturn,
      returnPercentage: returnPercentage.toFixed(2),
    };

    // 3️⃣ Save account values for each account
    const accounts = await sql`
      SELECT id, name, currency FROM accounts ORDER BY id;
    `;
    let savedCount = 0;
    for (const account of accounts) {
      // Get balance from our map or 0
      const balanceData = accountBalancesMap.get(account.id) || { value: 0, currency: account.currency };
      const value = balanceData.value;
      const currency = balanceData.currency;
      const valueCOP = currency === "USD" ? value * usdToCop : value;

      await sql`
        INSERT INTO account_value_history (
          account_id,
          date,
          value,
          value_cop,
          currency,
          usd_to_cop_rate,
          updated_at
        ) VALUES (
          ${account.id},
          ${today},
          ${value},
          ${valueCOP},
          ${currency},
          ${usdToCop},
          NOW() AT TIME ZONE 'America/Bogota'
        )
        ON CONFLICT (account_id, date) DO UPDATE SET
          value = ${value},
          value_cop = ${valueCOP},
          currency = ${currency},
          usd_to_cop_rate = ${usdToCop},
          updated_at = NOW() AT TIME ZONE 'America/Bogota';
      `;
      savedCount++;
    }
    summary.accountValuesSaved = savedCount;

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Combined cron error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Error executing combined cron", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
