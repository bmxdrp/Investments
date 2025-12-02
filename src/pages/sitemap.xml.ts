import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const baseUrl = new URL(request.url).origin;

    const pages = [
        { url: '', changefreq: 'weekly', priority: 1.0 },
        { url: 'auth/login', changefreq: 'monthly', priority: 0.5 },
        { url: 'auth/register', changefreq: 'monthly', priority: 0.5 },
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${baseUrl}/${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    return new Response(sitemap, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
        },
    });
};
