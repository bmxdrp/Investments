import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
    try {
        // Obtener historial de tasas de cambio
        const rat = await sql`
      SELECT 
        date,
        usd_to_cop
      FROM exchange_rates
      ORDER BY date DESC
      LIMIT 7;
    `;
    const rates = rat.reverse();

        if (rates.length === 0) {
            return new Response(null, {
                status: 404,
                headers: { "Content-Type": "image/png" },
            });
        }
        // Preparar datos para el gráfico
        const labels = rates.map((r) => {
            const date = new Date(r.date);
            return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
        });

        const data = rates.map((r) => Number(r.usd_to_cop));

        // Configuración del gráfico
        const chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'USD/COP',
                    data: data,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: 'rgb(59, 130, 246)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historial de Tasa de Cambio USD/COP',
                        font: {
                            size: 18,
                            weight: 'bold'
                        },
                        color: '#1e293b',
                        padding: 20
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                size: 12
                            },
                            color: '#475569'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: {
                            size: 14
                        },
                        bodyFont: {
                            size: 13
                        },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context: any) {
                                return 'Tasa: $' + context.parsed.y.toLocaleString('es-CO', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                });
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function (value: any) {
                                return '$' + value.toLocaleString('es-CO');
                            },
                            font: {
                                size: 11
                            },
                            color: '#64748b'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 11
                            },
                            color: '#64748b',
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                }
            }
        };

        // Generar URL de QuickChart
        const apiUrl = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(chartConfig));

        // Hacer fetch a QuickChart para obtener la imagen
        const chartResponse = await fetch(apiUrl);

        if (!chartResponse.ok) {
            throw new Error("Error al obtener el gráfico de QuickChart");
        }

        // Obtener la imagen como buffer
        const imageBuffer = await chartResponse.arrayBuffer();

        // Devolver la imagen PNG
        return new Response(imageBuffer, {
            status: 200,
            headers: {
                "Content-Type": "image/png", // Cache por 5 minutos
            },
        });

    } catch (error) {
        console.error("Error generando gráfico:", error);

        // Devolver una respuesta de error
        return new Response(null, {
            status: 500,
            headers: { "Content-Type": "image/png" },
        });
    }
};
