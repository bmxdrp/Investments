
require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('Error: DATABASE_URL not found in environment');
    process.exit(1);
}

// Use Pool for raw queries which is more standard for migrations
const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigration() {
    const migrationFile = process.argv[2];
    if (!migrationFile) {
        console.error('Usage: node scripts/run-migration.cjs <path-to-sql-file>');
        process.exit(1);
    }

    const filePath = path.resolve(process.cwd(), migrationFile);
    console.log(`Reading migration from: ${filePath}`);

    try {
        const query = fs.readFileSync(filePath, 'utf8');
        console.log('Executing migration...');

        // Pool.query supports raw strings
        await pool.query(query);

        console.log('Migration executed successfully!');
        await pool.end();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
