import { hydrateProfileDetails, profileEvidenceIssues } from "@/lib/profile-evidence";
import { approvedSchoolRole, canAccessSchoolStudent, canManageSchoolClass, isSchoolStaff } from "@/lib/school-permissions";
import { guidanceForPortal } from "@/lib/guidance-store";
import type { PortalData } from "@/lib/portal-types";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  academicCourseRecords,
  academicTrends,
  activities,
  activityFiles,
  classes,
  competencyEvaluations,
  creditSummaries,
  evaluationReferences,
  fingerprints,
  inquiryThreads,
  ontologyEdges,
  ontologyNodes,
  profileSections,
  profileSnapshots,
  researchKeywords,
  studentRecords,
  students,
  subjects,
  threadActivities,
  users,
  wikiPages,
} from "@/db/schema";
import { analyzeActivityText } from "@/lib/fingerprint";
import { profileImportSchema } from "@/lib/profile-import";
import { getRequestUser } from "@/lib/server-auth";
import { normalizeStudentRow, validateStudentRows, type BulkStudentRow } from "@/lib/student-registration";
import { buildStudentRegistrationBatch } from "@/lib/student-bulk-statements";
import { profileReferenceIssues } from "@/lib/work-result";
import { profileCoverageIssues, recordCoverage } from "@/lib/record-coverage";
import { getReferenceGuidance, getReferenceLibrary, saveReferenceSelection, setReferenceStatus } from "@/lib/reference-library";
import { libraryReferenceIssues } from "@/lib/reference-materials";
import { googleEnabled, getStorageConnection, assertStorageWritable, readGoogleState } from "@/lib/google-bridge";
import { ensureGoogleViewer, googlePortalData, googleAction, googleStudentAccess, currentGoogleViewer } from "@/lib/google-school";

export type Viewer = typeof users.$inferSelect;

function jsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function chunks<T>(items: T[], size = 25) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function requiredText(value: unknown, label: string, max = 20_000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}을(를) 입력하세요.`);
  if (text.length > max) throw new Error(`${label}이(가) 너무 깁니다.`);
  return text;
}

function optionalText(value: unknown, max = 2_000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error("입력 내용이 너무 깁니다.");
  return text;
}

function numericId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${label}이(가) 올바르지 않습니다.`);
  return id;
}

export async function ensureViewer(): Promise<Viewer | null> {
  const auth = await getRequestUser();
  if (!auth) return null;

  const connection = await getStorageConnection();
  if (connection?.state === "google") return ensureGoogleViewer(auth);
  if (connection?.state === "migrating") {
    const [viewer] = await getDb().select().from(users).where(eq(users.authUserId, auth.userId)).limit(1);
    if (!viewer) throw new Error("저장소 이전 중입니다. 완료 후 로그인하세요.");
    return viewer;
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, auth.userId))
    .limit(1);

  if (existing) {
    let current = existing;
    if (existing.status === "approved" && existing.role === "teacher") {
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);
      if (!admin) {
        const [promoted] = await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, existing.id))
          .returning();
        if (promoted) current = promoted;
      }
    }
    if (current.role === "admin" || current.role === "teacher") {
      await db
        .update(classes)
        .set({ grade: 2, name: "2학년 학생부 프로파일" })
        .where(and(eq(classes.teacherId, current.id), eq(classes.grade, 1)));
    }
    if (current.email !== auth.email || current.displayName !== auth.displayName) {
      const [updated] = await db
        .update(users)
        .set({ email: auth.email, displayName: auth.displayName })
        .where(eq(users.id, current.id))
        .returning();
      if ((updated.role === "teacher" || updated.role === "admin") && updated.status === "approved") {
        const [workspace] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.teacherId, updated.id))
          .limit(1);
        if (!workspace) await seedTeacherWorkspace(updated.id);
      }
      return updated;
    }
    if ((current.role === "teacher" || current.role === "admin") && current.status === "approved") {
      const [workspace] = await db
        .select({ id: classes.id })
        .from(classes)
          .where(eq(classes.teacherId, current.id))
          .limit(1);
      if (!workspace) await seedTeacherWorkspace(current.id);
    }
    return current;
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [matchingStudent] = await db
    .select()
    .from(students)
    .where(eq(students.email, auth.email))
    .limit(1);
  const firstUser = Number(count) === 0;
  const [created] = await db
    .insert(users)
    .values({
      authUserId: auth.userId,
      email: auth.email,
      displayName: auth.displayName,
      role: firstUser ? "admin" : "student",
      status: firstUser || matchingStudent ? "approved" : "pending",
    })
    .returning();

  if (matchingStudent) {
    await db
      .update(students)
      .set({ userId: created.id })
      .where(eq(students.id, matchingStudent.id));
  }

  if (firstUser) await seedTeacherWorkspace(created.id);
  return created;
}

