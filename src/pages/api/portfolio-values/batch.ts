// src/pages/api/portfolio-values/batch.ts
import type { APIRoute } from "astro";
import { sql, setRLSUser } from "@lib/db";
import { validateCsrf } from "@lib/csrf-validator";
import { handleApiError } from "@lib/error-handler";

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  
  try {
    // 🔒 Validar CSRF
    const csrfResult = await validateCsrf(context);
    if (!csrfResult.success) {
      return csrfResult.response!;
    }

    const userId = locals.userId as string;
    if (!userId) {
      return new Response(null, {
        status: 302,
        headers: { 
          Location: "/auth/login?returnTo=/dashboard/performance&error=unauthorized"
        }
      });
    }
    await setRLSUser(userId);

    // ✅ Usar FormData ya parseado por validateCsrf
    const formData = csrfResult.formData!;
    const batchDate = formData.get("batch_date") as string;
    const usdToCopRate = parseFloat(formData.get("usd_to_cop_rate") as string);
    const selectedAccounts = formData.getAll("selected_accounts") as string[];

    // Validaciones básicas
    if (!batchDate) {
      return new Response(null, {
        status: 302,
        headers: { 
          Location: "/dashboard/performance?error=missing_date"
        }
      });
    }

    if (!selectedAccounts || selectedAccounts.length === 0) {
      return new Response(null, {
        status: 302,
        headers: { 
          Location: "/dashboard/performance?error=no_accounts_selected"
        }
      });
    }

    // Procesar cada cuenta seleccionada
    const updates = [];
    const errors = [];

    for (const accountId of selectedAccounts) {
      const valueStr = formData.get(`value_${accountId}`) as string;
      const currency = formData.get(`currency_${accountId}`) as string;
      const previousValueStr = formData.get(`previous_value_${accountId}`) as string;

      // Solo procesar si se ingresó un valor
      if (!valueStr || valueStr.trim() === "") {
        continue;
      }

      const newValue = parseFloat(valueStr);
      const previousValue = parseFloat(previousValueStr || "0");

      // Validar que el valor sea numérico válido
      if (isNaN(newValue)) {
        errors.push(`Cuenta ${accountId}: valor inválido`);
        continue;
      }

      try {

        // Calcular cambio
        const changeAmount = newValue - previousValue;
       const label = changeAmount === 0 ? 'adjustment' : changeAmount > 0 ? 'gain' : 'loss';

        // Insertar transacción
        const result = await sql`
          INSERT INTO transactions (
            user_id,
            account_id,
            amount,
            type,
            date,
            previous_value,
            currency,
            new_value,
            usd_to_cop_rate,
            notes
          ) VALUES (
            ${userId},
            ${accountId},
            ${newValue},
            ${label},
            ${batchDate},
            ${previousValue},
            ${currency},
            ${newValue},
            ${usdToCopRate},
            'Ajuste manual por lote'
          )
          RETURNING id
        `;

        if (result && result.length > 0) {
          updates.push(accountId);
        }
      } catch (error) {
        console.error(`Error updating account ${accountId}:`, error);
        errors.push(`Cuenta ${accountId}: error al guardar`);
      }
    }

    // Responder según resultados
    if (updates.length === 0 && errors.length > 0) {
      return new Response(null, {
        status: 302,
        headers: { 
          Location: `/dashboard/performance?error=${encodeURIComponent(errors.join(", "))}`
        }
      });
    }

    if (errors.length > 0) {
      return new Response(null, {
        status: 302,
        headers: { 
          Location: `/dashboard/performance?success=1&warning=${encodeURIComponent(`${updates.length} actualizadas, ${errors.length} con errores`)}`
        }
      });
    }

    return new Response(null, {
      status: 302,
      headers: { 
        Location: `/dashboard/performance?success=1&count=${updates.length}`
      }
    });

  } catch (error) {
    console.error("Error in batch portfolio update:", error);
    return new Response(null, {
      status: 302,
      headers: { 
        Location: "/dashboard/performance?error=server_error"
      }
    });
  }
};