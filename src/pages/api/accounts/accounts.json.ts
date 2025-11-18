import { sql } from "@lib/db";

export const GET = async () => {
  const accounts = await sql`
    SELECT id, name, type, currency
    FROM accounts
    ORDER BY name ASC
  `;

  return new Response(JSON.stringify(accounts), {
    headers: { "Content-Type": "application/json" }
  });
};
