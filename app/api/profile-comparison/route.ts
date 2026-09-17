import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profileSnapshots } from "@/db/schema";
import { ensureViewer,assertStudentAccess } from "@/lib/data";
import { googleEnabled,readGoogleState } from "@/lib/google-bridge";
import { profileImportSchema } from "@/lib/profile-import";
import { profileDifference } from "@/lib/profile-evidence";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store"};
  try{const viewer=await ensureViewer();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    const params=new URL(request.url).searchParams,ids=[Number(params.get("before")),Number(params.get("after"))];
    if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids[0]===ids[1])throw new Error("비교할 서로 다른 두 버전을 선택하세요.");
    const state=await googleEnabled()?await readGoogleState():null;
    const load=async(id:number)=>state?state.tables.profileSnapshots.find(r=>r.id===id):(await getDb().select().from(profileSnapshots).where(eq(profileSnapshots.id,id)).limit(1))[0];
    const before=await load(ids[0]),after=await load(ids[1]);if(!before||!after||before.studentId!==after.studentId)throw new Error("같은 학생의 두 버전을 선택하세요.");
    await assertStudentAccess(viewer,before.studentId);
    const left=profileImportSchema.parse(JSON.parse(before.rawJson)),right=profileImportSchema.parse(JSON.parse(after.rawJson));
    const difference=profileDifference(left,right);
    return Response.json({before:{versionLabel:before.versionLabel,narrative:before.narrative},after:{versionLabel:after.versionLabel,narrative:after.narrative},difference},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"버전을 비교하지 못했습니다."},{status:400,headers});}
}
