// src/pages/api/exchange-rates.ts
import type { APIRoute } from "astro";
import { sql } from "@lib/db";

// ============================================
// GET - Obtener tasas de cambio
// ============================================
export const GET: APIRoute = async ({ url }) => {
  try {
    const searchParams = url.searchParams;
    const date = searchParams.get("date");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const limit = searchParams.get("limit") || "30";

    let rates;

    if (date) {
      // Obtener tasa de una fecha específica
      rates = await sql`
        SELECT * FROM exchange_rates 
        WHERE date = ${date}
        LIMIT 1
      `;
    } else if (startDate && endDate) {
      // Obtener tasas en un rango de fechas
      rates = await sql`
        SELECT * FROM exchange_rates 
        WHERE date BETWEEN ${startDate} AND ${endDate}
        ORDER BY date DESC
      `;
    } else {
      // Obtener últimas N tasas
      rates = await sql`
        SELECT * FROM exchange_rates 
        ORDER BY date DESC 
        LIMIT ${Number(limit)}
      `;
    }

    // Obtener la tasa más reciente
    const latestRate = await sql`
      SELECT * FROM exchange_rates 
      ORDER BY date DESC 
      LIMIT 1
    `;

    return new Response(
      JSON.stringify({
        success: true,
        rates,
        latest: latestRate[0] || null,
        count: rates.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("GET exchange rates ERROR:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Error del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// ============================================
// POST - Crear o actualizar tasa de cambio
// ============================================
export const POST: APIRoute = async ({ request }) => {
  try {
    let data: any = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      data = Object.fromEntries(new URLSearchParams(text));
    } else {
      const formData = await request.formData();
      data = Object.fromEntries(formData.entries());
    }

    const date = data.date || new Date().toISOString().split('T')[0];
    const usdToCop = Number(data.usd_to_cop);

    if (!usdToCop || usdToCop <= 0) {
      return new Response(
        JSON.stringify({ error: "Tasa de cambio inválida" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar si ya existe una tasa para esa fecha
    const existing = await sql`
      SELECT * FROM exchange_rates WHERE date = ${date}
    `;

    let result;

    if (existing.length > 0) {
      // Actualizar tasa existente
      result = await sql`
        UPDATE exchange_rates 
        SET usd_to_cop = ${usdToCop}
        WHERE date = ${date}
        RETURNING *
      `;
    } else {
      // Insertar nueva tasa
      result = await sql`
        INSERT INTO exchange_rates (date, usd_to_cop)
        VALUES (${date}, ${usdToCop})
        RETURNING *
      `;
    }

    return new Response(
      JSON.stringify({
        success: true,
        rate: result[0],
        action: existing.length > 0 ? "updated" : "created",
      }),
      { status: existing.length > 0 ? 200 : 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("POST exchange rate ERROR:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Error del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// ============================================
// DELETE - Eliminar tasa de cambio
// ============================================
export const DELETE: APIRoute = async ({ url }) => {
  try {
    const date = url.searchParams.get("date");

    if (!date) {
      return new Response(
        JSON.stringify({ error: "Fecha requerida (parámetro 'date')" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await sql`
      DELETE FROM exchange_rates 
      WHERE date = ${date}
      RETURNING *
    `;

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ error: "Tasa de cambio no encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: result[0],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("DELETE exchange rate ERROR:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Error del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};