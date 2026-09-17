// Every browser write stays on its own Site. School role authorization is still
// required after this check; this is a CSRF boundary, not authentication.
export function rejectCrossSiteWrite(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  let foreignOrigin = false;
  if (origin) { try { foreignOrigin = new URL(origin).origin !== new URL(request.url).origin; } catch { foreignOrigin = true; } }
  if (request.headers.get("Sec-Fetch-Site") === "cross-site" || foreignOrigin) return Response.json({ error: "다른 사이트에서 보낸 변경 요청은 처리하지 않습니다. TRACE 화면에서 다시 실행하세요." }, {status:403,headers:{"Cache-Control":"private, no-store"}});
  return null;
}
