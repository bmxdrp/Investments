import type { APIRoute } from "astro";
import { sql } from "@lib/db";
import {
  getTotalContributions,
  getTotalWithdrawals,
  getPortfolioValueCOPOptimized,
} from "@lib/utils";

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

    const usdToCop = rate;
    summary.usdToCopRate = usdToCop;

    // 2️⃣ Calculate net return
    const totalContributions = await getTotalContributions(sql, usdToCop);
    const totalWithdrawals = await getTotalWithdrawals(sql, usdToCop);
    const currentPortfolioValue = await getPortfolioValueCOPOptimized(sql);
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
      const latestValue = await sql`
        SELECT value, currency FROM portfolio_values
        WHERE account_id = ${account.id}
        ORDER BY date DESC
        LIMIT 1;
      `;
      const value = latestValue.length > 0 ? parseFloat(String(latestValue[0].value)) : 0;
      const currency = latestValue.length > 0 ? latestValue[0].currency : account.currency;
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
