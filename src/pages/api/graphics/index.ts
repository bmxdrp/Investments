// /api/graphics/index.ts - versión totalmente corregida y robusta
import type { APIRoute } from "astro";
import { sql, asRows } from "@lib/db";

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function formatDateToYMD(d: any) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const type = (url.searchParams.get("type") || "diversificacion").toString();
    // optional user filter (if you want per-user charts) - pass ?userId=...
    const userIdParam = url.searchParams.get("userId");
    const userId = userIdParam ? Number(userIdParam) : undefined;

    // Latest FX
    const rateRows = asRows<{ usd_to_cop: number }>(
      await sql`SELECT usd_to_cop FROM exchange_rates ORDER BY date DESC LIMIT 1;`
    );
    const usdToCop = safeNumber(rateRows[0]?.usd_to_cop ?? 0);

    const convertToCOP = (value: number, currency?: string) =>
      currency === "USD" ? safeNumber(value) * usdToCop : safeNumber(value);

    let chartConfig: any = null;

    // -----------------------
    // 1) Diversificación por tipo
    // -----------------------
    if (type === "diversificacion") {
      // Get latest value per account, then aggregate by type+currency
      const rows = await sql`
        SELECT t.type, t.currency, SUM(t.latest_value) AS total_cop_or_native
        FROM (
          SELECT a.type, a.currency,
            COALESCE((
              SELECT pv.value
              FROM portfolio_values pv
              WHERE pv.account_id = a.id
              ORDER BY pv.date DESC
              LIMIT 1
            ), 0) AS latest_value
          FROM accounts a
          ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        ) t
        GROUP BY t.type, t.currency
        ORDER BY SUM(t.latest_value) DESC;
      `;

      // convert USD to COP for chart (we want same unit)
      const labels = rows.map((r: any) => r.type);
      const data = rows.map((r: any) => convertToCOP(Number(r.total_cop_or_native), r.currency));

      chartConfig = {
        type: "doughnut",
        data: { labels, datasets: [{ data }] },
        options: { plugins: { title: { display: true, text: "Diversificación por tipo (en COP)" } } },
      };
    }

    // -----------------------
    // 2) Historial total del portafolio (line)
    // -----------------------
    else if (type === "historial_valores") {
      // total per date (converted to COP on the fly)
      const rows = await sql`
        SELECT pv.date, SUM(
          CASE WHEN a.currency = 'USD' THEN pv.value * ${usdToCop} ELSE pv.value END
        ) AS total_cop
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY pv.date
        ORDER BY pv.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.total_cop));

      chartConfig = {
        type: "line",
        data: {
          labels,
          datasets: [{ label: "Valor total del portafolio (COP)", data, fill: true }],
        },
        options: { plugins: { title: { display: true, text: "Historial del valor del portafolio (COP)" } } },
      };
    }

    // -----------------------
    // 3) Historial de aportes (bar)
    // -----------------------
    else if (type === "historial_aportes") {
      const rows = await sql`
        SELECT c.date, SUM(CASE WHEN c.currency = 'USD' THEN c.amount * ${usdToCop} ELSE c.amount END) AS total_cop
        FROM contributions c
        JOIN accounts a ON a.id = c.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY c.date
        ORDER BY c.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.total_cop));

      chartConfig = {
        type: "line",
        data: { labels, datasets: [{ label: "Aportes (COP)", steppedLine: true, borderColor: 'rgb(255, 99, 132)',fill: false,data }] },
        options: { plugins: { title: { display: true, text: "Aportes por fecha (COP)" } } },
      };
    }

    // -----------------------
    // 4) Rendimientos diarios (line) -- compute using subquery + lag
    // -----------------------
    else if (type === "rendimientos") {
      const rows = await sql`
        SELECT t.date, t.total AS total_cop, t.total - LAG(t.total) OVER (ORDER BY t.date) AS rendimiento
        FROM (
          SELECT pv.date AS date, SUM(
            CASE WHEN a.currency = 'USD' THEN pv.value * ${usdToCop} ELSE pv.value END
          ) AS total
          FROM portfolio_values pv
          JOIN accounts a ON a.id = pv.account_id
          ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
          GROUP BY pv.date
        ) t
        ORDER BY t.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.rendimiento));

      chartConfig = {
        type: "line",
        data: { labels, datasets: [{ label: "Rendimiento (COP)", data }] },
        options: { plugins: { title: { display: true, text: "Rendimiento diario (COP)" } } },
      };
    }

    // -----------------------
    // 5) Evolución por tipo de cuenta (multi-line)
    // -----------------------
    else if (type === "evolucion_por_tipo") {
      const rows = await sql`
        SELECT a.type, pv.date, pv.value, a.currency
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        ORDER BY pv.date ASC;
      `;

      // build unique dates and types
      const dates = Array.from(new Set(rows.map((r: any) => formatDateToYMD(r.date)))).filter(Boolean);
      const types = Array.from(new Set(rows.map((r: any) => r.type)));

      const datasets = types.map((t) => ({
        label: t,
        data: dates.map((d) => {
          const row = rows.find((x: any) => x.type === t && formatDateToYMD(x.date) === d);
          return row ? convertToCOP(Number(row.value), row.currency) : 0;
        }),
        fill: false,
      }));

      chartConfig = {
        type: "line",
        data: { labels: dates, datasets },
        options: { plugins: { title: { display: true, text: "Evolución por tipo de cuenta (COP)" } } },
      };
    }

    // -----------------------
    // 6) Ingresos vs Egresos (bar grouped by date)
    // -----------------------
    else if (type === "ingresos_vs_egresos") {
      const ingresos = await sql`
        SELECT c.date, SUM(CASE WHEN c.currency = 'USD' THEN c.amount * ${usdToCop} ELSE c.amount END) AS total_cop
        FROM contributions c
        JOIN accounts a ON a.id = c.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY c.date
        ORDER BY c.date ASC;
      `;
      const egresos = await sql`
        SELECT w.date, SUM(CASE WHEN w.currency = 'USD' THEN w.amount * ${usdToCop} ELSE w.amount END) AS total_cop
        FROM withdrawals w
        JOIN accounts a ON a.id = w.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY w.date
        ORDER BY w.date ASC;
      `;

      const allDates = Array.from(new Set([
        ...ingresos.map((r: any) => formatDateToYMD(r.date)),
        ...egresos.map((r: any) => formatDateToYMD(r.date)),
      ])).filter(Boolean).sort();

      const ingresosData = allDates.map((d) => {
        const r = ingresos.find((x: any) => formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_cop) : 0;
      });
      const egresosData = allDates.map((d) => {
        const r = egresos.find((x: any) => formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_cop) : 0;
      });

      chartConfig = {
        type: "bar",
        data: {
          labels: allDates,
          datasets: [
            { label: "Ingresos (COP)", data: ingresosData },
            { label: "Egresos (COP)", data: egresosData },
          ],
        },
        options: { plugins: { title: { display: true, text: "Ingresos vs Egresos (COP)" } } },
      };
    }

    // -----------------------
    // 7) Comparativa COP vs USD (each line converted to COP)
    // -----------------------
    else if (type === "comparativa_cop_usd") {
      const rows = await sql`
        SELECT pv.date AS date, a.currency AS currency, SUM(pv.value) AS total_native
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY pv.date, a.currency
        ORDER BY pv.date ASC;
      `;

      const dates = Array.from(new Set(rows.map((r: any) => formatDateToYMD(r.date)))).filter(Boolean);

      const copData = dates.map((d) => {
        const r = rows.find((x: any) => x.currency === "COP" && formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_native) : 0;
      });
      const usdData = dates.map((d) => {
        const r = rows.find((x: any) => x.currency === "USD" && formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_native) * usdToCop : 0;
      });

      chartConfig = {
        type: "line",
        data: {
          labels: dates,
          datasets: [
            { label: "COP (native)", data: copData },
            { label: "USD (converted to COP)", data: usdData },
          ],
        },
        options: { plugins: { title: { display: true, text: "Comparativa COP vs USD (COP units)" } } },
      };
    }

    // -----------------------
    // 8) Rentabilidad acumulada
    // -----------------------
    else if (type === "rentabilidad_acumulada") {
      const rows = await sql`
        SELECT pv.date AS date, SUM(
          CASE WHEN a.currency = 'USD' THEN pv.value * ${usdToCop} ELSE pv.value END
        ) AS total_cop
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY pv.date
        ORDER BY pv.date ASC;
      `;

      let acumulado = 0;
      const data = rows.map((r: any, i: number) => {
        if (i === 0) {
          acumulado = 0;
          return 0;
        }
        const prev = safeNumber(rows[i - 1].total_cop);
        const curr = safeNumber(r.total_cop);
        acumulado += curr - prev;
        return acumulado;
      });

      const labels = rows.map((r: any) => formatDateToYMD(r.date));

      chartConfig = {
        type: "line",
        data: { labels, datasets: [{ label: "Rentabilidad acumulada (COP)", data }] },
        options: { plugins: { title: { display: true, text: "Rentabilidad acumulada (COP)" } } },
      };
    }

    // -----------------------
    // 9) Rendimiento porcentual diario
    // -----------------------
    else if (type === "rendimiento_porcentual") {
      const rows = await sql`
        SELECT pv.date AS date, SUM(
          CASE WHEN a.currency = 'USD' THEN pv.value * ${usdToCop} ELSE pv.value END
        ) AS total_cop
        FROM portfolio_values pv
        JOIN accounts a ON a.id = pv.account_id
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY pv.date
        ORDER BY pv.date ASC;
      `;

      const data = rows.map((r: any, i: number) => {
        if (i === 0) return 0;
        const prev = safeNumber(rows[i - 1].total_cop);
        const curr = safeNumber(r.total_cop);
        return prev === 0 ? 0 : ((curr - prev) / prev) * 100;
      });

      const labels = rows.map((r: any) => formatDateToYMD(r.date));

      chartConfig = {
        type: "line",
        data: { labels, datasets: [{ label: "% Rendimiento diario", data }] },
        options: { plugins: { title: { display: true, text: "Rendimiento porcentual diario" } } },
      };
    }

    // -----------------------
    // fallback
    // -----------------------
    else {
      return new Response("Tipo de gráfico no válido", { status: 400 });
    }

    // Safety: ensure chartConfig has at least some data
    const hasData = chartConfig && chartConfig.data && Array.isArray(chartConfig.data.datasets) && chartConfig.data.datasets.some((ds: any) => (ds.data || []).length > 0);
    if (!hasData) {
      // simple empty-chart fallback so QuickChart returns a valid image
      chartConfig = {
        type: "doughnut",
        data: { labels: ["sin datos"], datasets: [{ data: [1] }] },
        options: { plugins: { title: { display: true, text: "Sin datos" } } },
      };
    }

    const apiUrl = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(chartConfig));
    const res = await fetch(apiUrl);
    const arrayBuffer = await res.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: any) {
    // Return a readable error for debugging (in production you may not want to expose raw error)
    console.error("Error in /api/graphics:", err);
    return new Response(`Internal Server Error: ${String(err.message ?? err)}`, { status: 500 });
  }
};
