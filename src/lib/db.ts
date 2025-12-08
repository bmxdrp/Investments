import { neon } from '@neondatabase/serverless';

// Acceso lazy a DATABASE_URL para evitar validación al importar
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

export async function setRLSUser(userId: string) {
  // Validar formato UUID primero
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    throw new Error('Invalid userId format');
  }

  // Usar sql`` con parámetros
  await sql`SELECT set_config('app.user_id', ${userId}, false)`;
}