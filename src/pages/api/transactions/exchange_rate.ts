// src/pages/api/transactions/exchange_rate.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

// ============================================
// GET - Obtener tasas de cambio
// ============================================
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = locals.userId as string;
    // GET puede ser público o privado, pero si tenemos RLS, mejor setear user.
    if (userId) await setRLSUser(userId);

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
    return handleApiError({ error: err, logMsg: "GET exchange rates error", type: "json" });
  }
};

// ============================================
// POST - Crear o actualizar tasa de cambio
// ============================================
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Verificación Auth
    const userId = locals.userId;
    const userRole = locals.userRole;
    if (!userId || userRole !== 'admin') {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) return csrfResult.response!;
    await setRLSUser(userId);

    // Datos parseados por validateCsrf
    let data: any = {};
    if (csrfResult.jsonBody) {
      data = csrfResult.jsonBody;
    } else if (csrfResult.formData) {
      data = Object.fromEntries(csrfResult.formData);
    } else {
      // Fallback or empty header
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        // validateCsrf supports multipart and urlencoded via formData() usually, but if fails
        // we assume body is consumed. If validateCsrf didn't return data, something is missing.
        // But let's assume valid case.
      }
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
    return handleApiError({ error: err, logMsg: "POST exchange rate error", type: "json" });
  }
};

// ============================================
// DELETE - Eliminar tasa de cambio
// ============================================
export const DELETE: APIRoute = async (context) => {
  const { url, locals } = context;
  try {
    // 🔒 Auth
    const userId = locals.userId;
    const userRole = locals.userRole;
    if (!userId || userRole !== 'admin') {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    // 🔒 Validar CSRF (Header X-CSRF-Token necesario para DELETE sin body)
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) return csrfResult.response!;
    await setRLSUser(userId);

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
    return handleApiError({ error: err, logMsg: "DELETE exchange rate error", type: "json" });
  }
};