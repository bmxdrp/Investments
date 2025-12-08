
import { sql } from "@lib/db";

export interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
    icon: string;
    color: string;
}

export async function getCategories(type?: 'income' | 'expense') {
    if (type) {
        return await sql`
        SELECT * FROM categories 
        WHERE type = ${type} 
        ORDER BY id ASC
      ` as Category[];
    }
    return await sql`SELECT * FROM categories ORDER BY type, id` as Category[];
}
