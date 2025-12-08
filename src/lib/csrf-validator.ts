import type { APIContext } from 'astro';
import { validateCsrfToken, createCsrfErrorResponse } from './csrf';

/**
 * Valida el token CSRF en un endpoint API
 * @param context - Contexto de Astro (request, locals)
 * @param returnUrl - URL de redirección en caso de error (opcional)
 * @returns Objeto con success y opcionalmente response de error
 */
export async function validateCsrf(
    context: APIContext,
    returnUrl?: string
): Promise<{ success: boolean; response?: Response; formData?: FormData; jsonBody?: any }> {
    const { request, locals } = context;
    const sessionToken = locals.csrfToken;

    try {
        let formToken: string | null = null;

        // 1. Intentar obtener token de headers
        const headerToken = request.headers.get('x-csrf-token') || request.headers.get('x-xsrf-token');
        if (headerToken) {
            formToken = headerToken;
        }

        const contentType = request.headers.get('content-type') || '';
        let jsonBody: any = null;
        let formData: FormData | null = null;

        // Si ya tenemos token del header, NO necesitamos leer el body obligatoriamente para buscar el token,
        // PERO si el usuario necesita el body (en jsonBody o formData), debemos leerlo de todas formas para no perder el stream.
        // OJO: Si leemos el body aquí, lo consumimos. Si el endpoint lo necesita, debe usar lo que retornamos.

        if (contentType.includes('application/json')) {
            try {
                // Clonamos por seguridad si fuera posible, pero en Astro standard Request consumimos.
                // Si el body está vacío, json() falla en algunos casos.
                const text = await request.text();
                if (text && text.trim().length > 0) {
                    jsonBody = JSON.parse(text);
                    if (!formToken) formToken = jsonBody.csrf_token || jsonBody.csrfToken;
                }
            } catch (e) {
                // Error parseando JSON, ignoramos body para token
                console.warn('[CSRF] JSON parsing error or empty body', e);
            }
        } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
            try {
                formData = await request.formData();
                if (!formToken) formToken = formData.get('csrf_token') as string;
            } catch (e) {
                // Error leyendo form data
                console.warn('[CSRF] Form data parsing error', e);
            }
        }

        // Validar token
        if (!validateCsrfToken(sessionToken, formToken)) {
            const origin = new URL(request.url).origin;
            return {
                success: false,
                response: createCsrfErrorResponse(returnUrl, origin),
            };
        }

        return {
            success: true,
            formData: formData || undefined,
            jsonBody: jsonBody || undefined
        };
    } catch (error) {
        console.error('[CSRF] Validation error:', error);
        const origin = new URL(request.url).origin;
        return {
            success: false,
            response: createCsrfErrorResponse(returnUrl, origin),
        };
    }
}
