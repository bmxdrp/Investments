import { sql } from './db';

// Estructura para almacenar rate limits en PostgreSQL
interface RateLimitRecord {
    identifier: string;
    endpoint: string;
    count: number;
    window_start: Date;
    expires_at: Date;
}

// Configuraciones de rate limiting
export const rateLimitConfigs = {
    auth: {
        requests: 5,
        windowMs: 15 * 60 * 1000, // 15 minutos
    },
    email: {
        requests: 3,
        windowMs: 15 * 60 * 1000, // 15 minutos
    },
    api: {
        requests: 100,
        windowMs: 60 * 1000, // 1 minuto
    },
    public: {
        requests: 30,
        windowMs: 60 * 1000, // 1 minuto
    },
};

export type RateLimitType = keyof typeof rateLimitConfigs;

// Helper para extraer IP del request
export function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    return 'unknown';
}

// Helper para crear respuesta de rate limit excedido
export function createRateLimitResponse(resetTime?: number): Response {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Retry-After': resetTime ? Math.ceil((resetTime - Date.now()) / 1000).toString() : '60',
    };

    return new Response(
        JSON.stringify({
            success: false,
            error: 'Too many requests',
            message: 'Has excedido el límite de intentos. Por favor, intenta de nuevo más tarde.',
        }),
        {
            status: 429,
            headers,
        }
    );
}

// Función principal de rate limiting usando PostgreSQL
export async function checkRateLimit(
    identifier: string,
    endpoint: string,
    limitType: RateLimitType
): Promise<{ allowed: boolean; resetTime?: number }> {
    const config = rateLimitConfigs[limitType];
    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);

    try {
        // 1. Limpiar registros expirados (solo ocasionalmente para no sobrecargar)
        if (Math.random() < 0.1) { // 10% de las veces
            await sql`
        DELETE FROM rate_limits 
        WHERE expires_at < NOW()
      `;
        }

        // 2. Obtener o crear registro de rate limit
        const existing = await sql`
      SELECT count, window_start, expires_at
      FROM rate_limits
      WHERE identifier = ${identifier}
        AND endpoint = ${endpoint}
        AND expires_at > NOW()
      LIMIT 1
    `;

        if (existing.length === 0) {
            // Primer request en esta ventana - crear registro
            const expiresAt = new Date(now.getTime() + config.windowMs);

            await sql`
        INSERT INTO rate_limits (identifier, endpoint, count, window_start, expires_at)
        VALUES (${identifier}, ${endpoint}, 1, ${now.toISOString()}, ${expiresAt.toISOString()})
        ON CONFLICT (identifier, endpoint) 
        DO UPDATE SET 
          count = 1,
          window_start = ${now.toISOString()},
          expires_at = ${expiresAt.toISOString()}
      `;

            return { allowed: true };
        }

        const record = existing[0];
        const recordWindowStart = new Date(record.window_start);

        // 3. Verificar si estamos en la misma ventana
        if (recordWindowStart < windowStart) {
            // Nueva ventana - resetear contador
            const expiresAt = new Date(now.getTime() + config.windowMs);

            await sql`
        UPDATE rate_limits
        SET count = 1,
            window_start = ${now.toISOString()},
            expires_at = ${expiresAt.toISOString()}
        WHERE identifier = ${identifier}
          AND endpoint = ${endpoint}
      `;

            return { allowed: true };
        }

        // 4. Misma ventana - verificar límite
        if (record.count >= config.requests) {
            // Límite excedido
            const resetTime = new Date(record.expires_at).getTime();
            return { allowed: false, resetTime };
        }

        // 5. Incrementar contador
        await sql`
      UPDATE rate_limits
      SET count = count + 1
      WHERE identifier = ${identifier}
        AND endpoint = ${endpoint}
    `;

        return { allowed: true };

    } catch (error) {
        console.error('Rate limit error:', error);
        // En caso de error, permitir la request (fail open)
        return { allowed: true };
    }
}

// Middleware helper para aplicar rate limiting
export async function applyRateLimit(
    request: Request,
    endpoint: string,
    limitType: RateLimitType,
    identifier?: string
): Promise<{ success: boolean; response?: Response }> {
    const ip = identifier || getClientIp(request);

    const result = await checkRateLimit(ip, endpoint, limitType);

    if (!result.allowed) {
        return {
            success: false,
            response: createRateLimitResponse(result.resetTime),
        };
    }

    return { success: true };
}
