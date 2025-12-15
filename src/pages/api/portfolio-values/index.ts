// src/pages/api/portfolio-values/index.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { registerAccountValue } from "@lib/finance";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

/**
 * ✅ POST: Registrar ajuste manual como transaction
 */
export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Validar CSRF
    // Si viene de formulario web, returnUrl puede ser útil. Si es AJAX JSON, mejor devolver JSON error.
    // Asumiremos que si hay "application/json", manejamos error como JSON, sino redirect.
    // validateCsrf(context, returnUrl) devuelve redirect si returnUrl está presente y falla.
    // Si no ponemos returnUrl, probablemente devuelva response texto/json de error.
    // Para simplificar, usamos validateCsrf sin returnUrl y manejamos la respuesta.
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    const userId = locals.userId as string;

    if (!userId) {
      // Si es un request de navegador normal, redirigir a login.
      // Si es JSON, devolver 401.
      const contentType = request.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/login?returnTo=/dashboard/performance" },
      });
    }
    await setRLSUser(userId);

    // Parsear JSON o FormData USANDO csrfResult
    let data: any;

    // validateCsrf ya parseó el body, está en jsonBody o formData de csrfResult.
    if (csrfResult.jsonBody) {
      data = csrfResult.jsonBody;
    } else if (csrfResult.formData) {
      const fd = csrfResult.formData; // alias más corto
      data = {
        account_id: Number(fd.get("account_id")),
        user_id: fd.get("user_id") || userId,
        date: fd.get("date"),
        amount: Number(fd.get("value")),
        currency: fd.get("currency"),
        usd_to_cop_rate: Number(fd.get("usd_to_cop_rate")),
        previous_value: Number(fd.get("previous_value")),
      };
    } else {
      // Fallback or error
      throw new Error("No body/data found");
    }

    const {
      account_id,
      date,
      amount,
      currency,
      usd_to_cop_rate,
      previous_value
    } = data;

    // Validaciones básicas
    if (!account_id || !date || !amount || !currency) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(
        JSON.stringify({ error: "Moneda inválida" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (amount < 0 || (previous_value ?? 0) < 0) {
      return new Response(
        JSON.stringify({ error: "Los valores no pueden ser negativos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Registrar ajuste en transactions
    await registerAccountValue({
      account_id,
      type: "adjustment",
      amount,
      currency,
      date,
      notes: "Ajuste manual por usuario",
      previous_value: previous_value ?? 0,
      new_value: amount,
      user_id: userId,
      usd_to_cop_rate: usd_to_cop_rate || null
    });

    // Redirigir con éxito o devolver JSON
    if (csrfResult.jsonBody) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard/performance?success=1" }
    });

  } catch (error: any) {
    if (request.headers.get("content-type")?.includes("application/json")) {
      return handleApiError({ error, logMsg: "POST portfolio-values error", type: "json" });
    }
    return handleApiError({
      error,
      logMsg: "POST portfolio-values error",
      type: "/dashboard/performance" // Redirect en caso de error de navegador
    });
  }
};