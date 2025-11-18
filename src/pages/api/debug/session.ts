import type { APIRoute } from "astro";
import { neon } from "@neondatabase/serverless";
const sql = neon(import.meta.env.DATABASE_URL);

export const GET: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
  const sessionId = match?.[1] ?? null;
  let session = null;
  if (sessionId) {
    const rows = await sql`SELECT * FROM sessions WHERE id = ${sessionId}`;
    session = rows[0] ?? null;
  }
  return new Response(JSON.stringify({ cookieHeader, sessionId, session }), {
    headers: { "Content-Type": "application/json" },
  });
};
