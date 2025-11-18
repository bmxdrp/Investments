import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  const accounts = [
    ["NU", "investment", "COP"],
    ["PIBANK", "investment", "COP"],
    ["LULO", "investment", "COP"],
    ["TYBA", "investment", "COP"],
    ["DOLARAPP", "wallet", "USD"],
  ];

  for (const [name, type, currency] of accounts) {
    await sql`
      INSERT INTO accounts (name, type, currency)
      VALUES (${name}, ${type}, ${currency})
      ON CONFLICT DO NOTHING;
    `;
  }

  return new Response("Accounts seeded");
};
