import type { APIRoute } from "astro";

export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": `session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      Location: "/", // ⬅ redirige al inicio
    },
  });
};
