#!/usr/bin/env node

/**
 * Security Headers Test Script
 * 
 * This script tests that all security headers are properly configured
 * Run with: node scripts/test-security-headers.js
 */

import http from 'node:http';

const TEST_URL = process.env.TEST_URL || 'http://localhost:4321';

const EXPECTED_HEADERS = {
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'x-xss-protection': '1; mode=block',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
    'content-security-policy': /default-src 'self'/,
};

// HSTS only in production
const PROD_HEADERS = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
};

console.log('🔒 Testing Security Headers\n');
console.log(`Target: ${TEST_URL}\n`);

const url = new URL(TEST_URL);
const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log('📊 Response Status:', res.statusCode, '\n');

    let passed = 0;
    let failed = 0;

    console.log('🔍 Checking Headers:\n');

    // Check expected headers
    for (const [headerName, expectedValue] of Object.entries(EXPECTED_HEADERS)) {
        const actualValue = res.headers[headerName];

        if (!actualValue) {
            console.log(`❌ ${headerName}: MISSING`);
            failed++;
            continue;
        }

        // Check if expected value is a regex
        if (expectedValue instanceof RegExp) {
            if (expectedValue.test(actualValue)) {
                console.log(`✅ ${headerName}: OK`);
                console.log(`   Value: ${actualValue.substring(0, 60)}${actualValue.length > 60 ? '...' : ''}`);
                passed++;
            } else {
                console.log(`❌ ${headerName}: INVALID`);
                console.log(`   Expected pattern: ${expectedValue}`);
                console.log(`   Actual: ${actualValue}`);
                failed++;
            }
        } else {
            if (actualValue === expectedValue) {
                console.log(`✅ ${headerName}: OK`);
                passed++;
            } else {
                console.log(`❌ ${headerName}: MISMATCH`);
                console.log(`   Expected: ${expectedValue}`);
                console.log(`   Actual: ${actualValue}`);
                failed++;
            }
        }
    }

    // Check CORS headers (if origin is present)
    console.log('\n🌐 CORS Headers:\n');

    const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'access-control-allow-methods',
        'access-control-allow-headers',
    ];

    let corsFound = false;
    for (const header of corsHeaders) {
        if (res.headers[header]) {
            console.log(`✅ ${header}: ${res.headers[header]}`);
            corsFound = true;
        }
    }

    if (!corsFound) {
        console.log('ℹ️  No CORS headers (expected if no Origin header sent)');
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📈 Summary:\n');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);

    if (failed === 0) {
        console.log('\n🎉 All security headers are properly configured!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some security headers are missing or incorrect.');
        console.log('Please check src/middleware.ts');
        process.exit(1);
    }
});

req.on('error', (error) => {
    console.error('❌ Error testing headers:', error.message);
    console.error('\nMake sure the development server is running:');
    console.error('  npm run dev');
    process.exit(1);
});

req.end();
