/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    userId: string | null;
    userRole: string | null;
    username: string | null;
  }
}
