import { z } from 'zod';

/**
 * Schema de validación para variables de entorno
 * Define todas las variables requeridas y sus validaciones
 */
const envSchema = z.object({
    // Base de datos
    DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida'),

    // SMTP (Email)
    SMTP_HOST: z.string().min(1, 'SMTP_HOST es requerido'),
    SMTP_PORT: z.string().regex(/^\d+$/, 'SMTP_PORT debe ser un número'),
    SMTP_USER: z.string().email('SMTP_USER debe ser un email válido'),
    SMTP_PASS: z.string().min(1, 'SMTP_PASS es requerido'),

    // API Externa
    CURRENCY_API_KEY: z.string().min(10, 'CURRENCY_API_KEY debe tener al menos 10 caracteres'),

    // Seguridad
    CRON_SECRET: z.string().min(32, 'CRON_SECRET debe tener al menos 32 caracteres para ser seguro'),

    // Opcional: Rol de administrador
    ROLE_ADMIN: z.string().optional().default('admin'),
});

/**
 * Tipo TypeScript inferido del schema
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Variables de entorno validadas
 * Se validan al importar este módulo
 */
let validatedEnv: Env | null = null;

/**
 * Valida las variables de entorno
 * @throws Error si alguna variable es inválida o falta
 */
export function validateEnv(): Env {
    if (validatedEnv) {
        return validatedEnv;
    }

    try {
        // Validar usando Zod
        validatedEnv = envSchema.parse({
            DATABASE_URL: import.meta.env.DATABASE_URL,
            SMTP_HOST: import.meta.env.SMTP_HOST,
            SMTP_PORT: import.meta.env.SMTP_PORT,
            SMTP_USER: import.meta.env.SMTP_USER,
            SMTP_PASS: import.meta.env.SMTP_PASS,
            CURRENCY_API_KEY: import.meta.env.CURRENCY_API_KEY,
            CRON_SECRET: import.meta.env.CRON_SECRET,
            ROLE_ADMIN: import.meta.env.ROLE_ADMIN,
        });
        return validatedEnv;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ Error en variables de entorno:');
            error.issues.forEach((issue) => {
                console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
            });
            throw new Error('Variables de entorno inválidas. Revisa los errores arriba.');
        }
        throw error;
    }
}

/**
 * Obtiene una variable de entorno validada
 * @param key - Nombre de la variable
 * @returns Valor de la variable
 */
export function getEnv<K extends keyof Env>(key: K): Env[K] {
    if (!validatedEnv) {
        validateEnv();
    }
    return validatedEnv![key];
}

/**
 * Obtiene todas las variables de entorno validadas
 * @returns Objeto con todas las variables
 */
export function getAllEnv(): Env {
    if (!validatedEnv) {
        validateEnv();
    }
    return validatedEnv!;
}

/**
 * Verifica si las variables de entorno están configuradas
 * Útil para mostrar mensajes de ayuda en desarrollo
 */
export function checkEnvSetup(): {
    isValid: boolean;
    missing: string[];
    invalid: string[];
} {
    const result = envSchema.safeParse({
        DATABASE_URL: import.meta.env.DATABASE_URL,
        SMTP_HOST: import.meta.env.SMTP_HOST,
        SMTP_PORT: import.meta.env.SMTP_PORT,
        SMTP_USER: import.meta.env.SMTP_USER,
        SMTP_PASS: import.meta.env.SMTP_PASS,
        CURRENCY_API_KEY: import.meta.env.CURRENCY_API_KEY,
        CRON_SECRET: import.meta.env.CRON_SECRET,
        ROLE_ADMIN: import.meta.env.ROLE_ADMIN,
    });

    if (result.success) {
        return { isValid: true, missing: [], invalid: [] };
    }

    const missing: string[] = [];
    const invalid: string[] = [];

    result.error.issues.forEach((issue) => {
        const field = issue.path.join('.');
        if (issue.message.includes('Required') || issue.message.includes('requerido')) {
            missing.push(field);
        } else {
            invalid.push(`${field}: ${issue.message}`);
        }
    });

    return { isValid: false, missing, invalid };
}

/**
 * Genera un secreto aleatorio seguro
 * Útil para generar CRON_SECRET
 */
export function generateSecret(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint8Array(length);

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
            result += chars[randomValues[i] % chars.length];
        }
    } else {
        // Fallback para Node.js
        const nodeCrypto = require('crypto');
        const bytes = nodeCrypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            result += chars[bytes[i] % chars.length];
        }
    }

    return result;
}

// NO validar automáticamente al importar
// La validación se hace cuando se llama a getEnv() o validateEnv()
// Esto permite que el servidor de desarrollo inicie incluso si faltan variables

// Exportar el env validado como default
export const env = {
    get: getEnv,
    getAll: getAllEnv,
    validate: validateEnv,
    check: checkEnvSetup,
    generateSecret,
};

export default env;
