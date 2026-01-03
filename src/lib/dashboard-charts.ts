// src/lib/dashboard-charts.ts
import { sql } from "@lib/db";

/**
 * Obtiene la tasa de cambio USD a COP más reciente
 */
async function getCurrentUsdToCopRate(): Promise<number> {
    const rateRows = await sql`SELECT usd_to_cop FROM exchange_rates ORDER BY date DESC LIMIT 1;`;
    return Number(rateRows[0]?.usd_to_cop ?? 0);
}

export async function getPortfolioHistory(userId: string) {
    const currentUsdToCop = await getCurrentUsdToCopRate();

    // Obtener historial diario de valor total ajustado a COP
    // Asumimos que 'transactions' tiene snapshots diarios en 'new_value'
    // O necesitamos reconstruirlo. 
    // La consulta original en graphics.astro usa 'dailyRows' que parece sumar 'new_value' por fecha.

    // Simplificación: Sumar new_value agrupado por fecha
    // Ajuste: Para días sin transacciones, se debería mantener el valor anterior (carry forward).
    // Esta consulta es una aproximación basada en lo que había.
    const history = await sql`
        SELECT 
            t.date,
            SUM(
                CASE 
                    WHEN a.currency = 'USD' THEN t.new_value * COALESCE(t.usd_to_cop_rate, ${currentUsdToCop})
                    ELSE t.new_value
                END
            ) as total_cop
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = ${userId}
        AND t.new_value IS NOT NULL
        GROUP BY t.date
        ORDER BY t.date ASC
    `;

    return history.map(row => ({
        date: new Date(row.date).toISOString().split('T')[0],
        value: Number(row.total_cop)
    }));
}

export async function getAssetAllocation(userId: string) {
    const currentUsdToCop = await getCurrentUsdToCopRate();

    const distRows = await sql`
    SELECT a.currency, 
        SUM(COALESCE(latest.new_value, 0)) AS total
    FROM accounts a
    LEFT JOIN LATERAL (
        SELECT t.new_value
        FROM transactions t
        WHERE t.account_id = a.id
        ORDER BY t.created_at DESC         -- Usar created_at en lugar de updated_at para el último registro real
        LIMIT 1
    ) latest ON true
    WHERE a.user_id = ${userId}
    GROUP BY a.currency;
    `;

    return distRows.map(d => ({
        label: d.currency,
        value: d.currency === 'USD' ? Number(d.total) * currentUsdToCop : Number(d.total),
        original_value: Number(d.total),
        currency: d.currency
    }));
}
