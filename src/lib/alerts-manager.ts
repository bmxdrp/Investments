import { sql } from "@lib/db";

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
