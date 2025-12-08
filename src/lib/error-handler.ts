/**
 * Utilidad para manejo seguro de errores en API
 */

interface SafeErrorOptions {
    /**
     * Mensaje técnico para loguear en el servidor (no se muestra al usuario)
     */
    logMsg?: string;
    /**
     * Objeto de error original (para stack trace en logs server-side)
     */
    error?: unknown;
    /**
     * Código de estado HTTP (default: 500)
     */
    status?: number;
    /**
     * Si es true, retorna respuesta JSON. Si es false (o string URL), retorna redirect.
     */
    type?: 'json' | string;
}

export function handleApiError(options: SafeErrorOptions): Response {
    const { logMsg, error, status = 500, type = 'json' } = options;

    // 1. Generar ID único para rastreo (opcional, útil para soporte)
    const errorId = crypto.randomUUID();

    // 2. Logging seguro en Servidor (Nunca enviar esto al cliente)
    if (import.meta.env.PROD) {
        // En producción, JSON stringify estructurado
        console.error(JSON.stringify({
            level: 'error',
            id: errorId,
            message: logMsg || 'Internal Server Error',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
        }));
    } else {
        // En desarrollo, logging legible
        console.error(`[API Error ${errorId}]`, logMsg);
        if (error) console.error(error);
    }

    // 3. Mensaje seguro para el Cliente
    // Mensajes genéricos según el código de estado
    let clientMessage = "Ha ocurrido un error inesperado. Por favor intente más tarde.";

    if (status === 400) clientMessage = "Solicitud inválida.";
    if (status === 401) clientMessage = "Credenciales inválidas o sesión expirada.";
    if (status === 403) clientMessage = "No tiene permisos para realizar esta acción.";
    if (status === 404) clientMessage = "Recurso no encontrado.";
    if (status === 429) clientMessage = "Demasiados intentos. Por favor espere.";

    // 4. Retornar Respuesta
    if (type === 'json') {
        return new Response(JSON.stringify({
            success: false,
            error: clientMessage,
            code: errorId // Permitimos ver el ID para reporte de errores
        }), {
            status,
            headers: { "Content-Type": "application/json" }
        });
    } else {
        // Es una redirección
        const redirectUrl = new URL(type);
        redirectUrl.searchParams.set('error', clientMessage); // Mensaje seguro
        // redirectUrl.searchParams.set('eid', errorId); // Opcional

        return Response.redirect(redirectUrl.toString(), 303);
    }
}
