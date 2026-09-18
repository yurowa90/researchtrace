"use client";
import { verifySchoolBackup } from "@/lib/verify-school-backup";

export async function downloadSchoolBackup() {
  const response = await fetch("/api/school-backup", { cache: "no-store" });
  if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "백업을 만들지 못했습니다."); }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const verified = await verifySchoolBackup(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a"); a.href = url; a.download = `TRACE-school-backup-${verified.capturedAt.replace(/[^0-9TZ-]/g, "-")}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { verified, receipt: response.headers.get("X-TRACE-Migration-Backup") };
}