async function seedTeacherWorkspace(teacherId: number) {
  const db = getDb();
  const inviteCode = `TRACE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const [classroom] = await db
    .insert(classes)
    .values({ teacherId, name: "2학년 학생부 프로파일", grade: 2, schoolYear: 2026, inviteCode })
    .returning();

  const subjectRows = await db
    .insert(subjects)
    .values([
      { classId: classroom.id, name: "통합과학", color: "#2457d6", sortOrder: 1 },
      { classId: classroom.id, name: "과학탐구실험", color: "#0d8b72", sortOrder: 2 },
      { classId: classroom.id, name: "생명과학", color: "#8a4fd3", sortOrder: 3 },
      { classId: classroom.id, name: "독서·진로", color: "#db7a2b", sortOrder: 4 },
    ])
    .returning();

  const studentRows = await db
    .insert(students)
    .values([
      { classId: classroom.id, studentNumber: "20101", name: "예시 학생 A", isExample: true },
      { classId: classroom.id, studentNumber: "20102", name: "예시 학생 B", isExample: true },
      { classId: classroom.id, studentNumber: "20103", name: "예시 학생 C", isExample: true },
    ])
    .returning();

  const activitySeed = [
    {
      studentId: studentRows[0].id,
      subjectId: subjectRows[0].id,
      title: "항생제 내성과 자연선택의 관계",
      activityType: "탐구 보고서",
      activityDate: "2026-09-04",
      rawText:
        "항생제 사용 전후 세균 집단의 내성 비율을 나타낸 그래프를 비교하였다. 항생제가 내성 형질을 만들어 내는 것이 아니라, 이미 존재하던 변이 중 생존과 번식에 유리한 형질이 선택된다는 점을 설명했다. 다만 그래프만으로 돌연변이의 발생 시점을 단정하기 어렵다는 한계를 기록하고 후속 실험 조건을 제안하였다.",
      sourceNote: "통합과학 수업 활동지와 개인 추가 조사",
    },
    {
      studentId: studentRows[0].id,
      subjectId: subjectRows[1].id,
      title: "효소 반응 속도와 온도 조건 비교",
      activityType: "실험",
      activityDate: "2026-09-09",
      rawText:
        "카탈레이스 반응에서 온도를 독립 변인으로 두고 발생한 기체의 부피를 반복 측정하였다. 평균값을 표와 그래프로 나타내고 고온에서 반응 속도가 감소한 원인을 효소의 입체 구조 변화로 해석하였다. 측정 시간과 시료 크기를 더 엄격하게 통제해야 한다는 오차 요인을 제시하였다.",
      sourceNote: "모둠 실험 후 개인 해석",
    },
    {
      studentId: studentRows[1].id,
      subjectId: subjectRows[2].id,
      title: "유전자 검사 결과를 어디까지 예측으로 볼 수 있는가",
      activityType: "독서 논술",
      activityDate: "2026-09-10",
      rawText:
        "유전적 소인과 실제 질병 발현을 동일하게 보는 주장을 비판적으로 검토하였다. 논문과 공공기관 통계를 근거로 생활 환경과 확률의 영향을 비교하고, 개인의 검사 결과를 교육이나 보험에서 사용하는 경우 발생할 수 있는 윤리 문제를 토론하였다.",
      sourceNote: "가타카 감상 후 생명공학 독서 활동",
    },
    {
      studentId: studentRows[2].id,
      subjectId: subjectRows[3].id,
      title: "도시 열섬 자료의 시각화 방식에 따른 해석 차이",
      activityType: "자료 분석",
      activityDate: "2026-09-12",
      rawText:
        "지역별 기온 공공 데이터를 수집해 지도와 선 그래프로 시각화하였다. 같은 수치라도 색 구간과 기준값에 따라 차이가 과장되거나 축소될 수 있음을 비교하였다. 자료의 출처와 결측치를 확인하고 인구 밀도 자료와 연결한 후속 분석 질문을 만들었다.",
      sourceNote: "진로 연계 데이터 프로젝트",
    },
  ];

  for (const [index, seed] of activitySeed.entries()) {
    const [activity] = await db
      .insert(activities)
      .values({ ...seed, createdBy: teacherId, status: "analyzed" })
      .returning();
    const analysis = analyzeActivityText(activity.title, activity.rawText);
    await db.insert(fingerprints).values({
      activityId: activity.id,
      studentId: activity.studentId,
      summary: analysis.summary,
      keywordsJson: JSON.stringify(analysis.keywords),
      methodsJson: JSON.stringify(analysis.methods),
      evidenceJson: JSON.stringify(analysis.evidence),
      competenciesJson: JSON.stringify(analysis.competencies),
      questionsJson: JSON.stringify(analysis.questions),
      subjectLinksJson: JSON.stringify(analysis.subjectLinks),
      status: index === 0 ? "approved" : "draft",
      approvedBy: index === 0 ? teacherId : null,
      approvedAt: index === 0 ? new Date().toISOString() : null,
    });
  }

  const [thread] = await db
    .insert(inquiryThreads)
    .values({
      studentId: studentRows[0].id,
      title: "변이에서 적응까지",
      focusQuestion: "환경 조건은 집단의 형질 비율을 어떻게 변화시키는가?",
      status: "active",
    })
    .returning();
  const seededActivities = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.studentId, studentRows[0].id))
    .orderBy(asc(activities.activityDate));
  if (seededActivities.length) {
    await db.insert(threadActivities).values(
      seededActivities.map((activity, index) => ({
        threadId: thread.id,
        activityId: activity.id,
        sequence: index + 1,
      })),
    );
  }
}

export async function getPortalData(viewer: Viewer) {
  if (await googleEnabled()) return googlePortalData(await readGoogleState(), viewer);
  const db = getDb();
  if (!approvedSchoolRole(viewer)) {
    return {
      guidance: [], referenceChecks: [], appliedCriteria: [], viewer, classes: [], students: [], subjects: [], activities: [], fingerprints: [],
      threads: [], threadActivities: [], files: [], records: [], profileSnapshots: [],
      profileSections: [], researchKeywords: [], ontologyNodes: [], ontologyEdges: [],
      wikiPages: [], academicCourses: [], academicTrends: [], creditSummaries: [],
      evaluationReferences: [], competencyEvaluations: [], pendingUsers: [], staffUsers: [], referenceMaterials: [], selectedReferenceMaterialIds: [],
    };
  }


  // Use permission-scoped subqueries instead of binding one parameter per
  // student/profile. A school-wide view must keep working after a 300-row import.
  const studentScope = viewer.role === "admin" ? undefined
    : viewer.role === "teacher"
      ? inArray(students.classId, db.select({ id: classes.id }).from(classes).where(eq(classes.teacherId, viewer.id)))
      : eq(students.userId, viewer.id);
  const scopedStudentIds = db.select({ id: students.id }).from(students).where(studentScope);
  const scopedClassIds = db.select({ id: classes.id }).from(classes).where(
    viewer.role === "admin" ? undefined : viewer.role === "teacher" ? eq(classes.teacherId, viewer.id)
      : inArray(classes.id, db.select({ id: students.classId }).from(students).where(studentScope)),
  );
  const scopedActivityIds = db.select({ id: activities.id }).from(activities).where(inArray(activities.studentId, scopedStudentIds));
  const scopedThreadIds = db.select({ id: inquiryThreads.id }).from(inquiryThreads).where(inArray(inquiryThreads.studentId, scopedStudentIds));
  const scopedSnapshotIds = db.select({ id: profileSnapshots.id }).from(profileSnapshots)
    .where(and(eq(profileSnapshots.isActive, true), inArray(profileSnapshots.studentId, scopedStudentIds)));

  let classRows: (typeof classes.$inferSelect)[] = [];
  let studentRows: (typeof students.$inferSelect)[] = [];

  if (viewer.role === "admin") {
    classRows = await db.select().from(classes).orderBy(desc(classes.schoolYear), asc(classes.name));
    const classIds = classRows.map((row) => row.id);
    studentRows = classIds.length
      ? await db.select().from(students).where(inArray(students.classId, scopedClassIds)).orderBy(asc(students.studentNumber))
      : [];
  } else if (viewer.role === "teacher") {
    classRows = await db.select().from(classes).where(eq(classes.teacherId, viewer.id)).orderBy(desc(classes.schoolYear), asc(classes.name));
    const classIds = classRows.map((row) => row.id);
    studentRows = classIds.length
      ? await db.select().from(students).where(inArray(students.classId, scopedClassIds)).orderBy(asc(students.studentNumber))
      : [];
  } else {
    studentRows = await db.select().from(students).where(eq(students.userId, viewer.id)).limit(1);
    const classIds = studentRows.map((row) => row.classId);
    classRows = classIds.length ? await db.select().from(classes).where(inArray(classes.id, scopedClassIds)) : [];
  }

  const classIds = classRows.map((row) => row.id);
  const studentIds = studentRows.map((row) => row.id);
  const subjectRows = classIds.length
    ? await db.select().from(subjects).where(inArray(subjects.classId, scopedClassIds)).orderBy(asc(subjects.sortOrder))
    : [];
  const activityRows = studentIds.length
    ? await db.select().from(activities).where(inArray(activities.studentId, scopedStudentIds)).orderBy(desc(activities.activityDate), desc(activities.id))
    : [];
  const activityIds = activityRows.map((row) => row.id);
  const fingerprintRows = activityIds.length
    ? await db.select().from(fingerprints).where(inArray(fingerprints.activityId, scopedActivityIds)).orderBy(desc(fingerprints.createdAt))
    : [];
  const threadRows = studentIds.length
    ? await db.select().from(inquiryThreads).where(inArray(inquiryThreads.studentId, scopedStudentIds)).orderBy(desc(inquiryThreads.createdAt))
    : [];
  const threadIds = threadRows.map((row) => row.id);
  const linkedRows = threadIds.length
    ? await db.select().from(threadActivities).where(inArray(threadActivities.threadId, scopedThreadIds)).orderBy(asc(threadActivities.sequence))
    : [];
  const fileRows = activityIds.length
    ? await db.select({ id: activityFiles.id, activityId: activityFiles.activityId, originalName: activityFiles.originalName, contentType: activityFiles.contentType, sizeBytes: activityFiles.sizeBytes }).from(activityFiles).where(inArray(activityFiles.activityId, scopedActivityIds))
    : [];
  const recordRows = studentIds.length
    ? await db.select({
        id: studentRecords.id, studentId: studentRecords.studentId,
        schoolYear: studentRecords.schoolYear, recordGrade: studentRecords.recordGrade, coverageJson: studentRecords.coverageJson,
        originalName: studentRecords.originalName, contentType: studentRecords.contentType,
        sizeBytes: studentRecords.sizeBytes, processingStatus: studentRecords.processingStatus,
        createdAt: studentRecords.createdAt,
      }).from(studentRecords).where(inArray(studentRecords.studentId, scopedStudentIds)).orderBy(desc(studentRecords.createdAt))
    : [];
  const snapshotRows = studentIds.length
    ? await db.select({
        id: profileSnapshots.id, studentId: profileSnapshots.studentId,
        versionLabel: profileSnapshots.versionLabel, schemaVersion: profileSnapshots.schemaVersion,
        oneLineProfile: profileSnapshots.oneLineProfile, narrative: profileSnapshots.narrative,
        strengthsJson: profileSnapshots.strengthsJson, cautionsJson: profileSnapshots.cautionsJson,
        coursePattern: profileSnapshots.coursePattern, sourceYearsJson: profileSnapshots.sourceYearsJson,
        isActive: profileSnapshots.isActive, createdAt: profileSnapshots.createdAt,
      }).from(profileSnapshots).where(inArray(profileSnapshots.studentId, scopedStudentIds)).orderBy(desc(profileSnapshots.createdAt))
    : [];
  const activeSnapshotIds = snapshotRows.filter((row) => row.isActive).map((row) => row.id);
  const sectionRows = activeSnapshotIds.length
    ? await db.select().from(profileSections).where(inArray(profileSections.snapshotId, scopedSnapshotIds)).orderBy(asc(profileSections.sortOrder))
    : [];
  const keywordRows = activeSnapshotIds.length
    ? await db.select().from(researchKeywords).where(inArray(researchKeywords.snapshotId, scopedSnapshotIds)).orderBy(desc(researchKeywords.weight))
    : [];
  const nodeRows = activeSnapshotIds.length
    ? await db.select().from(ontologyNodes).where(inArray(ontologyNodes.snapshotId, scopedSnapshotIds)).orderBy(desc(ontologyNodes.weight))
    : [];
  const edgeRows = activeSnapshotIds.length
    ? await db.select().from(ontologyEdges).where(inArray(ontologyEdges.snapshotId, scopedSnapshotIds)).orderBy(desc(ontologyEdges.weight))
    : [];
  const wikiRows = activeSnapshotIds.length
    ? await db.select().from(wikiPages).where(inArray(wikiPages.snapshotId, scopedSnapshotIds)).orderBy(asc(wikiPages.sortOrder))
    : [];
  const academicRows = activeSnapshotIds.length
    ? await db.select().from(academicCourseRecords).where(inArray(academicCourseRecords.snapshotId, scopedSnapshotIds)).orderBy(asc(academicCourseRecords.sortOrder))
    : [];
  const trendRows = activeSnapshotIds.length
    ? await db.select().from(academicTrends).where(inArray(academicTrends.snapshotId, scopedSnapshotIds))
    : [];
  const creditRows = activeSnapshotIds.length
    ? await db.select().from(creditSummaries).where(inArray(creditSummaries.snapshotId, scopedSnapshotIds))
    : [];
  const evaluationReferenceRows = activeSnapshotIds.length
    ? await db.select().from(evaluationReferences).where(inArray(evaluationReferences.snapshotId, scopedSnapshotIds))
    : [];
  const competencyRows = activeSnapshotIds.length
    ? await db.select().from(competencyEvaluations).where(inArray(competencyEvaluations.snapshotId, scopedSnapshotIds)).orderBy(asc(competencyEvaluations.sortOrder))
    : [];
  let pendingUsers: Array<{ id: number; email: string; displayName: string; createdAt: string }> = [];
  if (viewer.role === "admin") {
    pendingUsers = await db.select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt }).from(users).where(eq(users.status, "pending")).orderBy(desc(users.createdAt));
  } else if (viewer.role === "teacher") {
    const studentEmails = studentRows.map((row) => row.email).filter((email): email is string => Boolean(email));
    pendingUsers = studentEmails.length
      ? await db.select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt }).from(users).where(and(eq(users.status, "pending"), inArray(users.email, db.select({ email: students.email }).from(students).where(studentScope)))).orderBy(desc(users.createdAt))
      : [];
  }
  const staffUsers = viewer.role === "admin"
    ? await db.select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role }).from(users).where(and(eq(users.status, "approved"), inArray(users.role, ["admin", "teacher"]))).orderBy(asc(users.displayName))
    : [];

  const activeRawRows = activeSnapshotIds.length ? await db.select({id:profileSnapshots.id,rawJson:profileSnapshots.rawJson}).from(profileSnapshots).where(inArray(profileSnapshots.id, scopedSnapshotIds)) : [];
  const data = hydrateProfileDetails({
    guidance: [], referenceChecks: [], appliedCriteria: [],
    viewer,
    classes: classRows,
    students: studentRows,
    subjects: subjectRows,
    activities: activityRows,
    fingerprints: fingerprintRows.map((row) => ({
      ...row,
      keywords: jsonArray(row.keywordsJson),
      methods: jsonArray(row.methodsJson),
      evidence: jsonArray(row.evidenceJson),
      competencies: jsonArray(row.competenciesJson),
      questions: jsonArray(row.questionsJson),
      subjectLinks: jsonArray(row.subjectLinksJson),
    })),
    threads: threadRows,
    threadActivities: linkedRows,
    files: fileRows,
    records: recordRows.map(({ coverageJson, ...row }) => ({ ...row, coverage: recordCoverage({ ...row, coverageJson }) })),
    ...await getReferenceLibrary(viewer),
    profileSnapshots: snapshotRows.map((row) => ({
      ...row,
      strengths: jsonArray(row.strengthsJson),
      cautions: jsonArray(row.cautionsJson),
      sourceYears: jsonArray(row.sourceYearsJson).map(Number).filter(Number.isFinite),
    })),
    profileSections: sectionRows.map((row) => ({
      ...row,
      evidence: jsonArray(row.evidenceText),
      keywords: jsonArray(row.keywordsJson),
      competencies: jsonArray(row.competenciesJson),
    })),
    researchKeywords: keywordRows.map((row) => ({ ...row, evidenceRefs: jsonArray(row.evidenceRefsJson) })),
    ontologyNodes: nodeRows.map((row) => ({ ...row, evidenceRefs: jsonArray(row.evidenceRefsJson) })),
    ontologyEdges: edgeRows,
    wikiPages: wikiRows.map((row) => ({
      ...row,
      keywords: jsonArray(row.keywordsJson),
      linkedNodeKeys: jsonArray(row.linkedNodeKeysJson),
    })),
    academicCourses: academicRows,
    academicTrends: trendRows.map((row) => ({
      ...row,
      points: (() => { try { const value = JSON.parse(row.pointsJson); return Array.isArray(value) ? value : []; } catch { return []; } })(),
      evidenceRefs: jsonArray(row.evidenceRefsJson),
    })),
    creditSummaries: creditRows.map((row) => ({ ...row, evidenceRefs: jsonArray(row.evidenceRefsJson) })),
    evaluationReferences: evaluationReferenceRows,
    competencyEvaluations: competencyRows.map((row) => ({
      ...row,
      evidenceRefs: jsonArray(row.evidenceRefsJson), strengths: jsonArray(row.strengthsJson),
      gaps: jsonArray(row.gapsJson), nextActions: jsonArray(row.nextActionsJson),
    })),
    pendingUsers,
    staffUsers,
  } as PortalData, activeRawRows);
  return {...data, ...await guidanceForPortal(viewer, data)};
}

function requireStaff(viewer: Viewer) {
  if (!isSchoolStaff(viewer)) {
    throw new Error("교사 또는 관리자 권한이 필요합니다.");
  }
}

async function teacherClass(viewer: Viewer, classId: number) {
  requireStaff(viewer);
  const [row] = await getDb().select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (row && canManageSchoolClass(viewer, row)) return row;
  throw new Error("이 학급에 접근할 수 없습니다.");
}

async function accessibleStudent(viewer: Viewer, studentId: number) {
  const db = getDb();
  const [row] = await db
    .select({ student: students, classroom: classes })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.id, studentId))
    .limit(1);
  if (!row) throw new Error("학생을 찾을 수 없습니다.");
  if (!canAccessSchoolStudent(viewer, row.student, row.classroom)) throw new Error("이 학생 자료에 접근할 수 없습니다.");
  return row.student;
}

export async function performPortalAction(viewer: Viewer, body: Record<string, unknown>) {
  if (!approvedSchoolRole(viewer)) throw new Error("승인된 계정 권한이 필요합니다.");
  await assertStorageWritable();
  if (await googleEnabled()) return googleAction(viewer, body);
  const action = requiredText(body.action, "작업", 80);
  const db = getDb();

  if (action === "setReferenceSelection") return saveReferenceSelection(viewer, body.materialIds);
  if (action === "setReferenceStatus") return setReferenceStatus(viewer, body.materialId, body.status);

  if (action === "addClass") {
    requireStaff(viewer);
    const grade = Number(body.grade);
    const schoolYear = Number(body.schoolYear);
    if (!Number.isInteger(grade) || grade < 2 || grade > 3)
      throw new Error("2학년 또는 3학년 학급만 만들 수 있습니다.");
    if (
      !Number.isInteger(schoolYear) ||
      schoolYear < 2022 ||
      schoolYear > 2100
    )
      throw new Error("학년도를 확인하세요.");
    let teacherId = viewer.id;
    if (viewer.role === "admin") {
      teacherId = numericId(body.teacherId, "담당 교사");
      const [teacher] = await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.id, teacherId)).limit(1);
      if (!teacher || teacher.status !== "approved" || (teacher.role !== "teacher" && teacher.role !== "admin")) {
        throw new Error("승인된 교사 또는 관리자를 담당자로 선택하세요.");
      }
    }
    const [classroom] = await db
      .insert(classes)
      .values({
        teacherId,
        name: requiredText(body.name, "학급명", 100),
        grade,
        schoolYear,
        inviteCode: `TRACE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      })
      .returning();
    await db.insert(subjects).values([
      {
        classId: classroom.id,
        name: "통합과학",
        color: "#2457d6",
        sortOrder: 1,
      },
      {
        classId: classroom.id,
        name: "과학탐구실험",
        color: "#0d8b72",
        sortOrder: 2,
      },
      {
        classId: classroom.id,
        name: "생명과학",
        color: "#8a4fd3",
        sortOrder: 3,
      },
    ]);
    return { ok: true, classroom };
  }

  if (action === "addStudent") {
    const classId = numericId(body.classId, "학급");
    await teacherClass(viewer, classId);
    const email = optionalText(body.email, 320).toLowerCase() || null;
    let account: (typeof users.$inferSelect) | undefined;
    if (email) {
      [account] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (account?.role === "admin" || account?.role === "teacher") {
        throw new Error("교사·관리자 계정 이메일은 학생에게 연결할 수 없습니다.");
      }
      if (account?.status === "suspended") throw new Error("정지된 계정은 학생에게 연결할 수 없습니다.");
      if (account) {
        const [alreadyLinked] = await db.select({ id: students.id }).from(students).where(eq(students.userId, account.id)).limit(1);
        if (alreadyLinked) throw new Error("이미 다른 학생 프로필에 연결된 계정입니다.");
      }
    }
    const [student] = await db.insert(students).values({
      classId,
      studentNumber: requiredText(body.studentNumber, "학번", 30),
      name: requiredText(body.name, "이름", 80),
      email,
    }).returning();
    if (account) {
      await db.batch([
        db.update(students).set({ userId: account.id }).where(eq(students.id, student.id)),
        db.update(users).set({ role: "student", status: "approved" }).where(eq(users.id, account.id)),
      ]);
    }
    return { ok: true, student };
  }

  if (action === "bulkAddStudents") {
    requireStaff(viewer);
    const classId = numericId(body.classId, "학급");
    await teacherClass(viewer, classId);
    if (!Array.isArray(body.students) || body.students.length < 1) throw new Error("등록할 학생이 없습니다.");
    if (body.students.length > 300) throw new Error("한 번에 최대 300명까지 등록할 수 있습니다.");

    const incoming: BulkStudentRow[] = body.students.map((value, index) => {
      const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const rowNumber = Number.isSafeInteger(Number(row.rowNumber)) && Number(row.rowNumber) > 1 ? Number(row.rowNumber) : index + 2;
      const studentNumber = typeof row.studentNumber === "string" ? row.studentNumber.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const email = typeof row.email === "string" ? row.email : "";
      return normalizeStudentRow({ rowNumber, studentNumber, name, email });
    });
    const issues = validateStudentRows(incoming).map((issue) => `${issue.rowNumber ? `${issue.rowNumber}행: ` : ""}${issue.message}`);
    if (issues.length) throw new Error(`입력 검증 오류: ${issues.slice(0, 8).join(" / ")}`);

    const studentNumbers = incoming.map((item) => item.studentNumber).filter(Boolean);
    if (studentNumbers.length) {
      const existingNumbers: Array<{ studentNumber: string }> = [];
      for (const group of chunks(studentNumbers, 90)) {
        existingNumbers.push(...await db.select({ studentNumber: students.studentNumber }).from(students)
          .where(and(eq(students.classId, classId), inArray(students.studentNumber, group))));
      }
      const conflicts = new Set(existingNumbers.map((item) => item.studentNumber));
      for (const item of incoming) if (conflicts.has(item.studentNumber)) issues.push(`${item.rowNumber}행: 이 학급에 학번 ${item.studentNumber} 학생이 이미 있습니다.`);
    }

    const emails = incoming.flatMap((item) => item.email ? [item.email] : []);
    let accounts: Array<typeof users.$inferSelect> = [];
    if (emails.length) {
      const existingEmailRows: Array<{ email: string | null }> = [];
      const linkedIds = new Set<number>();
      const accountById = new Map<number, typeof users.$inferSelect>();
      for (const group of chunks(emails, 90)) {
        existingEmailRows.push(...await db.select({ email: students.email }).from(students).where(inArray(students.email, group)));
        const accountRows = await db.select({ account: users, linkedStudentId: students.id })
          .from(users)
          .leftJoin(students, eq(students.userId, users.id))
          .where(inArray(users.email, group));
        for (const row of accountRows) {
          accountById.set(row.account.id, row.account);
          if (row.linkedStudentId) linkedIds.add(row.account.id);
        }
      }
      accounts = Array.from(accountById.values());
      const existingEmails = new Set(existingEmailRows.flatMap((item) => item.email ? [item.email.toLowerCase()] : []));
      for (const item of incoming) if (item.email && existingEmails.has(item.email)) issues.push(`${item.rowNumber}행: 이메일 ${item.email}은(는) 다른 학생에게 이미 등록되어 있습니다.`);

      const accountByEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), account]));
      for (const item of incoming) {
        if (!item.email) continue;
        const account = accountByEmail.get(item.email);
        if (!account) continue;
        if (account.role === "admin" || account.role === "teacher") issues.push(`${item.rowNumber}행: 교사·관리자 계정 이메일은 학생에게 연결할 수 없습니다.`);
        else if (account.status === "suspended") issues.push(`${item.rowNumber}행: 정지된 계정은 학생에게 연결할 수 없습니다.`);
        else if (linkedIds.has(account.id)) issues.push(`${item.rowNumber}행: 이미 다른 학생 프로필에 연결된 계정입니다.`);
      }
    }

    if (issues.length) {
      const summary = issues.slice(0, 8).join(" / ");
      const remainder = issues.length > 8 ? ` / 외 ${issues.length - 8}개` : "";
      throw new Error(`엑셀 검증 오류: ${summary}${remainder}`);
    }

    const accountByEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), account]));
    const batch = buildStudentRegistrationBatch(db, classId, incoming, accountByEmail);
    try {
      // One D1 batch is transactional: student rows and account approvals succeed or roll back together.
      await db.batch(batch.statements);
      return { ok: true, createdCount: incoming.length, linkedCount: batch.linkedCount };
    } catch (caught) {
      // Database errors may contain SQL bindings with students' personal data.
      console.error("bulkAddStudents batch failed", caught instanceof Error ? caught.name : "UnknownError");
      throw new Error("학생 등록을 완료하지 못했습니다. 입력 내용은 유지됩니다. 목록을 새로고침해 등록 여부를 확인한 후 다시 시도하세요.");
    }
  }

  if (action === "assignClassTeacher") {
    if (viewer.role !== "admin" || viewer.status !== "approved") throw new Error("학교 관리자 권한이 필요합니다.");
    const classId = numericId(body.classId, "학급");
    const teacherId = numericId(body.teacherId, "담당 교사");
    const [teacher] = await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.id, teacherId)).limit(1);
    if (!teacher || teacher.status !== "approved" || (teacher.role !== "teacher" && teacher.role !== "admin")) {
      throw new Error("승인된 교사 또는 관리자를 담당자로 선택하세요.");
    }
    const [classroom] = await db.update(classes).set({ teacherId }).where(eq(classes.id, classId)).returning();
    if (!classroom) throw new Error("학급을 찾을 수 없습니다.");
    return { ok: true, classroom };
  }

  if (action === "archiveStudent") {
    const studentId = numericId(body.studentId, "학생");
    const student = await accessibleStudent(viewer, studentId);
    await teacherClass(viewer, student.classId);
    await db.update(students).set({ status: "archived" }).where(eq(students.id, studentId));
    return { ok: true };
  }

  if (action === "updateStudentStatus") {
    const studentId = numericId(body.studentId, "학생");
    const student = await accessibleStudent(viewer, studentId);
    await teacherClass(viewer, student.classId);
    const status = body.status;
    if (status !== "active" && status !== "graduated") throw new Error("학생 상태가 올바르지 않습니다.");
    let graduatedYear: number | null = null;
    if (status === "graduated") {
      const candidateYear = Number(body.graduatedYear);
      if (!Number.isInteger(candidateYear) || candidateYear < 2022 || candidateYear > 2100) throw new Error("졸업 연도를 확인하세요.");
      graduatedYear = candidateYear;
    }
    await db.update(students).set({
      status,
      graduatedYear,
      graduatedAt: status === "graduated" ? new Date().toISOString() : null,
    }).where(eq(students.id, studentId));
    return { ok: true };
  }

  if (action === "addSubject") {
    const classId = numericId(body.classId, "학급");
    await teacherClass(viewer, classId);
    const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(${subjects.sortOrder}), 0)` }).from(subjects).where(eq(subjects.classId, classId));
    const [subject] = await db.insert(subjects).values({
      classId,
      name: requiredText(body.name, "교과명", 80),
      color: optionalText(body.color, 20) || "#2457d6",
      sortOrder: Number(maxOrder) + 1,
    }).returning();
    return { ok: true, subject };
  }

  if (action === "addActivity") {
    requireStaff(viewer);
    const studentId = numericId(body.studentId, "학생");
    const subjectId = numericId(body.subjectId, "교과");
    const student = await accessibleStudent(viewer, studentId);
    const [subject] = await db.select().from(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.classId, student.classId))).limit(1);
    if (!subject) throw new Error("학생 학급의 교과를 선택하세요.");
    const [activity] = await db.insert(activities).values({
      studentId,
      subjectId,
      createdBy: viewer.id,
      title: requiredText(body.title, "활동 제목", 180),
      activityType: requiredText(body.activityType, "활동 유형", 60),
      activityDate: requiredText(body.activityDate, "활동 날짜", 10),
      rawText: requiredText(body.rawText, "활동 원문", 20_000),
      sourceNote: optionalText(body.sourceNote, 600),
      status: "submitted",
    }).returning();
    return { ok: true, activity };
  }

  if (action === "analyzeActivity") {
    requireStaff(viewer);
    const activityId = numericId(body.activityId, "활동");
    const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
    if (!activity) throw new Error("활동을 찾을 수 없습니다.");
    await accessibleStudent(viewer, activity.studentId);
    const analysis = analyzeActivityText(activity.title, activity.rawText);
    const values = {
      studentId: activity.studentId,
      summary: analysis.summary,
      keywordsJson: JSON.stringify(analysis.keywords),
      methodsJson: JSON.stringify(analysis.methods),
      evidenceJson: JSON.stringify(analysis.evidence),
      competenciesJson: JSON.stringify(analysis.competencies),
      questionsJson: JSON.stringify(analysis.questions),
      subjectLinksJson: JSON.stringify(analysis.subjectLinks),
      status: "draft" as const,
      approvedBy: null,
      approvedAt: null,
      updatedAt: new Date().toISOString(),
    };
    const [existing] = await db.select().from(fingerprints).where(eq(fingerprints.activityId, activityId)).limit(1);
    const [fingerprint] = existing
      ? await db.update(fingerprints).set(values).where(eq(fingerprints.id, existing.id)).returning()
      : await db.insert(fingerprints).values({ activityId, ...values }).returning();
    await db.update(activities).set({ status: "analyzed", updatedAt: new Date().toISOString() }).where(eq(activities.id, activityId));
    return { ok: true, fingerprint };
  }

  if (action === "updateFingerprint" || action === "approveFingerprint" || action === "returnFingerprint") {
    if ((viewer.role !== "teacher" && viewer.role !== "admin") || viewer.status !== "approved") throw new Error("교사 또는 관리자 권한이 필요합니다.");
    const fingerprintId = numericId(body.fingerprintId, "분석 지문");
    const [row] = await db
      .select({ fingerprint: fingerprints, activity: activities, classroom: classes })
      .from(fingerprints)
      .innerJoin(activities, eq(fingerprints.activityId, activities.id))
      .innerJoin(students, eq(activities.studentId, students.id))
      .innerJoin(classes, eq(students.classId, classes.id))
      .where(eq(fingerprints.id, fingerprintId))
      .limit(1);
    if (!row || (viewer.role !== "admin" && row.classroom.teacherId !== viewer.id)) throw new Error("이 분석 지문을 검토할 수 없습니다.");

    if (action === "updateFingerprint") {
      const asArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 20) : [];
      await db.update(fingerprints).set({
        summary: requiredText(body.summary, "요약", 1_000),
        keywordsJson: JSON.stringify(asArray(body.keywords)),
        methodsJson: JSON.stringify(asArray(body.methods)),
        evidenceJson: JSON.stringify(asArray(body.evidence)),
        competenciesJson: JSON.stringify(asArray(body.competencies)),
        questionsJson: JSON.stringify(asArray(body.questions)),
        subjectLinksJson: JSON.stringify(asArray(body.subjectLinks)),
        updatedAt: new Date().toISOString(),
      }).where(eq(fingerprints.id, fingerprintId));
      return { ok: true };
    }

    const approved = action === "approveFingerprint";
    await db.update(fingerprints).set({
      status: approved ? "approved" : "returned",
      approvedBy: approved ? viewer.id : null,
      approvedAt: approved ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }).where(eq(fingerprints.id, fingerprintId));
    await db.update(activities).set({ status: approved ? "approved" : "returned", updatedAt: new Date().toISOString() }).where(eq(activities.id, row.activity.id));
    return { ok: true };
  }

  if (action === "addThread") {
    requireStaff(viewer);
    const studentId = numericId(body.studentId, "학생");
    await accessibleStudent(viewer, studentId);
    const [thread] = await db.insert(inquiryThreads).values({
      studentId,
      title: requiredText(body.title, "탐구 흐름 제목", 160),
      focusQuestion: requiredText(body.focusQuestion, "중심 질문", 500),
      status: "developing",
    }).returning();
    return { ok: true, thread };
  }

  if (action === "linkActivity") {
    requireStaff(viewer);
    const threadId = numericId(body.threadId, "탐구 흐름");
    const activityId = numericId(body.activityId, "활동");
    const [thread] = await db.select().from(inquiryThreads).where(eq(inquiryThreads.id, threadId)).limit(1);
    const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
    if (!thread || !activity || thread.studentId !== activity.studentId) throw new Error("같은 학생의 활동만 연결할 수 있습니다.");
    await accessibleStudent(viewer, thread.studentId);
    const [{ maxSequence }] = await db.select({ maxSequence: sql<number>`coalesce(max(${threadActivities.sequence}), 0)` }).from(threadActivities).where(eq(threadActivities.threadId, threadId));
    await db.insert(threadActivities).values({ threadId, activityId, sequence: Number(maxSequence) + 1 }).onConflictDoNothing();
    return { ok: true };
  }

  if (action === "importProfile") {
    if ((viewer.role !== "teacher" && viewer.role !== "admin") || viewer.status !== "approved") {
      throw new Error("교사 또는 관리자 권한이 필요합니다.");
    }
    const studentId = numericId(body.studentId, "학생");
    const student = await accessibleStudent(viewer, studentId);
    const classroom = await teacherClass(viewer, student.classId);
    let candidate = body.profile;
    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        throw new Error("Work 결과 JSON의 형식이 올바르지 않습니다.");
      }
    }
    const parsed = profileImportSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`Work 결과 형식 오류: ${first.path.join(".")} ${first.message}`.trim());
    }
    const profile = parsed.data;
    if (profile.studentReference && (profile.studentReference.studentNumber !== student.studentNumber || profile.studentReference.name !== student.name)) {
      throw new Error("Work 결과의 학번·이름이 선택한 학생과 다릅니다.");
    }
    const [sameVersion] = await db.select({ id: profileSnapshots.id }).from(profileSnapshots).where(and(eq(profileSnapshots.studentId, studentId), eq(profileSnapshots.versionLabel, profile.versionLabel))).limit(1);
    if (sameVersion) throw new Error("이미 저장된 버전명입니다. Work 결과의 versionLabel을 새 이름으로 변경하세요.");
    const uploaded = await db.select().from(studentRecords).where(eq(studentRecords.studentId, studentId));
    const coverageIssues = profileCoverageIssues(profile, classroom.grade, uploaded, student.isExample);
    if (coverageIssues.length) throw new Error(coverageIssues[0]);
    const library = await getReferenceLibrary(viewer);
    const libraryIssues = libraryReferenceIssues(profile, library.referenceMaterials, await getReferenceGuidance(viewer));
    if (libraryIssues.length) throw new Error(libraryIssues[0]);
    const reflectedRecordIds = uploaded.filter((record) => recordCoverage(record).every((item) => profile.sourceYears.includes(item.schoolYear))).map((record) => record.id);

    const referenceIssues = [...profileReferenceIssues(profile), ...profileEvidenceIssues(profile, uploaded.map(r=>({...r,coverage:recordCoverage(r)})), studentId)];
    if (referenceIssues.length) throw new Error(referenceIssues[0]);

    const [snapshot] = await db.insert(profileSnapshots).values({
      studentId,
      createdBy: viewer.id,
      versionLabel: profile.versionLabel,
      schemaVersion: profile.schemaVersion,
      oneLineProfile: profile.overview.oneLineProfile,
      narrative: profile.overview.narrative,
      strengthsJson: JSON.stringify(profile.overview.strengths),
      cautionsJson: JSON.stringify(profile.overview.cautions),
      coursePattern: profile.overview.coursePattern,
      sourceYearsJson: JSON.stringify(profile.sourceYears.map(String)),
      rawJson: JSON.stringify(profile),
      isActive: false,
    }).returning();

    const insertChunked = async <T>(rows: T[], insert: (rows: T[]) => Promise<unknown>) => {
      if (!rows.length) return;
      const size = Math.max(1, Math.floor(90 / (Object.keys(rows[0] as object).length + 2)));
      for (const batch of chunks(rows, size)) await insert(batch);
    };
    try {
      await insertChunked(profile.sections.map((item, index) => ({
      snapshotId: snapshot.id, studentId, sectionType: item.type, schoolYear: item.schoolYear,
      subject: item.subject, title: item.title, summary: item.summary,
      evidenceText: JSON.stringify(item.evidence), keywordsJson: JSON.stringify(item.keywords),
      competenciesJson: JSON.stringify(item.competencies), sortOrder: index,
      })), (rows) => db.insert(profileSections).values(rows));
      await insertChunked(profile.researchFingerprint.map((item) => ({
      snapshotId: snapshot.id, studentId, keyword: item.keyword, category: item.category,
      description: item.description, weight: item.weight, evidenceRefsJson: JSON.stringify(item.evidenceRefs),
      })), (rows) => db.insert(researchKeywords).values(rows));
      await insertChunked(profile.ontology.nodes.map((item) => ({
      snapshotId: snapshot.id, studentId, nodeKey: item.id, nodeType: item.type, label: item.label,
      description: item.description, weight: item.weight, evidenceRefsJson: JSON.stringify(item.evidenceRefs),
      })), (rows) => db.insert(ontologyNodes).values(rows));
      await insertChunked(profile.ontology.edges.map((item) => ({
      snapshotId: snapshot.id, studentId, sourceKey: item.source, targetKey: item.target,
      relation: item.relation, description: item.description, weight: item.weight,
      })), (rows) => db.insert(ontologyEdges).values(rows));
      await insertChunked(profile.wikiPages.map((item, index) => ({
      snapshotId: snapshot.id, studentId, slug: item.slug, pageType: item.type, title: item.title,
      summary: item.summary, bodyMarkdown: item.bodyMarkdown, keywordsJson: JSON.stringify(item.keywords),
      linkedNodeKeysJson: JSON.stringify(item.linkedNodeIds), sortOrder: index,
      })), (rows) => db.insert(wikiPages).values(rows));
      await insertChunked(profile.academicAnalysis.courses.map((item, index) => ({
      snapshotId: snapshot.id, studentId, schoolYear: item.schoolYear, gradeLevel: item.gradeLevel,
      semester: item.semester, subjectGroup: item.subjectGroup, subject: item.subject,
      courseType: item.courseType, selectionStatus: item.selectionStatus, credits: item.credits ?? 0,
      rawScore: item.rawScore, achievement: item.achievement, rankGrade: item.rankGrade,
      classAverage: item.classAverage, standardDeviation: item.standardDeviation,
      studentCount: item.studentCount, evidenceText: item.evidence, sortOrder: index,
      })), (rows) => db.insert(academicCourseRecords).values(rows));
      await insertChunked(profile.academicAnalysis.trends.map((item) => ({
      snapshotId: snapshot.id, studentId, subjectGroup: item.subjectGroup, subject: item.subject,
      direction: item.direction, summary: item.summary, pointsJson: JSON.stringify(item.points),
      evidenceRefsJson: JSON.stringify(item.evidenceRefs),
      })), (rows) => db.insert(academicTrends).values(rows));
      await insertChunked(profile.academicAnalysis.creditSummary.map((item) => ({
      snapshotId: snapshot.id, studentId, subjectGroup: item.subjectGroup,
      completedCredits: item.completedCredits ?? 0, selectedCredits: item.selectedCredits ?? 0,
      plannedCredits: item.plannedCredits ?? 0, note: item.note,
      evidenceRefsJson: JSON.stringify(item.evidenceRefs),
      })), (rows) => db.insert(creditSummaries).values(rows));
      await insertChunked(profile.evaluationAnalysis.references.map((item) => ({
      snapshotId: snapshot.id, studentId, sourceKey: item.id, title: item.title,
      institution: item.institution, admissionsYear: item.admissionsYear,
      admissionTrack: item.admissionTrack, category: item.category, note: item.note,
      })), (rows) => db.insert(evaluationReferences).values(rows));
      await insertChunked(profile.evaluationAnalysis.competencies.map((item, index) => ({
      snapshotId: snapshot.id, studentId, sourceKey: item.sourceId, competency: item.competency,
      score: item.score ?? 0, level: item.level, summary: item.summary,
      evidenceRefsJson: JSON.stringify(item.evidenceRefs), strengthsJson: JSON.stringify(item.strengths),
      gapsJson: JSON.stringify(item.gaps), nextActionsJson: JSON.stringify(item.nextActions),
      caveat: item.caveat, sortOrder: index,
      })), (rows) => db.insert(competencyEvaluations).values(rows));
      await db.batch([
        db.update(profileSnapshots).set({ isActive: false }).where(eq(profileSnapshots.studentId, studentId)),
        ...chunks(reflectedRecordIds, 90).map((ids) => db.update(studentRecords).set({ processingStatus: "reflected" }).where(and(eq(studentRecords.studentId, studentId), inArray(studentRecords.id, ids)))),
        db.update(profileSnapshots).set({ isActive: true }).where(eq(profileSnapshots.id, snapshot.id)),
      ]);
      return { ok: true, snapshot: { ...snapshot, isActive: true } };
    } catch (error) {
      await db.delete(profileSnapshots).where(eq(profileSnapshots.id, snapshot.id));
      throw error;
    }
  }

  if (action === "activateProfileVersion") {
    if ((viewer.role !== "teacher" && viewer.role !== "admin") || viewer.status !== "approved") throw new Error("교사 또는 관리자 권한이 필요합니다.");
    const snapshotId = numericId(body.snapshotId, "프로필 버전");
    const [snapshot] = await db.select().from(profileSnapshots).where(eq(profileSnapshots.id, snapshotId)).limit(1);
    if (!snapshot) throw new Error("프로필 버전을 찾을 수 없습니다.");
    await accessibleStudent(viewer, snapshot.studentId);
    await db.batch([
      db.update(profileSnapshots).set({ isActive: false }).where(eq(profileSnapshots.studentId, snapshot.studentId)),
      db.update(profileSnapshots).set({ isActive: true }).where(eq(profileSnapshots.id, snapshotId)),
    ]);
    return { ok: true };
  }

  if (action === "approveUser") {
    requireStaff(viewer);
    const userId = numericId(body.userId, "사용자");
    const studentId = numericId(body.studentId, "학생");
    const student = await accessibleStudent(viewer, studentId);
    await teacherClass(viewer, student.classId);
    const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!account || account.status !== "pending" || account.role !== "student") throw new Error("승인 대기 중인 학생 계정만 연결할 수 있습니다.");
    if (!student.email || student.email.toLowerCase() !== account.email.toLowerCase()) throw new Error("학생 프로필과 계정 이메일이 일치하지 않습니다.");
    const [alreadyLinked] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
    if (alreadyLinked && alreadyLinked.id !== studentId) throw new Error("이미 다른 학생 프로필에 연결된 계정입니다.");
    await db.batch([
      db.update(users).set({ role: "student", status: "approved" }).where(eq(users.id, userId)),
      db.update(students).set({ userId }).where(eq(students.id, studentId)),
    ]);
    return { ok: true };
  }

  if (action === "approveTeacher") {
    if (viewer.role !== "admin" || viewer.status !== "approved") throw new Error("학교 관리자 권한이 필요합니다.");
    const userId = numericId(body.userId, "사용자");
    const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!account || account.status !== "pending" || account.role !== "student") throw new Error("승인 대기 계정만 담임으로 승인할 수 있습니다.");
    await db.update(users).set({ role: "teacher", status: "approved" }).where(eq(users.id, userId));
    return { ok: true };
  }

  throw new Error("지원하지 않는 작업입니다.");
}

export async function assertActivityAccess(viewer: Viewer, activityId: number) {
  if (await googleEnabled()) {
    const state = await readGoogleState(), current = currentGoogleViewer(state, viewer);
    const activity = state.tables.activities.find(row => row.id === activityId);
    if (!activity) throw new Error("활동을 찾을 수 없습니다.");
    googleStudentAccess(state, current, activity.studentId); return activity;
  }
  const [activity] = await getDb().select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) throw new Error("활동을 찾을 수 없습니다.");
  await accessibleStudent(viewer, activity.studentId);
  return activity;
}

export async function assertStudentAccess(viewer: Viewer, studentId: number) {
  if (await googleEnabled()) { const state = await readGoogleState(); return googleStudentAccess(state, currentGoogleViewer(state, viewer), studentId); }
  const student = await accessibleStudent(viewer, studentId);
  const [classroom] = await getDb().select().from(classes).where(eq(classes.id, student.classId)).limit(1);
  if (!classroom) throw new Error("학급을 찾을 수 없습니다.");
  return { student, classroom };
}

export async function assertStudentRecordAccess(viewer: Viewer, recordId: number) {
  if (await googleEnabled()) {
    const state = await readGoogleState(), current = currentGoogleViewer(state, viewer);
    const record = state.tables.studentRecords.find(row => row.id === recordId);
    if (!record) throw new Error("학생부 원본을 찾을 수 없습니다.");
    googleStudentAccess(state, current, record.studentId); return record;
  }
  const [record] = await getDb().select().from(studentRecords).where(eq(studentRecords.id, recordId)).limit(1);
  if (!record) throw new Error("학생부 원본을 찾을 수 없습니다.");
  await accessibleStudent(viewer, record.studentId);
  return record;
}
