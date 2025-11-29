import { neon } from '@neondatabase/serverless';

const DATABASE_URL = import.meta.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}
export const sql = neon(DATABASE_URL);

export function asRows<T = any>(result: any): T[] {
  // Neon siempre devuelve algo ejecutable como array, pero TS no lo sabe.
  if (Array.isArray(result)) return result as T[];

  // Cuando result es FullQueryResults
  if (Array.isArray(result?.rows)) return result.rows as T[];

  // Fallback seguro
  return [] as T[];
}