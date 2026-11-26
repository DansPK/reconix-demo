/* Requests that hand something out (the session cookie) or change something must come from
   the dashboard's own pages: their Origin header has to match the Host they were sent to. */

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return Boolean(origin && host && origin === `http://${host}`);
}
