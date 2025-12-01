import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async ({ request }) => {
  try {
    // 🔐 SEGURIDAD: SOLO VERCEL PUEDE EJECUTAR ESTO
    const auth = request.headers.get("authorization");

    if (auth !== `Bearer ${import.meta.env.CRON_SECRET}`) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Fetch USD → COP rate and store it
    const apiKey = import.meta.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CURRENCY_API_KEY no está configurada en las variables de entorno"
      );
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

    // ✅ UPSERT seguro en Neon
    await sql`
      INSERT INTO exchange_rates (date, usd_to_cop, notes)
      VALUES (${today}, ${rate}, 'Cron job')
      ON CONFLICT (date) DO UPDATE SET
        usd_to_cop = ${rate};
    `;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Combined cron error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Error executing combined cron",
        details:
          error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};