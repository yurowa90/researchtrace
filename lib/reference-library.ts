import { latestGuidance, decodeGuidance } from "@/lib/guidance";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { referenceMaterials, referenceSelections, guidanceEntries } from "@/db/schema";
import type { Viewer } from "@/lib/data";
import { googleEnabled, readGoogleState } from "@/lib/google-bridge";
import { currentGoogleViewer, googlePortalData } from "@/lib/google-school";
import { MAX_REFERENCE_SELECTION, referenceRoleAllowed } from "@/lib/reference-materials";

const publicColumns = {
  id: referenceMaterials.id, title: referenceMaterials.title, institution: referenceMaterials.institution,
  admissionsYear: referenceMaterials.admissionsYear, admissionTrack: referenceMaterials.admissionTrack,
  category: referenceMaterials.category, note: referenceMaterials.note, originalName: referenceMaterials.originalName,
  contentType: referenceMaterials.contentType, sizeBytes: referenceMaterials.sizeBytes, sha256: referenceMaterials.sha256,
  status: referenceMaterials.status, createdAt: referenceMaterials.createdAt,
};
export async function getReferenceLibrary(viewer: Viewer) {
  if (!referenceRoleAllowed(viewer)) return { referenceMaterials: [], selectedReferenceMaterialIds: [] };
  if (await googleEnabled()) { const data = googlePortalData(await readGoogleState(), viewer); return { referenceMaterials: data.referenceMaterials, selectedReferenceMaterialIds: data.selectedReferenceMaterialIds }; }
  const db = getDb();
  const materials = await db.select(publicColumns).from(referenceMaterials).orderBy(desc(referenceMaterials.createdAt), desc(referenceMaterials.id));
  const [selection] = await db.select().from(referenceSelections).where(eq(referenceSelections.userId, viewer.id)).limit(1);
  let ids: number[] = [];
  try { const value: unknown = JSON.parse(selection?.materialIdsJson ?? "[]"); if (Array.isArray(value)) ids = value.filter((id) => Number.isSafeInteger(id) && materials.some((item) => item.id === id && item.status === "active")); } catch { /* Recover an invalid saved selection as empty. */ }
  return { referenceMaterials: materials, selectedReferenceMaterialIds: ids };
}
export async function saveReferenceSelection(viewer: Viewer, value: unknown) {
  if (!referenceRoleAllowed(viewer)) throw new Error("교사 또는 관리자 권한이 필요합니다.");
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_SELECTION || value.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(value).size !== value.length) throw new Error(`평가 자료는 중복 없이 최대 ${MAX_REFERENCE_SELECTION}건까지 선택하세요.`);
  const db = getDb();
  const selected = value.length ? await db.select({ id: referenceMaterials.id }).from(referenceMaterials).where(and(inArray(referenceMaterials.id, value), eq(referenceMaterials.status, "active"))) : [];
  if (selected.length !== value.length) throw new Error("일부 자료가 없거나 보관 처리되었습니다. 목록을 다시 확인하세요.");
  await db.insert(referenceSelections).values({ userId: viewer.id, materialIdsJson: JSON.stringify(value) }).onConflictDoUpdate({ target: referenceSelections.userId, set: { materialIdsJson: JSON.stringify(value) } });
  return { ok: true };
}
export async function setReferenceStatus(viewer: Viewer, id: unknown, status: unknown) {
  if (!referenceRoleAllowed(viewer, true)) throw new Error("관리자만 공용 평가 자료를 관리할 수 있습니다.");
  if (!Number.isSafeInteger(id) || Number(id) < 1 || (status !== "active" && status !== "archived")) throw new Error("자료 상태를 확인하세요.");
  const rows = await getDb().update(referenceMaterials).set({ status }).where(eq(referenceMaterials.id, Number(id))).returning({ id: referenceMaterials.id });
  if (!rows.length) throw new Error("자료를 찾을 수 없습니다.");
  return { ok: true };
}

export async function getReferenceRows(viewer: Viewer, ids: number[]) {
  if (!referenceRoleAllowed(viewer)) throw new Error("교사 또는 관리자 권한이 필요합니다.");
  if (await googleEnabled()) { const state=await readGoogleState(); if(!referenceRoleAllowed(currentGoogleViewer(state,viewer))) throw new Error("접근 권한이 없습니다."); return state.tables.referenceMaterials.filter(row=>ids.includes(row.id)); }
  return ids.length ? getDb().select().from(referenceMaterials).where(inArray(referenceMaterials.id,ids)) : [];
}

export async function getReferenceGuidance(viewer: Viewer) {
  if(!referenceRoleAllowed(viewer))throw new Error("교사 권한이 필요합니다.");
  if(await googleEnabled()){const state=await readGoogleState();if(!referenceRoleAllowed(currentGoogleViewer(state,viewer)))throw new Error("교사 권한이 필요합니다.");return latestGuidance(state.tables.guidanceEntries).filter(e=>e.kind==="reference").map(decodeGuidance);}
  return latestGuidance(await getDb().select().from(guidanceEntries).where(and(isNull(guidanceEntries.studentId),eq(guidanceEntries.kind,"reference")))).map(decodeGuidance);
}
