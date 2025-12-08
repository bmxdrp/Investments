
import { sql } from "@lib/db";
import nodemailer from "nodemailer";

// Configurar transportador de email
const transporter = nodemailer.createTransport({
    host: import.meta.env.EMAIL_HOST || process.env.EMAIL_HOST,
    port: Number(import.meta.env.EMAIL_PORT || process.env.EMAIL_PORT) || 587,
    secure: (import.meta.env.EMAIL_PORT || process.env.EMAIL_PORT) === '465',
    auth: {
        user: import.meta.env.EMAIL_USER || process.env.EMAIL_USER,
        pass: import.meta.env.EMAIL_PASS || process.env.EMAIL_PASS,
    },
});

export async function processExchangeRateAlerts(currentRate: number) {
    console.log(`[Alerts] Processing exchange rate alerts for rate: ${currentRate}`);

    // Obtener alertas activas de tipo exchange_rate
    const alerts = await sql`
        SELECT a.*, u.email 
        FROM user_alerts a
        JOIN users u ON a.user_id = u.id
        WHERE a.type = 'exchange_rate' 
        AND a.is_active = TRUE
    `;

    for (const alert of alerts) {
        let shouldTrigger = false;
        const target = Number(alert.target_value);

        if (alert.condition === 'lt' && currentRate < target) {
            shouldTrigger = true;
        } else if (alert.condition === 'gt' && currentRate > target) {
            shouldTrigger = true;
        }

        // Evitar spam: solo enviar si no se ha enviado hoy
        const lastTrigger = alert.last_triggered_at ? new Date(alert.last_triggered_at) : null;
        const today = new Date().toDateString();

        if (shouldTrigger && (!lastTrigger || lastTrigger.toDateString() !== today)) {
            console.log(`[Alerts] Triggering alert for user ${alert.email}`);

            try {
                await transporter.sendMail({
                    from: `"Investments App" <${import.meta.env.EMAIL_FROM || 'no-reply@investments.app'}>`,
                    to: alert.email,
                    subject: '📢 Alerta de Tasa de Cambio',
                    html: `
                        <div style="font-family: sans-serif; padding: 20px;">
                            <h2>¡El dólar se ha movido!</h2>
                            <p>La tasa actual es <strong>${currentRate.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</strong>.</p>
                            <p>Tu alerta: Avisar cuando sea <strong>${alert.condition === 'lt' ? 'menor que' : 'mayor que'} ${target.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</strong>.</p>
                            <br>
                            <a href="${import.meta.env.SITE_URL || 'http://localhost:4321'}/dashboard" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir al Dashboard</a>
                        </div>
                    `
                });

                // Actualizar timestamp
                await sql`
                    UPDATE user_alerts 
                    SET last_triggered_at = NOW() 
                    WHERE id = ${alert.id}
                `;
            } catch (error) {
                console.error(`[Alerts] Failed to send email to ${alert.email}`, error);
            }
        }
    }
}
