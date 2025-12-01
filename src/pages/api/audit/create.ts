// src/pages/api/audit/create.ts
import type { APIRoute } from 'astro';
import { sql } from '@lib/db';

export const POST: APIRoute = async ({ request }) => {
try {
const data = await request.json();
return new Response(JSON.stringify({ success: true }), { status: 201 });
} catch (err: any) {
console.error(err);
return new Response(JSON.stringify({ error: err?.message || 'server error' }), { status: 500 });
}
};