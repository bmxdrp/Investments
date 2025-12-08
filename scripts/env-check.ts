#!/usr/bin/env node

/**
 * CLI Tool para gestión de secretos
 * Uso: node scripts/env-check.js
 */

import { checkEnvSetup, generateSecret } from '../src/lib/env.ts';

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
    
}

function printHeader() {
    log('\n╔════════════════════════════════════════════╗', colors.cyan);
    log('║   🔐 Environment Variables Checker        ║', colors.cyan);
    log('╚════════════════════════════════════════════╝\n', colors.cyan);
}

function printSection(title: string) {
    log(`\n${title}`, colors.blue);
    log('─'.repeat(50), colors.blue);
}

function checkEnvironment() {
    printHeader();

    const result = checkEnvSetup();

    if (result.isValid) {
        log('✅ Todas las variables de entorno están configuradas correctamente!', colors.green);
        return true;
    }

    log('❌ Hay problemas con las variables de entorno\n', colors.red);

    if (result.missing.length > 0) {
        printSection('Variables Faltantes:');
        result.missing.forEach((variable) => {
            log(`  ❌ ${variable}`, colors.red);
        });
    }

    if (result.invalid.length > 0) {
        printSection('Variables Inválidas:');
        result.invalid.forEach((error) => {
            log(`  ⚠️  ${error}`, colors.yellow);
        });
    }

    printSection('Cómo Solucionar:');
    log('1. Copia .env.example a .env:', colors.cyan);
    log('   cp .env.example .env\n', colors.reset);
    log('2. Edita .env y completa los valores', colors.cyan);
    log('3. Vuelve a ejecutar este script para verificar\n', colors.cyan);

    return false;
}

function generateSecrets() {
    printHeader();
    printSection('Generar Secretos Seguros');

    log('\nCRON_SECRET (32 caracteres):', colors.cyan);
    log(`  ${generateSecret(32)}\n`, colors.green);

    log('CRON_SECRET (64 caracteres - extra seguro):', colors.cyan);
    log(`  ${generateSecret(64)}\n`, colors.green);

    log('Copia uno de estos valores a tu archivo .env', colors.yellow);
}

function showHelp() {
    printHeader();
    log('Uso:', colors.cyan);
    log('  node scripts/env-check.js [comando]\n', colors.reset);

    log('Comandos:', colors.cyan);
    log('  check      Verifica las variables de entorno (default)', colors.reset);
    log('  generate   Genera secretos seguros', colors.reset);
    log('  help       Muestra esta ayuda\n', colors.reset);

    log('Ejemplos:', colors.cyan);
    log('  node scripts/env-check.js', colors.reset);
    log('  node scripts/env-check.js generate', colors.reset);
}

// Main
const command = process.argv[2] || 'check';

switch (command) {
    case 'check':
        const isValid = checkEnvironment();
        process.exit(isValid ? 0 : 1);
        break;

    case 'generate':
        generateSecrets();
        break;

    case 'help':
    case '--help':
    case '-h':
        showHelp();
        break;

    default:
        log(`❌ Comando desconocido: ${command}\n`, colors.red);
        showHelp();
        process.exit(1);
}
