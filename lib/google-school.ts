import { latestGuidance, decodeGuidance } from "@/lib/guidance";
import { approvedSchoolRole, canAccessSchoolStudent, canManageSchoolClass, isSchoolAdmin, isSchoolStaff } from "@/lib/school-permissions";
import { hydrateProfileDetails, profileEvidenceIssues } from "@/lib/profile-evidence";
import { guidanceFromState } from "@/lib/guidance-store";
import type { Viewer } from "@/lib/data";
import type { PortalData } from "@/lib/portal-types";
import { insertRow, type SchoolState } from "@/lib/school-tables";
import { readGoogleState, commitGoogleState } from "@/lib/google-bridge";
import { normalizeStudentRow, validateStudentRows } from "@/lib/student-registration";
import { profileImportSchema } from "@/lib/profile-import";
import { profileReferenceIssues } from "@/lib/work-result";
import { recordCoverage, profileCoverageIssues } from "@/lib/record-coverage";
import { libraryReferenceIssues, MAX_REFERENCE_SELECTION } from "@/lib/reference-materials";
import { analyzeActivityText } from "@/lib/fingerprint";

const parsedArray = (value: string) => { try { const data = JSON.parse(value); return Array.isArray(data) ? data : []; } catch { return []; } };
const strings = (value: string): string[] => parsedArray(value).filter((v): v is string => typeof v === "string");
function text(value: unknown, label: string, max = 2000, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > max) throw new Error(`${label}을(를) 확인하세요.`);
  return result;
}
function id(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new Error("대상 정보를 확인하세요."); return result; }
function requireStaff(viewer: Viewer, admin = false) { if (!(admin ? isSchoolAdmin(viewer) : isSchoolStaff(viewer))) throw new Error(admin ? "관리자 권한이 필요합니다." : "교사 또는 관리자 권한이 필요합니다."); }
export function currentGoogleViewer(state: SchoolState, viewer: Viewer): Viewer {
  const current = state.tables.users.find(row => row.id === viewer.id && row.authUserId === viewer.authUserId);
  if (!current) throw new Error("사용자 권한을 확인할 수 없습니다.");
  return current;
}
export function googleStudentAccess(state: SchoolState, viewer: Viewer, studentId: number) {
  viewer = currentGoogleViewer(state, viewer);
  const student = state.tables.students.find(row => row.id === studentId);
  const classroom = state.tables.classes.find(row => row.id === student?.classId);
  if (!student || !classroom || !canAccessSchoolStudent(viewer, student, classroom)) throw new Error("이 학생 자료에 접근할 수 없습니다.");
  return { student, classroom };
}
function classAccess(state: SchoolState, viewer: Viewer, classId: number) {
  requireStaff(viewer); const classroom = state.tables.classes.find(row => row.id === classId);
  if (!classroom || !canManageSchoolClass(viewer, classroom)) throw new Error("이 학급에 접근할 수 없습니다.");
  return classroom;
}
export async function ensureGoogleViewer(auth: { userId: string; email: string; displayName: string }): Promise<Viewer> {
  const state = await readGoogleState();
  const email = auth.email.trim().toLowerCase();
  let viewer = state.tables.users.find(row => row.authUserId === auth.userId);
  let changed = false;
  if (!viewer) {
    if (!state.tables.users.some(row => row.role === "admin" && row.status === "approved")) throw new Error("관리자 데이터 이전을 완료하세요.");
    if (state.tables.users.some(row => row.email.toLowerCase() === email)) throw new Error("이미 다른 로그인 계정에 연결된 이메일입니다.");
    const matches = state.tables.students.filter(row => row.email?.toLowerCase() === email && row.userId === null);
    const matchingStudent = matches.length === 1 ? matches[0] : undefined;
    viewer = insertRow(state, "users", { authUserId: auth.userId, email, displayName: auth.displayName, role: "student", status: matchingStudent ? "approved" : "pending" });
    if (matchingStudent) matchingStudent.userId = viewer.id;
    changed = true;
  } else if (viewer.email !== email || viewer.displayName !== auth.displayName) {
    const viewerId = viewer.id;
    if (state.tables.users.some(row => row.id !== viewerId && row.email.toLowerCase() === email)) throw new Error("이메일 연결을 확인하세요.");
    viewer.email = email; viewer.displayName = auth.displayName; changed = true;
  }
  if (changed) await commitGoogleState(state);
  return viewer;
}
export function googlePortalData(state: SchoolState, givenViewer: Viewer): PortalData {
  const viewer = currentGoogleViewer(state, givenViewer), t = state.tables;
  const approved = Boolean(approvedSchoolRole(viewer)), staff = isSchoolStaff(viewer);
  const classes = approved ? t.classes.filter(row => viewer.role === "admin" || (viewer.role === "teacher" ? row.teacherId === viewer.id : t.students.some(s => s.classId === row.id && s.userId === viewer.id))) : [];
  const classIds = new Set(classes.map(row => row.id));
  const students = t.students.filter(row => classIds.has(row.classId) && (staff || row.userId === viewer.id)).sort((a,b) => a.studentNumber.localeCompare(b.studentNumber));
  const studentIds = new Set(students.map(row => row.id));
  const snapshots = t.profileSnapshots.filter(row => studentIds.has(row.studentId)).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id-a.id);
  const snapshotIds = new Set(snapshots.filter(row => row.isActive).map(row => row.id));
  const activities = t.activities.filter(row => studentIds.has(row.studentId)).sort((a,b) => b.activityDate.localeCompare(a.activityDate) || b.id-a.id);
  const activityIds = new Set(activities.map(row => row.id));
  const threads = t.inquiryThreads.filter(row => studentIds.has(row.studentId)), threadIds = new Set(threads.map(row => row.id));
  // The legacy format stores numeric selection IDs; accept both representations.
  const selected = parsedArray(t.referenceSelections.find(row => row.userId === viewer.id)?.materialIdsJson ?? "[]").map(Number);
  const data = hydrateProfileDetails({
    guidance: [], referenceChecks: [], appliedCriteria: [],
    viewer, classes, students, subjects: t.subjects.filter(row => classIds.has(row.classId)).sort((a,b)=>a.sortOrder-b.sortOrder), activities, threads,
    fingerprints: t.fingerprints.filter(row => activityIds.has(row.activityId)).map(row => ({ ...row, keywords: strings(row.keywordsJson), methods: strings(row.methodsJson), evidence: strings(row.evidenceJson), competencies: strings(row.competenciesJson), questions: strings(row.questionsJson), subjectLinks: strings(row.subjectLinksJson) })),
    threadActivities: t.threadActivities.filter(row => threadIds.has(row.threadId)).sort((a,b)=>a.sequence-b.sequence),
    files: t.activityFiles.filter(row => activityIds.has(row.activityId)).map(({ id, activityId, originalName, contentType, sizeBytes }) => ({ id, activityId, originalName, contentType, sizeBytes })),
    records: t.studentRecords.filter(row => studentIds.has(row.studentId)).sort((a,b)=>b.id-a.id).map(({ objectKey: _key, ownerUserId: _owner, coverageJson, ...row }) => ({ ...row, coverage: recordCoverage({ ...row, coverageJson }) })),
    referenceMaterials: staff ? t.referenceMaterials.map(({objectKey: _key, uploadedBy: _owner, ...row})=>row) : [],
    selectedReferenceMaterialIds: staff ? selected.filter(value=>t.referenceMaterials.some(row=>row.id===value && row.status==="active")) : [],
    profileSnapshots: snapshots.map(({ rawJson: _raw, createdBy: _creator, ...row }) => ({ ...row, strengths: strings(row.strengthsJson), cautions: strings(row.cautionsJson), sourceYears: parsedArray(row.sourceYearsJson).map(Number) })),
    profileSections: t.profileSections.filter(row=>snapshotIds.has(row.snapshotId)).sort((a,b)=>a.sortOrder-b.sortOrder).map(row=>({...row,evidence:strings(row.evidenceText), keywords:strings(row.keywordsJson), competencies:strings(row.competenciesJson)})),
    researchKeywords: t.researchKeywords.filter(row=>snapshotIds.has(row.snapshotId)).sort((a,b)=>b.weight-a.weight).map(row=>({...row,evidenceRefs:strings(row.evidenceRefsJson)})),
    ontologyNodes: t.ontologyNodes.filter(row=>snapshotIds.has(row.snapshotId)).map(row=>({...row,evidenceRefs:strings(row.evidenceRefsJson)})),
    ontologyEdges: t.ontologyEdges.filter(row=>snapshotIds.has(row.snapshotId)),
    wikiPages: t.wikiPages.filter(row=>snapshotIds.has(row.snapshotId)).sort((a,b)=>a.sortOrder-b.sortOrder).map(row=>({...row,keywords:strings(row.keywordsJson),linkedNodeKeys:strings(row.linkedNodeKeysJson)})),
    academicCourses: t.academicCourseRecords.filter(row=>snapshotIds.has(row.snapshotId)).sort((a,b)=>a.sortOrder-b.sortOrder),
    academicTrends: t.academicTrends.filter(row=>snapshotIds.has(row.snapshotId)).map(row=>({...row,points:parsedArray(row.pointsJson),evidenceRefs:strings(row.evidenceRefsJson)})),
    creditSummaries: t.creditSummaries.filter(row=>snapshotIds.has(row.snapshotId)).map(row=>({...row,evidenceRefs:strings(row.evidenceRefsJson)})),
    evaluationReferences: t.evaluationReferences.filter(row=>snapshotIds.has(row.snapshotId)),
    competencyEvaluations: t.competencyEvaluations.filter(row=>snapshotIds.has(row.snapshotId)).sort((a,b)=>a.sortOrder-b.sortOrder).map(row=>({...row,evidenceRefs:strings(row.evidenceRefsJson),strengths:strings(row.strengthsJson),gaps:strings(row.gapsJson),nextActions:strings(row.nextActionsJson)})),
    pendingUsers: staff ? t.users.filter(row=>row.status==="pending" && (viewer.role==="admin" || students.some(s=>s.email?.toLowerCase()===row.email.toLowerCase()))).map(({id,email,displayName,createdAt})=>({id,email,displayName,createdAt})) : [],
    staffUsers: approved && viewer.role==="admin" ? t.users.filter(row=>row.status==="approved" && row.role!=="student").map(({id,email,displayName,role})=>({id,email,displayName,role:role as "admin"|"teacher"})) : [],
  } as PortalData, snapshots.filter(row=>row.isActive));
  return {...data, ...guidanceFromState(state,viewer,data)};
}
export async function googleAction(givenViewer: Viewer, body: Record<string, unknown>) {
  const state = await readGoogleState();
  const result = applyGoogleAction(state, currentGoogleViewer(state, givenViewer), body);
  await commitGoogleState(state);
  return result;
}
export function applyGoogleAction(state: SchoolState, viewer: Viewer, body: Record<string, unknown>): Record<string, unknown> {
  viewer = currentGoogleViewer(state, viewer);
  requireStaff(viewer);
  const t = state.tables, action = text(body.action,"작업",80);
  if (action === "addClass") {
    const grade = Number(body.grade), schoolYear = Number(body.schoolYear), teacherId = viewer.role === "admin" ? id(body.teacherId) : viewer.id;
    if (![2,3].includes(grade) || !Number.isInteger(schoolYear) || schoolYear < 2022 || schoolYear > 2100) throw new Error("2·3학년과 학년도를 확인하세요.");
    if (!t.users.some(row=>row.id===teacherId && row.status==="approved" && row.role!=="student")) throw new Error("승인된 교사를 선택하세요.");
    const classroom = insertRow(state,"classes",{teacherId,grade,schoolYear,name:text(body.name,"학급명",100),inviteCode:`TRACE-${crypto.randomUUID().slice(0,6).toUpperCase()}`});
    ["통합과학","과학탐구실험","생명과학"].forEach((name,i)=>insertRow(state,"subjects",{classId:classroom.id,name,sortOrder:i+1}));
    return {ok:true,classroom};
  }
  if (action === "bulkAddStudents" || action === "addStudent") {
    const classId = id(body.classId); classAccess(state,viewer,classId);
    const input = action === "addStudent" ? [body] : body.students;
    if (!Array.isArray(input) || input.length < 1 || input.length > 300) throw new Error("한 번에 1~300명을 등록하세요.");
    const rows = input.map((value,i)=>normalizeStudentRow({rowNumber:i+2,studentNumber:typeof value?.studentNumber==="string"?value.studentNumber:"",name:typeof value?.name==="string"?value.name:"",email:typeof value?.email==="string"?value.email:""}));
    const issues = validateStudentRows(rows,t.students,classId).map(row=>`${row.rowNumber}행: ${row.message}`);
    for (const row of rows) {
      const account = t.users.find(user=>user.email.toLowerCase()===row.email);
      if (account && (account.role!=="student" || account.status==="suspended" || t.students.some(student=>student.userId===account.id))) issues.push(`${row.rowNumber}행: 다른 학생 또는 교직원에게 연결된 이메일입니다.`);
    }
    if (issues.length) throw new Error(issues.slice(0,8).join(" / "));
    let linkedCount = 0;
    const created = rows.map(row=> {
      const account = row.email ? t.users.find(user=>user.email.toLowerCase()===row.email) : undefined;
      const student = insertRow(state,"students",{classId,studentNumber:row.studentNumber,name:row.name,email:row.email||null,userId:account?.id??null});
      if (account) { account.status="approved"; linkedCount++; } return student;
    });
    return {ok:true,createdCount:created.length,linkedCount,student:action==="addStudent"?created[0]:undefined};
  }
  if (action === "assignClassTeacher") {
    requireStaff(viewer,true); const classroom=classAccess(state,viewer,id(body.classId)), teacherId=id(body.teacherId);
    if (!t.users.some(row=>row.id===teacherId && row.status==="approved" && row.role!=="student")) throw new Error("승인된 교사를 선택하세요.");
    classroom.teacherId=teacherId; return {ok:true,classroom};
  }
  if (action === "updateStudentStatus" || action === "archiveStudent") {
    const {student}=googleStudentAccess(state,viewer,id(body.studentId));
    const status=action==="archiveStudent"?"archived":body.status;
    if (status!=="active" && status!=="graduated" && status!=="archived") throw new Error("학생 상태를 확인하세요.");
    const year=Number(body.graduatedYear);
    if (status==="graduated" && (!Number.isInteger(year)||year<2022||year>2100)) throw new Error("졸업 연도를 확인하세요.");
    student.status=status; if(status!=="archived") {student.graduatedYear=status==="graduated"?year:null;student.graduatedAt=status==="graduated"?new Date().toISOString():null;} return {ok:true};
  }
  if (action === "approveTeacher" || action === "approveUser") {
    const account=t.users.find(row=>row.id===id(body.userId));
    if (!account || account.status!=="pending" || account.role!=="student") throw new Error("승인 대기 계정을 선택하세요.");
    if(action==="approveTeacher") {requireStaff(viewer,true);account.role="teacher";}
    else { const {student}=googleStudentAccess(state,viewer,id(body.studentId)); if(student.email?.toLowerCase()!==account.email.toLowerCase() || (student.userId!==null&&student.userId!==account.id) || t.students.some(row=>row.id!==student.id&&row.userId===account.id)) throw new Error("학생·계정 이메일 또는 기존 연결을 확인하세요."); student.userId=account.id; }
    account.status="approved"; return {ok:true};
  }
  if (action === "setReferenceSelection") {
    const values=body.materialIds;
    if(!Array.isArray(values)||values.length>MAX_REFERENCE_SELECTION||values.some(value=>!Number.isSafeInteger(value)||!t.referenceMaterials.some(row=>row.id===value&&row.status==="active"))||new Set(values).size!==values.length) throw new Error("사용할 공용 평가 자료를 확인하세요.");
    const row=t.referenceSelections.find(row=>row.userId===viewer.id); const materialIdsJson=JSON.stringify(values);
    if(row) row.materialIdsJson=materialIdsJson; else insertRow(state,"referenceSelections",{userId:viewer.id,materialIdsJson}); return {ok:true};
  }
  if (action === "setReferenceStatus") {
    requireStaff(viewer,true); const row=t.referenceMaterials.find(row=>row.id===id(body.materialId));
    if(!row || (body.status!=="active"&&body.status!=="archived")) throw new Error("자료 상태를 확인하세요.");
    row.status=body.status; return {ok:true};
  }
  if (action === "activateProfileVersion") {
    const snapshot=t.profileSnapshots.find(row=>row.id===id(body.snapshotId)); if(!snapshot) throw new Error("프로필 버전을 찾을 수 없습니다."); googleStudentAccess(state,viewer,snapshot.studentId);
    t.profileSnapshots.filter(row=>row.studentId===snapshot.studentId).forEach(row=>row.isActive=row.id===snapshot.id); return {ok:true};
  }
  if (action === "importProfile") return importGoogleProfile(state,viewer,body);
  if (action === "addSubject") {
    const classId=id(body.classId); classAccess(state,viewer,classId); const name=text(body.name,"교과명",80);
    if(t.subjects.some(row=>row.classId===classId&&row.name===name)) throw new Error("이미 등록된 교과입니다.");
    return {ok:true,subject:insertRow(state,"subjects",{classId,name,color:text(body.color,"색상",20,false)||"#2457d6",sortOrder:Math.max(0,...t.subjects.filter(row=>row.classId===classId).map(row=>row.sortOrder))+1})};
  }
  if (action === "addActivity") {
    const studentId=id(body.studentId), subjectId=id(body.subjectId), {student}=googleStudentAccess(state,viewer,studentId);
    if(!t.subjects.some(row=>row.id===subjectId&&row.classId===student.classId)) throw new Error("학생 학급의 교과를 선택하세요.");
    return {ok:true,activity:insertRow(state,"activities",{studentId,subjectId,createdBy:viewer.id,title:text(body.title,"활동 제목",180),activityType:text(body.activityType,"활동 유형",60),activityDate:text(body.activityDate,"활동 날짜",10),rawText:text(body.rawText,"활동 원문",20000),sourceNote:text(body.sourceNote,"출처",600,false)})};
  }
  if (action === "addThread") {const studentId=id(body.studentId); googleStudentAccess(state,viewer,studentId);return {ok:true,thread:insertRow(state,"inquiryThreads",{studentId,title:text(body.title,"탐구 흐름 제목",160),focusQuestion:text(body.focusQuestion,"중심 질문",500)})};}
  if (action === "linkActivity") {
    const thread=t.inquiryThreads.find(row=>row.id===id(body.threadId)), activity=t.activities.find(row=>row.id===id(body.activityId));
    if(!thread||!activity||thread.studentId!==activity.studentId) throw new Error("같은 학생의 활동만 연결할 수 있습니다."); googleStudentAccess(state,viewer,thread.studentId);
    if(!t.threadActivities.some(row=>row.threadId===thread.id&&row.activityId===activity.id)) insertRow(state,"threadActivities",{threadId:thread.id,activityId:activity.id,sequence:Math.max(0,...t.threadActivities.filter(row=>row.threadId===thread.id).map(row=>row.sequence))+1}); return {ok:true};
  }
  if (action === "analyzeActivity") {
    const activity=t.activities.find(row=>row.id===id(body.activityId)); if(!activity) throw new Error("활동을 찾을 수 없습니다."); googleStudentAccess(state,viewer,activity.studentId);
    const analysis=analyzeActivityText(activity.title,activity.rawText);
    const values={studentId:activity.studentId,summary:analysis.summary,keywordsJson:JSON.stringify(analysis.keywords),methodsJson:JSON.stringify(analysis.methods),evidenceJson:JSON.stringify(analysis.evidence),competenciesJson:JSON.stringify(analysis.competencies),questionsJson:JSON.stringify(analysis.questions),subjectLinksJson:JSON.stringify(analysis.subjectLinks),status:"draft" as const,approvedBy:null,approvedAt:null,updatedAt:new Date().toISOString()};
    let row=t.fingerprints.find(row=>row.activityId===activity.id); if(row) Object.assign(row,values);else row=insertRow(state,"fingerprints",{activityId:activity.id,...values}); activity.status="analyzed";return {ok:true,fingerprint:row};
  }
  if (["updateFingerprint","approveFingerprint","returnFingerprint"].includes(action)) {
    const row=t.fingerprints.find(row=>row.id===id(body.fingerprintId)); if(!row) throw new Error("연구지문을 찾을 수 없습니다.");googleStudentAccess(state,viewer,row.studentId);
    if(action==="updateFingerprint") {
      row.summary=text(body.summary,"요약",1000);
      const arrays={keywords:"keywordsJson",methods:"methodsJson",evidence:"evidenceJson",competencies:"competenciesJson",questions:"questionsJson",subjectLinks:"subjectLinksJson"} as const;
      for(const [key,column] of Object.entries(arrays)) row[column]=JSON.stringify(Array.isArray(body[key])?(body[key] as unknown[]).filter((v):v is string=>typeof v==="string"&&Boolean(v.trim())).map(v=>v.trim()).slice(0,20):[]);
    } else {const approved=action==="approveFingerprint";row.status=approved?"approved":"returned";row.approvedBy=approved?viewer.id:null;row.approvedAt=approved?new Date().toISOString():null; const activity=t.activities.find(a=>a.id===row.activityId);if(activity) activity.status=approved?"approved":"returned";}
    row.updatedAt=new Date().toISOString();return {ok:true};
  }
  throw new Error("지원하지 않는 작업입니다.");
}

