/// <reference types="astro/client" />
/// <reference types="vite/client" />

declare namespace App {
    interface Locals {
        userId: string | null;
        userRoleId: string | null;
        csrfToken: string;
    }
}