
// src/lib/goals.ts
import { sql } from "@lib/db";

export interface Goal {
    id: number;
    user_id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    currency: 'COP' | 'USD';
    target_date: string | null;
    color: string;
    icon: string | null;
    is_completed: boolean;
    created_at: string;
}

export async function getUserGoals(userId: string) {
    const rows = await sql`
    SELECT * FROM goals 
    WHERE user_id = ${userId}
    ORDER BY is_completed ASC, target_date ASC
  `;
    return rows.map(r => ({
        ...r,
        target_amount: Number(r.target_amount),
        current_amount: Number(r.current_amount)
    })) as Goal[];
}

export async function createGoal(goal: Partial<Goal>) {
    const result = await sql`
    INSERT INTO goals (
      user_id, name, target_amount, current_amount, currency, target_date, color, icon
    ) VALUES (
      ${goal.user_id}, ${goal.name}, ${goal.target_amount}, ${goal.current_amount || 0}, 
      ${goal.currency}, ${goal.target_date || null}, ${goal.color || '#3b82f6'}, ${goal.icon || null}
    )
    RETURNING *
  `;
    return result[0];
}

export async function updateGoalAmount(goalId: number, userId: string, amount: number) {
    const result = await sql`
        UPDATE goals
        SET current_amount = ${amount},
            is_completed = CASE WHEN ${amount} >= target_amount THEN TRUE ELSE FALSE END,
            updated_at = NOW()
        WHERE id = ${goalId} AND user_id = ${userId}
        RETURNING *
    `;
    return result[0];
}

export async function deleteGoal(goalId: number, userId: string) {
    await sql`
        DELETE FROM goals WHERE id = ${goalId} AND user_id = ${userId}
    `;
}
