// src/pages/api/accounts/index.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

    const accounts = await sql`
      SELECT id, name, type, currency 
      FROM accounts 
      WHERE user_id = ${userId}
      ORDER BY id DESC
    `;

    return new Response(JSON.stringify(accounts), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return handleApiError({
      error,
      logMsg: "Error fetching accounts",
      type: "json",
      status: 500
    });
  }
};

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context); // No pasamos path para que devuelva JSON error si falla
    if (!csrfResult.success) {
      // Si falló CSRF y es JSON, validateCsrf probablemente devolvió redirect o error standard.
      // Si queremos un error JSON específico, podríamos manejarlo aquí, pero csrfResult.response ya viene listo.
      // Sin embargo, validateCsrf por defecto devuelve HTML o Redirect si redirectUrl se pasa.
      // Si no se pasa redirectUrl, devuelve un error genérico.
      // Vamos a confiar en la respuesta por ahora, pero idealmente para APIs JSON deberíamos devolver JSON 403.
      return csrfResult.response!;
    }

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    await setRLSUser(userId);

    // ✅ Usamos jsonBody devuelto por validateCsrf para no re-leer el stream
    const body = csrfResult.jsonBody;
    const { name, type, currency } = body || {};

    if (!name || !type || !currency) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!["COP", "USD"].includes(currency)) {
      return new Response(JSON.stringify({ error: "Invalid currency" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await sql`
      INSERT INTO accounts (name, type, currency, user_id)
      VALUES (${name}, ${type}, ${currency}, ${userId})
      RETURNING id, name, type, currency
    `;

    return new Response(JSON.stringify(result[0]), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return handleApiError({
      error,
      logMsg: "Error creating account",
      type: "json",
      status: 500
    });
  }
};