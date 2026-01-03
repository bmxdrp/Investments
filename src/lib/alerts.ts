
import { sql } from "@lib/db";
import nodemailer from "nodemailer";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface UserAlert {
    id: number;
    user_id: string;
    type: 'exchange_rate' | 'monthly_report';
    target_value: number | null;
    condition: 'lt' | 'gt' | null;
    is_active: boolean;
    last_triggered_at: string | null;
    created_at: string;
}

// ============================================================================
// Email Configuration
// ============================================================================

const transporter = nodemailer.createTransport({
    host: import.meta.env.EMAIL_HOST || process.env.EMAIL_HOST,
    port: Number(import.meta.env.EMAIL_PORT || process.env.EMAIL_PORT) || 587,
    secure: (import.meta.env.EMAIL_PORT || process.env.EMAIL_PORT) === '465',
    auth: {
        user: import.meta.env.EMAIL_USER || process.env.EMAIL_USER,
        pass: import.meta.env.EMAIL_PASS || process.env.EMAIL_PASS,
    },
});

// ============================================================================
// Database Operations
// ============================================================================

export async function getUserAlerts(userId: string) {
    const rows = await sql`
        SELECT * FROM user_alerts 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
    `;
    return rows.map(r => ({
        ...r,
        target_value: r.target_value ? Number(r.target_value) : null
    })) as UserAlert[];
}

export async function createAlert(alert: Partial<UserAlert>) {
    await sql`
        INSERT INTO user_alerts (user_id, type, target_value, condition, is_active)
        VALUES (
            ${alert.user_id}, 
            ${alert.type}, 
            ${alert.target_value || null}, 
            ${alert.condition || null}, 
            TRUE
        )
    `;
}

export async function deleteAlert(id: number, userId: string) {
    await sql`
        DELETE FROM user_alerts WHERE id = ${id} AND user_id = ${userId}
    `;
}

export async function toggleAlert(id: number, userId: string, isActive: boolean) {
    await sql`
        UPDATE user_alerts 
        SET is_active = ${isActive}
        WHERE id = ${id} AND user_id = ${userId}
    `;
}

// ============================================================================
// Alert Processing
// ============================================================================

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
