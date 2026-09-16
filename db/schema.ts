import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = text("created_at")
  .notNull()
  .default(sql`(CURRENT_TIMESTAMP)`);

// Server connection settings only. Never export this table to Sheets or clients.
export const storageConnection = sqliteTable("storage_connection", {
  id: integer("id").primaryKey(),
  state: text("state", { enum: ["legacy", "migrating", "google"] }).notNull().default("legacy"),
  endpoint: text("endpoint").notNull().default(""),
  secret: text("secret").notNull(),
  ownerAuthUserId: text("owner_auth_user_id").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authUserId: text("auth_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "teacher", "student"] })
      .notNull()
      .default("student"),
    status: text("status", { enum: ["pending", "approved", "suspended"] })
      .notNull()
      .default("pending"),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_users_auth_user_id").on(table.authUserId),
    uniqueIndex("idx_users_email").on(table.email),
    index("idx_users_status_role").on(table.status, table.role),
  ],
);

export const classes = sqliteTable(
  "classes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    grade: integer("grade").notNull().default(1),
    schoolYear: integer("school_year").notNull().default(2026),
    inviteCode: text("invite_code").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_classes_invite_code").on(table.inviteCode),
    index("idx_classes_teacher_id").on(table.teacherId),
  ],
);

export const students = sqliteTable(
  "students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    studentNumber: text("student_number").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    status: text("status", { enum: ["active", "graduated", "archived"] })
      .notNull()
      .default("active"),
    graduatedYear: integer("graduated_year"),
    graduatedAt: text("graduated_at"),
    isExample: integer("is_example", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_students_class_number").on(
      table.classId,
      table.studentNumber,
    ),
    index("idx_students_user_id").on(table.userId),
    index("idx_students_class_status").on(table.classId, table.status),
  ],
);

export const subjects = sqliteTable(
  "subjects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#2457d6"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_subjects_class_name").on(table.classId, table.name),
    index("idx_subjects_class_order").on(table.classId, table.sortOrder),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    activityType: text("activity_type").notNull(),
    activityDate: text("activity_date").notNull(),
    rawText: text("raw_text").notNull(),
    sourceNote: text("source_note").notNull().default(""),
    status: text("status", {
      enum: ["submitted", "analyzed", "approved", "returned"],
    })
      .notNull()
      .default("submitted"),
    createdAt,
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("idx_activities_student_date").on(
      table.studentId,
      table.activityDate,
    ),
    index("idx_activities_subject_status").on(
      table.subjectId,
      table.status,
    ),
  ],
);

export const fingerprints = sqliteTable(
  "fingerprints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    methodsJson: text("methods_json").notNull().default("[]"),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    competenciesJson: text("competencies_json").notNull().default("[]"),
    questionsJson: text("questions_json").notNull().default("[]"),
    subjectLinksJson: text("subject_links_json").notNull().default("[]"),
    status: text("status", { enum: ["draft", "approved", "returned"] })
      .notNull()
      .default("draft"),
    approvedBy: integer("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    createdAt,
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("idx_fingerprints_activity").on(table.activityId),
    index("idx_fingerprints_student_status").on(
      table.studentId,
      table.status,
    ),
  ],
);

export const activityFiles = sqliteTable(
  "activity_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_activity_files_object_key").on(table.objectKey),
    index("idx_activity_files_activity_id").on(table.activityId),
  ],
);

export const inquiryThreads = sqliteTable(
  "inquiry_threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    focusQuestion: text("focus_question").notNull(),
    status: text("status", { enum: ["developing", "active", "complete"] })
      .notNull()
      .default("developing"),
    createdAt,
  },
  (table) => [index("idx_inquiry_threads_student").on(table.studentId)],
);

export const threadActivities = sqliteTable(
  "thread_activities",
  {
    threadId: integer("thread_id")
      .notNull()
      .references(() => inquiryThreads.id, { onDelete: "cascade" }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_thread_activities_pair").on(
      table.threadId,
      table.activityId,
    ),
  ],
);

