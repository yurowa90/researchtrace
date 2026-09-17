import { rejectCrossSiteWrite } from "@/lib/request-guard";
import { ensureViewer } from "@/lib/data";
import { guidanceHistory, saveGuidance } from "@/lib/guidance-store";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request: Request) {
  try {const viewer=await ensureViewer();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});return Response.json({history:await guidanceHistory(viewer,new URL(request.url).searchParams.get("key")??"")},{headers});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"기록을 읽지 못했습니다."},{status:403,headers});}
}
export async function POST(request:Request){
  const rejected = rejectCrossSiteWrite(request); if (rejected) return rejected;
  try {const viewer=await ensureViewer();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});const raw=await request.text();if(raw.length>80000)throw new Error("한 번에 저장할 내용이 너무 큽니다.");return Response.json(await saveGuidance(viewer,JSON.parse(raw)),{headers});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"저장하지 못했습니다."},{status:400,headers});}
}
