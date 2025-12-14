/// <reference types="astro/client" />
/// <reference types="vite/client" />

declare namespace App {
    interface Locals {
        userId: string | null;
        name: string | null;
        user_type: string | null;
        csrfToken: string;
    }
}