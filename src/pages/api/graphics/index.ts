// /api/graphics/index.ts - usando Image-Charts.com
import type { APIRoute } from "astro";
import { sql, asRows, setRLSUser } from "@lib/db";

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

// Función para normalizar datos a escala 0-100 para Image-Charts
function normalizeData(data: number[]) {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  if (max === min) return data.map(() => 50);
  return data.map(v => ((v - min) / (max - min)) * 100);
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const type = (url.searchParams.get("type") || "diversificacion").toString();

    const authUserId = locals.userId as string;
    let userId = authUserId;

    if (!userId) {
      const userIdParam = url.searchParams.get("userId");
      if (userIdParam) userId = userIdParam;
    }

    if (userId) {
      await setRLSUser(userId);
    }

    // Latest FX
    const rateRows = asRows<{ usd_to_cop: number }>(
      await sql`SELECT usd_to_cop FROM exchange_rates ORDER BY date DESC LIMIT 1;`
    );
    const usdToCop = safeNumber(rateRows[0]?.usd_to_cop ?? 0);

    const convertToCOP = (value: number, currency?: string, rate?: number) =>
      currency === "USD" ? safeNumber(value) * (rate || usdToCop) : safeNumber(value);

    let apiUrl = "";

    // -----------------------
    // 1) Diversificación por tipo (Donut/Pie)
    // -----------------------
    if (type === "diversificacion") {
      const rows = await sql`
        SELECT a.type, a.currency, SUM(COALESCE(t.latest_value, 0)) AS total_value
        FROM accounts a
        LEFT JOIN LATERAL (
          SELECT t.new_value as latest_value, t.usd_to_cop_rate
          FROM transactions t
          WHERE t.account_id = a.id AND t.new_value IS NOT NULL
          ORDER BY t.date DESC, t.updated_at DESC
          LIMIT 1
        ) t ON true
        ${userId ? sql`WHERE a.user_id = ${userId}` : sql``}
        GROUP BY a.type, a.currency
        ORDER BY SUM(COALESCE(t.latest_value, 0)) DESC;
      `;

      const labels = rows.map((r: any) => r.type);
      const data = rows.map((r: any) => convertToCOP(Number(r.total_value), r.currency));

      if (data.length === 0 || data.every(v => v === 0)) {
        apiUrl = `https://image-charts.com/chart?chs=600x300&cht=p&chd=t:1&chl=Sin%20datos&chtt=Diversificación%20por%20tipo`;
      } else {
        apiUrl = `https://image-charts.com/chart?` +
          `chs=600x400&` +
          `cht=pd&` + // Donut chart
          `chd=t:${data.join(',')};&` +
          `chl=${labels.map(l => encodeURIComponent(l)).join('|')}&` +
          `chtt=Diversificación%20por%20tipo%20(COP)&` +
          `chco=6384FF|4ECDC4|FF6B6B|FFA07A|98D8C8|F7DC6F&` +
          `chf=bg,s,FFFFFF`;
      }
    }

    // -----------------------
    // 2) Historial total del portafolio (line)
    // -----------------------
    else if (type === "historial_valores") {
      const rows = await sql`
        SELECT t.date, SUM(
          CASE WHEN a.currency = 'USD' 
            THEN COALESCE(t.new_value, 0) * COALESCE(t.usd_to_cop_rate, ${usdToCop})
            ELSE COALESCE(t.new_value, 0)
          END
        ) AS total_cop
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        ${userId ? sql`WHERE a.user_id = ${userId} AND t.new_value IS NOT NULL` : sql`WHERE t.new_value IS NOT NULL`}
        GROUP BY t.date
        ORDER BY t.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.total_cop));
      const normalizedData = normalizeData(data);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` + // Line chart
        `chd=t:${normalizedData.join(',')};&` +
        `chxt=x,y&` +
        `chxl=0:|${labels[0]}|${labels[Math.floor(labels.length/2)]}|${labels[labels.length-1]}&` +
        `chtt=Historial%20del%20valor%20del%20portafolio%20(COP)&` +
        `chco=6384FF&` +
        `chls=3&` + // Line width
        `chm=B,6384FF33,0,0,0&` + // Fill area
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`; // Grid
    }

    // -----------------------
    // 3) Historial de aportes
    // -----------------------
    else if (type === "historial_aportes") {
      const rows = await sql`
        SELECT t.date, SUM(
          CASE WHEN t.currency = 'USD' 
            THEN t.amount * COALESCE(t.usd_to_cop_rate, ${usdToCop})
            ELSE t.amount
          END
        ) AS total_cop
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.type = 'contribution'
        ${userId ? sql`AND a.user_id = ${userId}` : sql``}
        GROUP BY t.date
        ORDER BY t.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.total_cop));
      const normalizedData = normalizeData(data);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedData.join(',')};&` +
        `chxt=x,y&` +
        `chxl=0:|${labels[0]}|${labels[labels.length-1]}&` +
        `chtt=Aportes%20por%20fecha%20(COP)&` +
        `chco=FF6384&` +
        `chls=3&` +
        `chm=B,FF638433,0,0,0&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // 4) Rendimientos diarios
    // -----------------------
    else if (type === "rendimientos") {
      const rows = await sql`
        SELECT t.date, t.total AS total_cop, t.total - LAG(t.total) OVER (ORDER BY t.date) AS rendimiento
        FROM (
          SELECT tr.date AS date, SUM(
            CASE WHEN a.currency = 'USD' 
              THEN COALESCE(tr.new_value, 0) * COALESCE(tr.usd_to_cop_rate, ${usdToCop})
              ELSE COALESCE(tr.new_value, 0)
            END
          ) AS total
          FROM transactions tr
          JOIN accounts a ON a.id = tr.account_id
          ${userId ? sql`WHERE a.user_id = ${userId} AND tr.new_value IS NOT NULL` : sql`WHERE tr.new_value IS NOT NULL`}
          GROUP BY tr.date
        ) t
        ORDER BY t.date ASC;
      `;

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const data = rows.map((r: any) => safeNumber(r.rendimiento));
      const normalizedData = normalizeData(data);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedData.join(',')};&` +
        `chtt=Rendimiento%20diario%20(COP)&` +
        `chco=4ECDC4&` +
        `chls=3&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // 5) Evolución por tipo de cuenta (multi-line)
    // -----------------------
    else if (type === "evolucion_por_tipo") {
      const rows = await sql`
        SELECT a.type, t.date, t.new_value as value, a.currency, t.usd_to_cop_rate
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        ${userId ? sql`WHERE a.user_id = ${userId} AND t.new_value IS NOT NULL` : sql`WHERE t.new_value IS NOT NULL`}
        ORDER BY t.date ASC;
      `;

      const dates = Array.from(new Set(rows.map((r: any) => formatDateToYMD(r.date)))).filter(Boolean);
      const types = Array.from(new Set(rows.map((r: any) => r.type)));

      const datasets = types.map((t) =>
        dates.map((d) => {
          const row = rows.find((x: any) => x.type === t && formatDateToYMD(x.date) === d);
          return row ? convertToCOP(Number(row.value), row.currency, row.usd_to_cop_rate) : 0;
        })
      );

      const normalizedDatasets = datasets.map(d => normalizeData(d));
      const colors = ['6384FF', 'FF6384', '4ECDC4', 'FFA07A', '98D8C8'];

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedDatasets.map(d => d.join(',')).join('|')}&` +
        `chdl=${types.join('|')}&` +
        `chtt=Evolución%20por%20tipo%20de%20cuenta&` +
        `chco=${colors.slice(0, types.length).join(',')}&` +
        `chls=3|3|3&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // 6) Ingresos vs Egresos (bar)
    // -----------------------
    else if (type === "ingresos_vs_egresos") {
      const ingresos = await sql`
        SELECT t.date, SUM(
          CASE WHEN t.currency = 'USD' 
            THEN t.amount * COALESCE(t.usd_to_cop_rate, ${usdToCop})
            ELSE t.amount
          END
        ) AS total_cop
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.type = 'contribution'
        ${userId ? sql`AND a.user_id = ${userId}` : sql``}
        GROUP BY t.date
        ORDER BY t.date ASC;
      `;
      
      const egresos = await sql`
        SELECT t.date, SUM(
          CASE WHEN t.currency = 'USD' 
            THEN t.amount * COALESCE(t.usd_to_cop_rate, ${usdToCop})
            ELSE t.amount
          END
        ) AS total_cop
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.type = 'withdrawal'
        ${userId ? sql`AND a.user_id = ${userId}` : sql``}
        GROUP BY t.date
        ORDER BY t.date ASC;
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

      const normalizedIngresos = normalizeData(ingresosData);
      const normalizedEgresos = normalizeData(egresosData);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=bvg&` + // Vertical bar grouped
        `chd=t:${normalizedIngresos.join(',')}|${normalizedEgresos.join(',')}&` +
        `chdl=Ingresos|Egresos&` +
        `chtt=Ingresos%20vs%20Egresos%20(COP)&` +
        `chco=4ECDC4,FF6384&` +
        `chf=bg,s,FFFFFF&` +
        `chbh=20,5,10`; // Bar width, spacing
    }

    // -----------------------
    // 7) Comparativa COP vs USD
    // -----------------------
    else if (type === "comparativa_cop_usd") {
      const rows = await sql`
        SELECT tr.date AS date, a.currency AS currency, 
          SUM(COALESCE(tr.new_value, 0)) AS total_native,
          COALESCE(tr.usd_to_cop_rate, ${usdToCop}) as rate
        FROM transactions tr
        JOIN accounts a ON a.id = tr.account_id
        ${userId ? sql`WHERE a.user_id = ${userId} AND tr.new_value IS NOT NULL` : sql`WHERE tr.new_value IS NOT NULL`}
        GROUP BY tr.date, a.currency, tr.usd_to_cop_rate
        ORDER BY tr.date ASC;
      `;

      const dates = Array.from(new Set(rows.map((r: any) => formatDateToYMD(r.date)))).filter(Boolean);

      const copData = dates.map((d) => {
        const r = rows.find((x: any) => x.currency === "COP" && formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_native) : 0;
      });
      
      const usdData = dates.map((d) => {
        const r = rows.find((x: any) => x.currency === "USD" && formatDateToYMD(x.date) === d);
        return r ? safeNumber(r.total_native) * safeNumber(r.rate) : 0;
      });

      const normalizedCOP = normalizeData(copData);
      const normalizedUSD = normalizeData(usdData);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedCOP.join(',')}|${normalizedUSD.join(',')}&` +
        `chdl=COP|USD%20(convertido)&` +
        `chtt=Comparativa%20COP%20vs%20USD&` +
        `chco=6384FF,FFA07A&` +
        `chls=3|3&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // 8) Rentabilidad acumulada
    // -----------------------
    else if (type === "rentabilidad_acumulada") {
      const rows = await sql`
        SELECT tr.date AS date, SUM(
          CASE WHEN a.currency = 'USD' 
            THEN COALESCE(tr.new_value, 0) * COALESCE(tr.usd_to_cop_rate, ${usdToCop})
            ELSE COALESCE(tr.new_value, 0)
          END
        ) AS total_cop
        FROM transactions tr
        JOIN accounts a ON a.id = tr.account_id
        ${userId ? sql`WHERE a.user_id = ${userId} AND tr.new_value IS NOT NULL` : sql`WHERE tr.new_value IS NOT NULL`}
        GROUP BY tr.date
        ORDER BY tr.date ASC;
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
      const normalizedData = normalizeData(data);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedData.join(',')};&` +
        `chtt=Rentabilidad%20acumulada%20(COP)&` +
        `chco=4BC0C0&` +
        `chls=3&` +
        `chm=B,4BC0C033,0,0,0&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // 9) Rendimiento porcentual diario
    // -----------------------
    else if (type === "rendimiento_porcentual") {
      const rows = await sql`
        SELECT tr.date AS date, SUM(
          CASE WHEN a.currency = 'USD' 
            THEN COALESCE(tr.new_value, 0) * COALESCE(tr.usd_to_cop_rate, ${usdToCop})
            ELSE COALESCE(tr.new_value, 0)
          END
        ) AS total_cop
        FROM transactions tr
        JOIN accounts a ON a.id = tr.account_id
        ${userId ? sql`WHERE a.user_id = ${userId} AND tr.new_value IS NOT NULL` : sql`WHERE tr.new_value IS NOT NULL`}
        GROUP BY tr.date
        ORDER BY tr.date ASC;
      `;

      const data = rows.map((r: any, i: number) => {
        if (i === 0) return 0;
        const prev = safeNumber(rows[i - 1].total_cop);
        const curr = safeNumber(r.total_cop);
        return prev === 0 ? 0 : ((curr - prev) / prev) * 100;
      });

      const labels = rows.map((r: any) => formatDateToYMD(r.date));
      const normalizedData = normalizeData(data);

      apiUrl = `https://image-charts.com/chart?` +
        `chs=800x400&` +
        `cht=lc&` +
        `chd=t:${normalizedData.join(',')};&` +
        `chtt=Rendimiento%20porcentual%20diario&` +
        `chco=FF9F40&` +
        `chls=3&` +
        `chm=B,FF9F4033,0,0,0&` +
        `chf=bg,s,FFFFFF&` +
        `chg=20,20,1,5`;
    }

    // -----------------------
    // fallback
    // -----------------------
    else {
      return new Response("Tipo de gráfico no válido", { status: 400 });
    }

    // Fetch desde Image-Charts
    if (!apiUrl) {
      apiUrl = `https://image-charts.com/chart?chs=600x300&cht=p&chd=t:1&chl=Sin%20datos`;
    }

    const res = await fetch(apiUrl);
    const arrayBuffer = await res.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: any) {
    console.error("Error in /api/graphics:", err);
    return new Response(`Internal Server Error: ${String(err.message ?? err)}`, { status: 500 });
  }
};