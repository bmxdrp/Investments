import type { APIRoute } from "astro";
import { sql } from "@lib/db";

export const GET: APIRoute = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('COP','USD'))
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS contributions (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('COP','USD')),
      note TEXT
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('COP','USD')),
      note TEXT
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS portfolio_values (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      value NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('COP','USD'))
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      date DATE PRIMARY KEY,
      usd_to_cop NUMERIC(18,4) NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
  );
`;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS account_value_history (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      value NUMERIC(18,2) NOT NULL,
      value_cop NUMERIC(18,2) NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('COP','USD')),
      usd_to_cop_rate NUMERIC(18,4) NOT NULL,
      created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
      UNIQUE(account_id, date)
    );
  `;

  return new Response("OK – Database initialized.");
};
