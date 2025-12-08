/// <reference types="astro/client" />
/// <reference types="vite/client" />

declare namespace App {
    interface Locals {
        userId: string | null;
        userRole: string | null;
        csrfToken: string;
    }
}