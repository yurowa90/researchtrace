import type { AppliedCriterion, GuidanceEntry, ReferenceCheck } from "@/lib/guidance";
export type Viewer = {
  id: number;
  email: string;
  displayName: string;
  role: "admin" | "teacher" | "student";
  status: "pending" | "approved" | "suspended";
};

export type Classroom = {
  id: number;
  teacherId: number;
  name: string;
  grade: number;
  schoolYear: number;
  inviteCode: string;
};

export type Student = {
  id: number;
  classId: number;
  userId: number | null;
  studentNumber: string;
  name: string;
  email: string | null;
  status: "active" | "graduated" | "archived";
  graduatedYear: number | null;
  graduatedAt: string | null;
  isExample: boolean;
};

export type Subject = {
  id: number;
  classId: number;
  name: string;
  color: string;
};

export type StudentActivity = {
  id: number;
  studentId: number;
  subjectId: number;
  title: string;
  activityType: string;
  activityDate: string;
  rawText: string;
  sourceNote: string;
  status: "submitted" | "analyzed" | "approved" | "returned";
};

export type Fingerprint = {
  id: number;
  activityId: number;
  studentId: number;
  summary: string;
  status: "draft" | "approved" | "returned";
  keywords: string[];
  methods: string[];
  evidence: string[];
  competencies: string[];
  questions: string[];
  subjectLinks: string[];
};

export type InquiryThread = {
  id: number;
  studentId: number;
  title: string;
  focusQuestion: string;
  status: "developing" | "active" | "complete";
};

export type PortalData = {
  viewer: Viewer;
  guidance: GuidanceEntry[];
  referenceChecks: ReferenceCheck[];
  appliedCriteria: AppliedCriterion[];
  classes: Classroom[];
  students: Student[];
  subjects: Subject[];
  activities: StudentActivity[];
  fingerprints: Fingerprint[];
  threads: InquiryThread[];
  threadActivities: Array<{ threadId: number; activityId: number; sequence: number }>;
  files: Array<{ id: number; activityId: number; originalName: string; contentType: string; sizeBytes: number }>;
  records: StudentRecord[];
  referenceMaterials: ReferenceMaterial[];
  selectedReferenceMaterialIds: number[];
  profileSnapshots: ProfileSnapshot[];
  profileSections: ProfileSection[];
  researchKeywords: ResearchKeyword[];
  ontologyNodes: OntologyNode[];
  ontologyEdges: OntologyEdge[];
  wikiPages: WikiPage[];
  academicCourses: AcademicCourse[];
  academicTrends: AcademicTrend[];
  creditSummaries: CreditSummary[];
  evaluationReferences: EvaluationReference[];
  competencyEvaluations: CompetencyEvaluation[];
  pendingUsers: Array<{ id: number; email: string; displayName: string; createdAt: string }>;
  staffUsers: Array<{ id: number; email: string; displayName: string; role: "admin" | "teacher" }>;
};

export type StudentRecord = {
  id: number;
  studentId: number;
  schoolYear: number;
  recordGrade: number;
  coverage: RecordCoverage[];
  originalName: string;
  contentType: string;
  sizeBytes: number;
  processingStatus: "source_only" | "reflected";
  createdAt: string;
};

export type RecordCoverage = { grade: number; schoolYear: number };
export type ReferenceMaterial = {
  id: number; title: string; institution: string; admissionsYear: number | null;
  admissionTrack: string; category: "admission_guide" | "evaluation_criteria" | "preparation_guide" | "other";
  note: string; originalName: string; contentType: string; sizeBytes: number;
  sha256: string; status: "active" | "archived"; createdAt: string;
};

export type ProfileSnapshot = {
  id: number;
  studentId: number;
  versionLabel: string;
  schemaVersion: string;
  analysisContext?: { asOf?: string; admissionsYear: number | null; curriculum: string; gradingSystem: string; limitations: string[] };
  oneLineProfile: string;
  narrative: string;
  strengths: string[];
  cautions: string[];
  coursePattern: string;
  sourceYears: number[];
  isActive: boolean;
  createdAt: string;
};

