import { ensureViewer, getPortalData, performPortalAction } from "@/lib/data";

export const dynamic = "force-dynamic";

function message(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    return Response.json(await getPortalData(viewer));
  } catch (error) {
    console.error("portal GET", error);
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
    console.error("portal POST", error);
    return Response.json({ error: message(error) }, { status: 400 });
  }
}