export const studentRecords = sqliteTable(
  "student_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    schoolYear: integer("school_year").notNull(),
    recordGrade: integer("record_grade").notNull(),
    coverageJson: text("coverage_json").notNull().default("[]"),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    processingStatus: text("processing_status", {
      enum: ["source_only", "reflected"],
    })
      .notNull()
      .default("source_only"),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_student_records_object_key").on(table.objectKey),
    index("idx_student_records_student_grade").on(
      table.studentId,
      table.recordGrade,
    ),
  ],
);

export const referenceMaterials = sqliteTable("reference_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  institution: text("institution").notNull().default(""),
  admissionsYear: integer("admissions_year"),
  admissionTrack: text("admission_track").notNull().default(""),
  category: text("category", { enum: ["admission_guide", "evaluation_criteria", "preparation_guide", "other"] }).notNull(),
  note: text("note").notNull().default(""),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  createdAt,
}, (table) => [uniqueIndex("idx_reference_materials_key").on(table.objectKey), index("idx_reference_materials_status_year").on(table.status, table.admissionsYear)]);

export const referenceSelections = sqliteTable("reference_selections", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  materialIdsJson: text("material_ids_json").notNull().default("[]"),
});

export const profileSnapshots = sqliteTable(
  "profile_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    versionLabel: text("version_label").notNull(),
    schemaVersion: text("schema_version").notNull().default("1.0"),
    oneLineProfile: text("one_line_profile").notNull(),
    narrative: text("narrative").notNull(),
    strengthsJson: text("strengths_json").notNull().default("[]"),
    cautionsJson: text("cautions_json").notNull().default("[]"),
    coursePattern: text("course_pattern").notNull().default(""),
    sourceYearsJson: text("source_years_json").notNull().default("[]"),
    rawJson: text("raw_json").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt,
  },
  (table) => [
    index("idx_profile_snapshots_student_active").on(
      table.studentId,
      table.isActive,
    ),
    uniqueIndex("idx_profile_snapshots_student_version").on(
      table.studentId,
      table.versionLabel,
    ),
  ],
);

export const profileSections = sqliteTable(
  "profile_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sectionType: text("section_type").notNull(),
    schoolYear: integer("school_year").notNull(),
    subject: text("subject").notNull().default(""),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    evidenceText: text("evidence_text").notNull().default(""),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    competenciesJson: text("competencies_json").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("idx_profile_sections_snapshot_order").on(
      table.snapshotId,
      table.sortOrder,
    ),
    index("idx_profile_sections_student_type").on(
      table.studentId,
      table.sectionType,
    ),
  ],
);

export const researchKeywords = sqliteTable(
  "research_keywords",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    weight: integer("weight").notNull().default(50),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    createdAt,
  },
  (table) => [
    index("idx_research_keywords_student_weight").on(
      table.studentId,
      table.weight,
    ),
    index("idx_research_keywords_snapshot").on(table.snapshotId),
  ],
);

export const ontologyNodes = sqliteTable(
  "ontology_nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    nodeType: text("node_type").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    weight: integer("weight").notNull().default(50),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_ontology_nodes_snapshot_key").on(
      table.snapshotId,
      table.nodeKey,
    ),
    index("idx_ontology_nodes_student_type").on(
      table.studentId,
      table.nodeType,
    ),
  ],
);

export const ontologyEdges = sqliteTable(
  "ontology_edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    targetKey: text("target_key").notNull(),
    relation: text("relation").notNull(),
    description: text("description").notNull().default(""),
    weight: integer("weight").notNull().default(50),
    createdAt,
  },
  (table) => [
    index("idx_ontology_edges_snapshot").on(table.snapshotId),
    index("idx_ontology_edges_student_relation").on(
      table.studentId,
      table.relation,
    ),
  ],
);

