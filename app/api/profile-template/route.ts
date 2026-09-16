import { profileImportExample } from "@/lib/profile-import";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify(profileImportExample, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=trace-work-result-example.json",
      "Cache-Control": "private, no-store",
    },
  });
}
