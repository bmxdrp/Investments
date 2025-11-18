import { Lucia } from "lucia";
import { neon } from "@neondatabase/serverless";
import { PostgresqlAdapter } from "@lucia-auth/adapter-postgresql";

const sql = neon(import.meta.env.DATABASE_URL);

const adapter = new PostgresqlAdapter(sql, {
    users: "users",
    sessions: "sessions"
});

export const auth = new Lucia(adapter, {
    sessionCookie: {
        attributes: {
            secure: true
        }
    }
});

// opcional: tipado
declare module "lucia" {
    interface Register {
        Lucia: typeof auth;
    }
}
