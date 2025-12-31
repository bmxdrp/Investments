import type { APIRoute } from "astro";
import { sql } from "@lib/db";
import { processExchangeRateAlerts } from "@lib/alerts";

async function updateExchangeRate() {
  const apiKey = import.meta.env.CURRENCY_API_KEY;
  if (!apiKey) {
    throw new Error("CURRENCY_API_KEY no está configurada");
  }

  const res = await fetch(
    `https://currencyapi.net/api/v1/rates?base=USD&output=json&key=${apiKey}`
  );

  const data = await res.json();
  const rate = data?.rates?.COP;

  if (!rate) {
    throw new Error("No se pudo obtener USD → COP");
  }

  const today = new Date().toLocaleString("sv-SE", {
  timeZone: "America/Bogota",
});

  // ✅ UPSERT seguro
  await sql`
    INSERT INTO exchange_rates (date, usd_to_cop, notes)
    VALUES (${today}, ${rate}, 'Cron');
  `;

  // 🔔 Trigger Alerts
  try {
    await processExchangeRateAlerts(rate);
  } catch (e) {
    console.error("Error processing alerts:", e);
  }
  return { success: true, rate, date: today };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    await updateExchangeRate();

    return new Response(JSON.stringify({success: true}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cron error (GET):", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
