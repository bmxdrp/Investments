import type { APIRoute } from "astro";
import { sql } from "@lib/db";
import {
    getLatestExchangeRate,
    getTotalContributions,
    getTotalWithdrawals,
    getPortfolioValueCOPOptimized
} from "@lib/utils";

export const GET: APIRoute = async () => {
    try {
        // Obtener la fecha de hoy (zona horaria de Colombia)
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

        // Obtener la tasa de cambio más reciente
        const usdToCop = await getLatestExchangeRate(sql);

        // Calcular totales de aportes y retiros (con conversión histórica)
        const totalContributions = await getTotalContributions(sql, usdToCop);
        const totalWithdrawals = await getTotalWithdrawals(sql, usdToCop);

        // Obtener el valor actual del portafolio en COP (optimizado)
        const currentPortfolioValue = await getPortfolioValueCOPOptimized(sql);

        // Calcular el retorno neto real
        // Retorno Neto = Valor Actual del Portafolio + Retiros - Aportes
        const netReturn = currentPortfolioValue + totalWithdrawals - totalContributions;

        // Calcular el rendimiento porcentual
        const returnPercentage = totalContributions > 0
            ? ((netReturn / totalContributions) * 100)
            : 0;

        // Insertar o actualizar el registro del día (usando hora de Colombia)
        await sql`
      INSERT INTO net_return_history (
        date, 
        total_contributions, 
        total_withdrawals, 
        net_return, 
        updated_at
      )
      VALUES (
        ${today}, 
        ${totalContributions}, 
        ${totalWithdrawals}, 
        ${netReturn}, 
        NOW() AT TIME ZONE 'America/Bogota'
      )
      ON CONFLICT (date) 
      DO UPDATE SET 
        total_contributions = ${totalContributions},
        total_withdrawals = ${totalWithdrawals},
        net_return = ${netReturn},
        updated_at = NOW() AT TIME ZONE 'America/Bogota';
    `;

        // Obtener el histórico de los últimos 30 días
        const history = await sql`
      SELECT 
        date,
        total_contributions,
        total_withdrawals,
        net_return,
        created_at,
        updated_at
      FROM net_return_history
      ORDER BY date DESC
      LIMIT 30;
    `;

        return new Response(JSON.stringify({
            success: true,
            calculatedToday: {
                date: today,
                totalContributions,
                totalWithdrawals,
                currentPortfolioValue,
                netReturn,
                returnPercentage: returnPercentage.toFixed(2),
                usdToCopRate: usdToCop
            },
            history: history,
            message: "Retorno neto calculado y guardado exitosamente"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error calculando retorno neto:", error);
        return new Response(JSON.stringify({
            success: false,
            error: "Error al calcular el retorno neto",
            details: error instanceof Error ? error.message : String(error)
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
