// Only Magnets-owned entry screens use this canvas. Customer pages retain their brand.
export const DARK_FLOW_ROUTES = [
  '/', '/login', '/register', '/verify-email', '/forgot-password',
  '/reset-password', '/create', '/preview',
];

export function isDarkFlowRoute(pathname: string) {
  return DARK_FLOW_ROUTES.some((route) => pathname === route ||
    (route !== '/' && pathname.startsWith(`${route}/`)));
}
