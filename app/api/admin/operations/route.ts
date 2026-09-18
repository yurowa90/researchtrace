import { ensureViewer } from "@/lib/data";
import { AdminAccessError } from "@/lib/admin-data";
import { commitOperation, operationHistory, previewOperation } from "@/lib/admin-operations";
import { rejectCrossSiteWrite } from "@/lib/request-guard";
import { SiteAccessError } from "@/lib/site-runtime";
import { isSchoolAdmin } from "@/lib/school-permissions";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
function failure(e:unknown){const message=e instanceof Error?e.message:"";return Response.json({error:message&&!/SQLITE|D1_ERROR|constraint|Failed query/i.test(message)?message:"변경 내용을 처리하지 못했습니다. 다시 확인하세요."},{status:e instanceof AdminAccessError||e instanceof SiteAccessError?403:400,headers});}
async function actor(){const viewer=await ensureViewer();if(viewer&&!isSchoolAdmin(viewer))throw new AdminAccessError();return viewer;}
export async function GET(request:Request){try{const viewer=await actor();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});return Response.json(await operationHistory(viewer,new URL(request.url).searchParams),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){const rejected=rejectCrossSiteWrite(request);if(rejected)return rejected;try{const viewer=await actor();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});const raw=await request.text();if(raw.length>100_000)throw new Error("대상은 한 번에 최대 100명입니다.");const body=JSON.parse(raw);if(!["preview","commit"].includes(body.intent))throw new Error("변경 동작을 확인하세요.");return Response.json(body.intent==="preview"?await previewOperation(viewer,body.input):await commitOperation(viewer,body.input,body.token),{headers});}catch(e){return failure(e);}}
