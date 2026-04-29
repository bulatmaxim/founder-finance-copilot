export function logAuthDebug(
  event: string,
  details: Record<string, string | number | boolean | null | string[]>,
) {
  console.info(`[auth] ${event}`, details);
}

export function cookieNamesFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(Boolean)
    .sort();
}
