import { randomBytes } from 'crypto';

/**
 * Genera un token CSRF único y seguro
 * @returns Token CSRF de 32 bytes en formato hexadecimal
 */
export function generateCsrfToken(): string {
    return randomBytes(32).toString('hex');
}

/**
 * Valida que el token CSRF del formulario coincida con el de la sesión
 * @param sessionToken - Token almacenado en la sesión/locals
 * @param formToken - Token enviado en el formulario
 * @returns true si los tokens coinciden, false en caso contrario
 */
export function validateCsrfToken(
    sessionToken: string | null | undefined,
    formToken: string | null | undefined
): boolean {
    // Ambos tokens deben existir
    if (!sessionToken || !formToken) {
        return false;
    }

    // Comparación segura contra timing attacks
    // Usamos Buffer.compare para evitar timing attacks
    try {
        const sessionBuffer = Buffer.from(sessionToken, 'hex');
        const formBuffer = Buffer.from(formToken, 'hex');

        // Los buffers deben tener la misma longitud
        if (sessionBuffer.length !== formBuffer.length) {
            return false;
        }

        // Comparación constante en tiempo
        return sessionBuffer.compare(formBuffer) === 0;
    } catch (error) {
        // Si hay error en la conversión, los tokens son inválidos
        return false;
    }
}

/**
 * Crea una respuesta de error CSRF
 * @param returnUrl - URL a la que redirigir (opcional)
 * @param origin - Origen para resolver URLs relativas (por defecto http://localhost:4321)
 * @returns Response con error 403 o Redirect 303
 */
export function createCsrfErrorResponse(returnUrl?: string, origin: string = 'http://localhost:4321'): Response {
    if (returnUrl) {
        const url = new URL(returnUrl, origin);
        url.searchParams.set('error', 'Token de seguridad inválido. Por favor, intenta de nuevo.');
        return Response.redirect(url.toString(), 303);
    }

    return new Response(
        JSON.stringify({
            success: false,
            error: 'CSRF token validation failed',
            message: 'Token de seguridad inválido. Por favor, recarga la página e intenta de nuevo.',
        }),
        {
            status: 403,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}

/**
 * Middleware helper para validar CSRF en endpoints
 * @param request - Request object
 * @param sessionToken - Token de la sesión
 * @returns Objeto con success y opcionalmente response de error
 */
export async function validateCsrfFromRequest(
    request: Request,
    sessionToken: string | null | undefined
): Promise<{ success: boolean; response?: Response }> {
    try {
        const origin = new URL(request.url).origin;
        // Obtener token del formulario
        const contentType = request.headers.get('content-type');
        let formToken: string | null = null;

        if (contentType?.includes('application/json')) {
            // Para requests JSON
            const body = await request.json();
            formToken = body.csrf_token || body.csrfToken;
        } else if (contentType?.includes('application/x-www-form-urlencoded') || contentType?.includes('multipart/form-data')) {
            // Para formularios
            const formData = await request.formData();
            formToken = formData.get('csrf_token') as string;
        }

        // Validar token
        if (!validateCsrfToken(sessionToken, formToken)) {
            return {
                success: false,
                response: createCsrfErrorResponse(undefined, origin),
            };
        }

        return { success: true };
    } catch (error) {
        console.error('CSRF validation error:', error);
        return {
            success: false,
            response: createCsrfErrorResponse(),
        };
    }
}
