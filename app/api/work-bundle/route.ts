import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studentRecords, profileSnapshots } from "@/db/schema";
import { ensureViewer, assertStudentAccess, getPortalData } from "@/lib/data";
import { googleEnabled, readGoogleState } from "@/lib/google-bridge";
import { getReferenceRows } from "@/lib/reference-library";
import { referenceFileName, referenceManifest } from "@/lib/reference-materials";
import { getStoredFile, headStoredFile } from "@/lib/file-storage";
import { streamZip, zipText, type ZipEntry } from "@/lib/zip-stream";
import { profileImportExample } from "@/lib/profile-import";
import { guidanceWorkContext } from "@/lib/guidance";
import { workRequestText } from "@/lib/work-result";

export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{
    const viewer=await ensureViewer();
    if(!viewer||viewer.status!=="approved"||viewer.role==="student")return Response.json({error:"담당 교사 또는 관리자만 Work 묶음을 받을 수 있습니다."},{status:403});
    const id=Number(new URL(request.url).searchParams.get("studentId"));
    if(!Number.isSafeInteger(id)||id<1)throw new Error("학생을 선택하세요.");
    const {student,classroom}=await assertStudentAccess(viewer,id);
    const portal=await getPortalData(viewer),cloud=await googleEnabled();
    const state=cloud?await readGoogleState():null;
    const records=state?state.tables.studentRecords.filter(r=>r.studentId===id):await getDb().select().from(studentRecords).where(eq(studentRecords.studentId,id));
    const snapshots=state?state.tables.profileSnapshots.filter(r=>r.studentId===id&&r.isActive):await getDb().select().from(profileSnapshots).where(and(eq(profileSnapshots.studentId,id),eq(profileSnapshots.isActive,true)));
    const materials=await getReferenceRows(viewer,portal.selectedReferenceMaterialIds);
    if(materials.some(r=>r.status!=="active"))throw new Error("평가 자료 선택을 다시 확인하세요.");
    if([...records,...materials].reduce((n,r)=>n+r.sizeBytes,0)>100*1024*1024)throw new Error("묶음은 100MB 이하입니다. 공용 자료를 따로 받아 재사용하세요.");
    for(const row of [...records,...materials])if(!await headStoredFile(row.objectKey))throw new Error("원본 파일이 없어 묶음을 만들지 못했습니다.");
    const safe=(name:string)=>name.replace(/[\\/\x00-\x1f]/g,"_").replace(/\.\./g,"_").slice(-150);
    const files:ZipEntry[]=[...records.map(r=>({...r,name:`RECORD-${r.id}-${safe(r.originalName)}`})),...materials.map(r=>({...r,name:referenceFileName(r)}))].map(r=>({name:r.name,size:r.sizeBytes,open:async()=>{const f=await getStoredFile(r.objectKey);if(!f)throw new Error("파일을 읽지 못했습니다.");return f.body;}}));
    files.push(zipText("Work-분석요청.txt",workRequestText(student,classroom,portal.records,materials,portal.guidance)));
    files.push(zipText("trace-work-result-example.json",JSON.stringify(profileImportExample,null,2)));
    files.push(zipText("reference-manifest.json",JSON.stringify(referenceManifest(materials,portal.guidance),null,2)));
    files.push(zipText("guidance-context.json",JSON.stringify(guidanceWorkContext(portal.guidance,id),null,2)));
    if(snapshots[0])files.push(zipText("previous-analysis.json",snapshots[0].rawJson));
    return new Response(streamZip(files),{headers:{"Content-Type":"application/zip","Content-Disposition":'attachment; filename="trace-student-work.zip"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"묶음을 만들지 못했습니다."},{status:400,headers:{"Cache-Control":"no-store"}});}
}
