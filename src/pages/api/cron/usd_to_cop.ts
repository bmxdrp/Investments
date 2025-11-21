import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  try {
    // Fetch del dólar → COP
    const res = await fetch(
      "https://currencyapi.net/api/v1/rates?base=USD&output=json&key=5fe32bed3769c9fd9f2a6de4a28cfb2ca062"
    );
    const data = await res.json();
    const rate = data?.rates?.COP;

    const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, "0");
const day = String(today.getDate()).padStart(2, "0");

const formatted = `${year}-${month}-${day}`;
console.log("Fecha formateada:", formatted);


    if (!rate) {
      return new Response("No se pudo obtener USD → COP", { status: 500 });
    }

    // Insertar en Neon
    await sql`
      INSERT INTO exchange_rates (date, usd_to_cop)
      VALUES (${formatted}, ${rate});
    `;

    return new Response(`Guardado 💲`);
  } catch (err) {
    console.error(err);
    return new Response("Error interno", { status: 500 });
  }
};
