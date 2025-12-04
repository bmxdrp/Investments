import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const POST: APIRoute = async ({ request }) => {
  try {
    // Read token from request body
    const body = await request.json();
    const token = body?.token;

    // 🔐 BLOQUEO TOTAL SI NO ES VERCEL
    if (token !== import.meta.env.CRON_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Fetch USD → COP rate and store it
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

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Bogota",
    });

    // ✅ UPSERT seguro
    await sql`
      INSERT INTO exchange_rates (date, usd_to_cop,notes)
      VALUES (${today}, ${rate}, "Cron job")
      ON CONFLICT (date) DO UPDATE SET
        usd_to_cop = ${rate};
    `;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cron error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Error executing cron",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
