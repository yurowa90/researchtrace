import { ensureViewer, getPortalData, performPortalAction } from "@/lib/data";

export const dynamic = "force-dynamic";

function message(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  return detail && !/Failed query|D1_ERROR|SQLITE_|constraint failed|\bSELECT\s.+\bFROM\b/i.test(detail) ? detail : "자료를 처리하지 못했습니다. 잠시 후 다시 시도하고 문제가 계속되면 관리자에게 알려주세요.";
}

export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    return Response.json(await getPortalData(viewer), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("portal GET failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(await performPortalAction(viewer, body));
  } catch (error) {
    console.error("portal POST failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: message(error) }, { status: 400 });
  }
}
