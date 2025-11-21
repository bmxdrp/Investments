import type { APIRoute } from "astro";
import { sql } from "@lib/db";
import { getLatestExchangeRate } from "@lib/utils";

export const GET: APIRoute = async () => {
    try {
        // Obtener la fecha de hoy (zona horaria de Colombia)
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

        // Obtener la tasa de cambio más reciente
        const usdToCop = await getLatestExchangeRate(sql);

        // Obtener todas las cuentas
        const accounts = await sql`
            SELECT id, name, currency
            FROM accounts
            ORDER BY id;
        `;

        let savedCount = 0;

        // Para cada cuenta, obtener su valor más reciente y guardarlo en el historial
        for (const account of accounts) {
            // Obtener el valor más reciente de portfolio_values
            const latestValue = await sql`
                SELECT value, currency
                FROM portfolio_values
                WHERE account_id = ${account.id}
                ORDER BY date DESC
                LIMIT 1;
            `;

            // Si no hay valor, usar 0
            const value = latestValue.length > 0 ? parseFloat(String(latestValue[0].value)) : 0;
            const currency = latestValue.length > 0 ? latestValue[0].currency : account.currency;

            // Convertir a COP si es necesario
            const valueCOP = currency === 'USD' ? value * usdToCop : value;

            // Insertar o actualizar el registro del día para esta cuenta
            await sql`
                INSERT INTO account_value_history (
                    account_id,
                    date,
                    value,
                    value_cop,
                    currency,
                    usd_to_cop_rate,
                    updated_at
                )
                VALUES (
                    ${account.id},
                    ${today},
                    ${value},
                    ${valueCOP},
                    ${currency},
                    ${usdToCop},
                    NOW() AT TIME ZONE 'America/Bogota'
                )
                ON CONFLICT (account_id, date)
                DO UPDATE SET
                    value = ${value},
                    value_cop = ${valueCOP},
                    currency = ${currency},
                    usd_to_cop_rate = ${usdToCop},
                    updated_at = NOW() AT TIME ZONE 'America/Bogota';
            `;

            savedCount++;
        }

        // Obtener el historial de los últimos 30 días para todas las cuentas
        const history = await sql`
            SELECT 
                avh.id,
                avh.account_id,
                a.name as account_name,
                avh.date,
                avh.value,
                avh.value_cop,
                avh.currency,
                avh.usd_to_cop_rate,
                avh.created_at,
                avh.updated_at
            FROM account_value_history avh
            JOIN accounts a ON a.id = avh.account_id
            WHERE avh.date >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY avh.date DESC, a.name;
        `;
        return new Response()

    } catch (error) {
        console.error("Error guardando valores de cuentas:", error);
        return new Response(JSON.stringify({
            success: false,
            error: "Error al guardar los valores de las cuentas",
            details: error instanceof Error ? error.message : String(error)
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