export const wikiPages = sqliteTable(
  "wiki_pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    pageType: text("page_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    linkedNodeKeysJson: text("linked_node_keys_json").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_wiki_pages_snapshot_slug").on(
      table.snapshotId,
      table.slug,
    ),
    index("idx_wiki_pages_student_order").on(
      table.studentId,
      table.sortOrder,
    ),
  ],
);

export const academicCourseRecords = sqliteTable(
  "academic_course_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolYear: integer("school_year").notNull(),
    gradeLevel: integer("grade_level").notNull(),
    semester: integer("semester").notNull(),
    subjectGroup: text("subject_group").notNull(),
    subject: text("subject").notNull(),
    courseType: text("course_type").notNull().default(""),
    selectionStatus: text("selection_status", {
      enum: ["completed", "selected", "planned"],
    })
      .notNull()
      .default("completed"),
    credits: integer("credits").notNull().default(0),
    rawScore: text("raw_score").notNull().default(""),
    achievement: text("achievement").notNull().default(""),
    rankGrade: text("rank_grade").notNull().default(""),
    classAverage: text("class_average").notNull().default(""),
    standardDeviation: text("standard_deviation").notNull().default(""),
    studentCount: integer("student_count"),
    evidenceText: text("evidence_text").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("idx_academic_course_student_term").on(
      table.studentId,
      table.gradeLevel,
      table.semester,
    ),
    index("idx_academic_course_snapshot_group").on(
      table.snapshotId,
      table.subjectGroup,
    ),
  ],
);

export const academicTrends = sqliteTable(
  "academic_trends",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectGroup: text("subject_group").notNull(),
    subject: text("subject").notNull().default(""),
    direction: text("direction", {
      enum: ["up", "steady", "down", "mixed", "insufficient"],
    })
      .notNull()
      .default("insufficient"),
    summary: text("summary").notNull(),
    pointsJson: text("points_json").notNull().default("[]"),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    createdAt,
  },
  (table) => [
    index("idx_academic_trends_student_group").on(
      table.studentId,
      table.subjectGroup,
    ),
    index("idx_academic_trends_snapshot").on(table.snapshotId),
  ],
);

export const creditSummaries = sqliteTable(
  "credit_summaries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectGroup: text("subject_group").notNull(),
    completedCredits: integer("completed_credits").notNull().default(0),
    selectedCredits: integer("selected_credits").notNull().default(0),
    plannedCredits: integer("planned_credits").notNull().default(0),
    note: text("note").notNull().default(""),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_credit_summaries_snapshot_group").on(
      table.snapshotId,
      table.subjectGroup,
    ),
    index("idx_credit_summaries_student").on(table.studentId),
  ],
);

export const evaluationReferences = sqliteTable(
  "evaluation_references",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    title: text("title").notNull(),
    institution: text("institution").notNull().default(""),
    admissionsYear: integer("admissions_year"),
    admissionTrack: text("admission_track").notNull().default(""),
    category: text("category", {
      enum: ["admission_guide", "evaluation_criteria", "preparation_guide", "other"],
    })
      .notNull()
      .default("other"),
    note: text("note").notNull().default(""),
    createdAt,
  },
  (table) => [
    uniqueIndex("idx_evaluation_references_snapshot_key").on(
      table.snapshotId,
      table.sourceKey,
    ),
    index("idx_evaluation_references_student").on(table.studentId),
  ],
);

export const competencyEvaluations = sqliteTable(
  "competency_evaluations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => profileSnapshots.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    competency: text("competency").notNull(),
    score: integer("score").notNull().default(50),
    level: text("level").notNull(),
    summary: text("summary").notNull(),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    strengthsJson: text("strengths_json").notNull().default("[]"),
    gapsJson: text("gaps_json").notNull().default("[]"),
    nextActionsJson: text("next_actions_json").notNull().default("[]"),
    caveat: text("caveat").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("idx_competency_evaluations_student_score").on(
      table.studentId,
      table.score,
    ),
    index("idx_competency_evaluations_snapshot_source").on(
      table.snapshotId,
      table.sourceKey,
    ),
  ],
);