export type ProfileSection = {
  id: number;
  snapshotId: number;
  studentId: number;
  sectionType: string;
  sectionKey?: string;
  sourceState?: "recorded" | "self_report" | "interpretation" | "planned" | "unknown" | "not_applicable";
  recordId?: number | null;
  page?: number | null;
  sourceLocation?: string;
  schoolYear: number;
  subject: string;
  title: string;
  summary: string;
  evidence: string[];
  keywords: string[];
  competencies: string[];
  sortOrder: number;
};

export type ResearchKeyword = {
  id: number;
  snapshotId: number;
  studentId: number;
  keyword: string;
  category: string;
  description: string;
  weight: number;
  evidenceRefs: string[];
};

export type OntologyNode = {
  id: number;
  snapshotId: number;
  studentId: number;
  nodeKey: string;
  nodeType: string;
  label: string;
  description: string;
  weight: number;
  evidenceRefs: string[];
};

export type OntologyEdge = {
  id: number;
  snapshotId: number;
  studentId: number;
  sourceKey: string;
  targetKey: string;
  evidenceRefs?: string[];
  sourceState?: string;
  relation: string;
  description: string;
  weight: number;
};

export type WikiPage = {
  id: number;
  snapshotId: number;
  studentId: number;
  slug: string;
  pageType: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  keywords: string[];
  linkedNodeKeys: string[];
};

export type AcademicCourse = {
  id: number;
  snapshotId: number;
  studentId: number;
  schoolYear: number;
  gradeLevel: number;
  semester: number;
  subjectGroup: string;
  subject: string;
  courseType: string;
  selectionStatus: "completed" | "selected" | "planned";
  credits: number | null;
  gradingSystem?: "five" | "nine" | "achievement" | "unknown";
  evidenceRefs?: string[];
  rawScore: string;
  achievement: string;
  rankGrade: string;
  classAverage: string;
  standardDeviation: string;
  studentCount: number | null;
  evidenceText: string;
};

export type AcademicTrend = {
  id: number;
  snapshotId: number;
  studentId: number;
  subjectGroup: string;
  subject: string;
  direction: "up" | "steady" | "down" | "mixed" | "insufficient";
  summary: string;
  points: Array<{ label: string; value: string }>;
  evidenceRefs: string[];
};

export type CreditSummary = {
  id: number;
  snapshotId: number;
  studentId: number;
  subjectGroup: string;
  completedCredits: number | null;
  selectedCredits: number | null;
  plannedCredits: number | null;
  note: string;
  evidenceRefs: string[];
};

export type EvaluationReference = {
  id: number;
  snapshotId: number;
  studentId: number;
  sourceKey: string;
  sha256?: string;
  materialRevision?: number;
  department?: string;
  title: string;
  institution: string;
  admissionsYear: number | null;
  admissionTrack: string;
  category: string;
  note: string;
};

export type CompetencyEvaluation = {
  id: number;
  snapshotId: number;
  studentId: number;
  sourceKey: string;
  competency: string;
  score: number | null;
  scoreMethod?: { rubric: string; sourcePage: number; maximum: number };
  evidenceState?: "documented" | "partial" | "missing" | "not_applicable";
  level: string;
  summary: string;
  evidenceRefs: string[];
  strengths: string[];
  gaps: string[];
  nextActions: string[];
  caveat: string;
};

export type ViewId =
  | "guidance"
  | "planning"
  | "overview"
  | "students"
  | "records"
  | "academics"
  | "fingerprint"
  | "evaluation"
  | "wiki"
  | "import"
  | "references"
  | "guide"
  | "settings";

export const statusLabel = {
  submitted: "분석 전",
  analyzed: "검토 대기",
  approved: "승인",
  returned: "보완 필요",
  draft: "검토 대기",
} as const;

export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
      }).format(date);
}

export function splitTerms(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function statusClass(
  status: StudentActivity["status"] | Fingerprint["status"],
) {
  if (status === "approved")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "returned")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "draft" || status === "analyzed")
    return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