function importGoogleProfile(state: SchoolState, viewer: Viewer, body: Record<string, unknown>) {
  const studentId=id(body.studentId), {student,classroom}=googleStudentAccess(state,viewer,studentId), t=state.tables;
  let candidate=body.profile; if(typeof candidate==="string") {try{candidate=JSON.parse(candidate);}catch{throw new Error("Work 결과 JSON 형식을 확인하세요.");}}
  const parsed=profileImportSchema.safeParse(candidate); if(!parsed.success) throw new Error("Work 결과 형식이 올바르지 않습니다. 미리보기에서 검증하세요."); const p=parsed.data;
  if(p.studentReference&&(p.studentReference.name!==student.name||p.studentReference.studentNumber!==student.studentNumber)) throw new Error("Work 결과의 학번·이름이 선택한 학생과 다릅니다.");
  if(t.profileSnapshots.some(row=>row.studentId===studentId&&row.versionLabel===p.versionLabel)) throw new Error("이미 저장된 버전명입니다.");
  const records=t.studentRecords.filter(row=>row.studentId===studentId);
  const issues=[...profileCoverageIssues(p,classroom.grade,records,student.isExample),...profileReferenceIssues(p),...profileEvidenceIssues(p,records.map(r=>({...r,coverage:recordCoverage(r)})),studentId),...libraryReferenceIssues(p,t.referenceMaterials,latestGuidance(t.guidanceEntries).map(decodeGuidance))]; if(issues.length) throw new Error(issues[0]);
  t.profileSnapshots.filter(row=>row.studentId===studentId).forEach(row=>row.isActive=false);
  const snapshot=insertRow(state,"profileSnapshots",{studentId,createdBy:viewer.id,versionLabel:p.versionLabel,schemaVersion:p.schemaVersion,oneLineProfile:p.overview.oneLineProfile,narrative:p.overview.narrative,strengthsJson:JSON.stringify(p.overview.strengths),cautionsJson:JSON.stringify(p.overview.cautions),coursePattern:p.overview.coursePattern,sourceYearsJson:JSON.stringify(p.sourceYears.map(String)),rawJson:JSON.stringify(p),isActive:true});
  const base={snapshotId:snapshot.id,studentId}, json=JSON.stringify;
  p.sections.forEach((x,i)=>insertRow(state,"profileSections",{...base,sectionType:x.type,schoolYear:x.schoolYear,subject:x.subject,title:x.title,summary:x.summary,evidenceText:json(x.evidence),keywordsJson:json(x.keywords),competenciesJson:json(x.competencies),sortOrder:i}));
  p.researchFingerprint.forEach(x=>insertRow(state,"researchKeywords",{...base,keyword:x.keyword,category:x.category,description:x.description,weight:x.weight,evidenceRefsJson:json(x.evidenceRefs)}));
  p.ontology.nodes.forEach(x=>insertRow(state,"ontologyNodes",{...base,nodeKey:x.id,nodeType:x.type,label:x.label,description:x.description,weight:x.weight,evidenceRefsJson:json(x.evidenceRefs)}));
  p.ontology.edges.forEach(x=>insertRow(state,"ontologyEdges",{...base,sourceKey:x.source,targetKey:x.target,relation:x.relation,description:x.description,weight:x.weight}));
  p.wikiPages.forEach((x,i)=>insertRow(state,"wikiPages",{...base,slug:x.slug,pageType:x.type,title:x.title,summary:x.summary,bodyMarkdown:x.bodyMarkdown,keywordsJson:json(x.keywords),linkedNodeKeysJson:json(x.linkedNodeIds),sortOrder:i}));
  p.academicAnalysis.courses.forEach((x,i)=>{const {evidence,...rest}=x;insertRow(state,"academicCourseRecords",{...base,...rest,credits:x.credits??0,evidenceText:evidence,sortOrder:i});});
  p.academicAnalysis.trends.forEach(x=>{const {points,evidenceRefs,...rest}=x;insertRow(state,"academicTrends",{...base,...rest,pointsJson:json(points),evidenceRefsJson:json(evidenceRefs)});});
  p.academicAnalysis.creditSummary.forEach(x=>{const {evidenceRefs,...rest}=x;insertRow(state,"creditSummaries",{...base,...rest,completedCredits:x.completedCredits??0,selectedCredits:x.selectedCredits??0,plannedCredits:x.plannedCredits??0,evidenceRefsJson:json(evidenceRefs)});});
  p.evaluationAnalysis.references.forEach(x=>{const {id,...rest}=x;insertRow(state,"evaluationReferences",{...base,...rest,sourceKey:id});});
  p.evaluationAnalysis.competencies.forEach((x,i)=>{const {sourceId,evidenceRefs,strengths,gaps,nextActions,...rest}=x;insertRow(state,"competencyEvaluations",{...base,...rest,score:x.score??0,sourceKey:sourceId,evidenceRefsJson:json(evidenceRefs),strengthsJson:json(strengths),gapsJson:json(gaps),nextActionsJson:json(nextActions),sortOrder:i});});
  records.filter(row=>recordCoverage(row).every(x=>p.sourceYears.includes(x.schoolYear))).forEach(row=>row.processingStatus="reflected");
  return {ok:true,snapshot};
}
