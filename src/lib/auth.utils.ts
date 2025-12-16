export function getCookie(name: string, cookieHeader: string): string | null {
  return cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] ?? null;
}

export function isRouteMatch(path: string, routes: string[]) {
  return routes.some(r => path.startsWith(r));
}
