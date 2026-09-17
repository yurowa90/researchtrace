import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const mediumText = z.string().trim().min(1).max(5_000);
const stringList = z.array(z.string().trim().min(1).max(200)).max(30);
const weight = z.number().int().min(1).max(100);

export const profileImportSchema = z.object({
  studentReference: z.object({ studentNumber: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(80) }).optional(),
  schemaVersion: z.enum(["1.0", "1.1", "1.2"]),
  analysisContext: z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), admissionsYear: z.number().int().min(2022).max(2100).nullable().default(null), curriculum: z.string().trim().max(150).default(""), gradingSystem: z.enum(["five", "nine", "achievement", "mixed", "unknown"]).default("unknown"), limitations: z.array(z.string().trim().max(1000)).max(30).default([]) }).optional(),
  versionLabel: z.string().trim().min(1).max(80),
  sourceYears: z.array(z.number().int().min(2022).max(2100)).min(1).max(3),
  overview: z.object({
    oneLineProfile: shortText,
    narrative: mediumText,
    strengths: stringList,
    cautions: stringList,
    coursePattern: z.string().trim().max(2_000).default(""),
  }),
  academicAnalysis: z
    .object({
      courses: z
        .array(
          z.object({
            schoolYear: z.number().int().min(2022).max(2100),
            gradeLevel: z.number().int().min(1).max(3),
            semester: z.number().int().min(1).max(2),
            subjectGroup: z.string().trim().min(1).max(100),
            subject: z.string().trim().min(1).max(150),
            courseType: z.string().trim().max(100).default(""),
            selectionStatus: z
              .enum(["completed", "selected", "planned"])
              .default("completed"),
            credits: z.number().int().min(0).max(20).nullable().default(null),
            gradingSystem: z.enum(["five", "nine", "achievement", "unknown"]).default("unknown"),
            evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
            rawScore: z.string().trim().max(40).default(""),
            achievement: z.string().trim().max(40).default(""),
            rankGrade: z.string().trim().max(40).default(""),
            classAverage: z.string().trim().max(40).default(""),
            standardDeviation: z.string().trim().max(40).default(""),
            studentCount: z.number().int().min(1).max(10_000).nullable().default(null),
            evidence: z.string().trim().max(1_500).default(""),
          }),
        )
        .max(300)
        .default([]),
      trends: z
        .array(
          z.object({
            subjectGroup: z.string().trim().min(1).max(100),
            subject: z.string().trim().max(150).default(""),
            direction: z.enum(["up", "steady", "down", "mixed", "insufficient"]),
            summary: z.string().trim().min(1).max(2_000),
            points: z
              .array(
                z.object({
                  label: z.string().trim().min(1).max(100),
                  value: z.string().trim().min(1).max(40),
                }),
              )
              .max(12),
            evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30),
          }),
        )
        .max(100)
        .default([]),
      creditSummary: z
        .array(
          z.object({
            subjectGroup: z.string().trim().min(1).max(100),
            completedCredits: z.number().int().min(0).max(200).nullable().default(null),
            selectedCredits: z.number().int().min(0).max(200).nullable().default(null),
            plannedCredits: z.number().int().min(0).max(200).nullable().default(null),
            note: z.string().trim().max(1_000).default(""),
            evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30),
          }),
        )
        .max(50)
        .default([]),
    })
    .default({ courses: [], trends: [], creditSummary: [] }),
  evaluationAnalysis: z
    .object({
      references: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(100),
            title: z.string().trim().min(1).max(300),
            institution: z.string().trim().max(150).default(""),
            admissionsYear: z.number().int().min(2022).max(2100).nullable().default(null),
            admissionTrack: z.string().trim().max(150).default(""),
            category: z.enum([
              "admission_guide",
              "evaluation_criteria",
              "preparation_guide",
              "other",
            ]),
            note: z.string().trim().max(2_000).default(""),
            sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
            materialRevision: z.number().int().positive().optional(),
            department: z.string().trim().max(300).default(""),
          }),
        )
        .max(30)
        .default([]),
      competencies: z
        .array(
          z.object({
            sourceId: z.string().trim().min(1).max(100),
            competency: z.string().trim().min(1).max(150),
            score: z.number().min(0).max(100).nullable().optional(),
            scoreMethod: z.object({ rubric: z.string().trim().min(1).max(1000), sourcePage: z.number().int().positive(), maximum: z.number().positive().max(100) }).optional(),
            evidenceState: z.enum(["documented", "partial", "missing", "not_applicable"]).default("partial"),
            level: z.string().trim().min(1).max(80),
            summary: z.string().trim().min(1).max(2_000),
            evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30),
            strengths: stringList,
            gaps: stringList,
            nextActions: stringList,
            caveat: z.string().trim().max(1_000).default(""),
          }),
        )
        .max(150)
        .default([]),
    })
    .default({ references: [], competencies: [] }),
  sections: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        sourceState: z.enum(["recorded", "self_report", "interpretation", "planned", "unknown", "not_applicable"]).default("unknown"),
        recordId: z.number().int().positive().nullable().default(null),
        page: z.number().int().positive().max(10000).nullable().default(null),
        sourceLocation: z.string().trim().max(1000).default(""),
        type: z.enum([
          "creative_activity",
          "subject_detail",
          "course_selection",
          "reading",
          "career",
          "other",
        ]),
        schoolYear: z.number().int().min(2022).max(2100),
        subject: z.string().trim().max(100).default(""),
        title: shortText,
        summary: mediumText,
        evidence: z.array(z.string().trim().min(1).max(1_500)).max(20),
        keywords: stringList,
        competencies: stringList,
      }),
    )
    .max(300),
  researchFingerprint: z
    .array(
      z.object({
        keyword: z.string().trim().min(1).max(100),
        category: z.enum([
          "concept",
          "method",
          "question",
          "competency",
          "career",
          "subject",
        ]),
        weight,
        description: z.string().trim().min(1).max(2_000),
        evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30),
      }),
    )
    .max(100),
  ontology: z.object({
    nodes: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          type: z.enum([
            "concept",
            "activity",
            "question",
            "method",
            "subject",
            "career",
            "reading",
            "competency",
          ]),
          label: z.string().trim().min(1).max(150),
          description: z.string().trim().max(2_000).default(""),
          weight,
          evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30),
        }),
      )
      .max(250),
    edges: z
      .array(
        z.object({
          source: z.string().trim().min(1).max(100),
          target: z.string().trim().min(1).max(100),
          evidenceRefs: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
          sourceState: z.enum(["recorded", "interpretation", "unknown"]).default("interpretation"),
          relation: z.string().trim().min(1).max(100),
          description: z.string().trim().max(1_000).default(""),
          weight,
        }),
      )
      .max(500),
  }),
  wikiPages: z
    .array(
      z.object({
        slug: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9가-힣-]+$/u),
        type: z.enum([
          "overview",
          "concept",
          "inquiry",
          "subject",
          "career",
          "method",
        ]),
        title: shortText,
        summary: z.string().trim().min(1).max(1_000),
        bodyMarkdown: z.string().trim().min(1).max(30_000),
        keywords: stringList,
        linkedNodeIds: z.array(z.string().trim().min(1).max(100)).max(50),
      }),
    )
    .max(100),
});

export type ProfileImport = z.infer<typeof profileImportSchema>;

export const profileImportExample: ProfileImport = profileImportSchema.parse({
  schemaVersion: "1.2",
  analysisContext: { asOf: "2026-09-17", admissionsYear: null, curriculum: "", gradingSystem: "unknown", limitations: ["가상 형식 예시입니다. 실제 학생의 원문과 적용 자료를 확인해 작성하세요."] },
  versionLabel: "2026-09-16-v1",
  sourceYears: [2025],
  overview: {
    oneLineProfile:
      "생명 현상을 데이터와 윤리의 관점에서 함께 해석하는 탐구자",
    narrative:
      "통합과학의 자연선택 학습에서 시작한 질문을 생명과학의 유전과 생명윤리 문제로 확장하였다. 수치 자료를 비교하고 해석의 한계를 기록하는 활동이 반복적으로 나타난다.",
    strengths: ["근거 기반 해석", "교과 간 연결", "후속 질문 생성"],
    cautions: ["장기 탐구의 실증 자료 보강 필요"],
    coursePattern:
      "통합과학 이후 생명과학·수학 교과를 연결해 데이터 기반 생명과학 탐구를 확장하는 선택 흐름",
  },
  academicAnalysis: {
    courses: [
      {
        schoolYear: 2025,
        gradeLevel: 1,
        semester: 1,
        subjectGroup: "과학",
        subject: "통합과학 1",
        courseType: "공통",
        selectionStatus: "completed",
        credits: 4,
        rawScore: "88",
        achievement: "A",
        rankGrade: "2",
        classAverage: "72.4",
        standardDeviation: "12.1",
        studentCount: 210,
        evidence: "1학년 1학기 교과학습발달상황",
      },
      {
        schoolYear: 2025,
        gradeLevel: 1,
        semester: 2,
        subjectGroup: "과학",
        subject: "통합과학 2",
        courseType: "공통",
        selectionStatus: "completed",
        credits: 4,
        rawScore: "93",
        achievement: "A",
        rankGrade: "1",
        classAverage: "74.8",
        standardDeviation: "11.5",
        studentCount: 208,
        evidence: "1학년 2학기 교과학습발달상황",
      },
    ],
    trends: [
      {
        subjectGroup: "과학",
        subject: "통합과학",
        direction: "up",
        summary: "원점수와 석차등급이 함께 상승했으며 세특의 자료 해석 활동도 심화됨",
        points: [
          { label: "1-1", value: "88점 / 2등급" },
          { label: "1-2", value: "93점 / 1등급" },
        ],
        evidenceRefs: ["s1"],
      },
    ],
    creditSummary: [
      {
        subjectGroup: "과학",
        completedCredits: 8,
        selectedCredits: 0,
        plannedCredits: 0,
        note: "1학년 통합과학 이수 완료",
        evidenceRefs: ["s1"],
      },
    ],
  },
  evaluationAnalysis: {
    references: [
      {
        id: "snu-2027-general",
        title: "2027학년도 학생부종합전형 안내 및 평가 요소",
        institution: "예시대학교",
        admissionsYear: 2027,
        admissionTrack: "학생부종합 일반전형",
        category: "evaluation_criteria",
        note: "사용자가 Work에 제공한 평가 기준을 구조화한 예시",
      },
    ],
    competencies: [
      {
        sourceId: "snu-2027-general",
        competency: "학업역량 — 탐구력",
        score: null,
        evidenceState: "partial",
        level: "근거 충분",
        summary: "자료를 비교하고 해석의 한계를 적는 활동이 여러 교과에서 반복됨",
        evidenceRefs: ["s1"],
        strengths: ["그래프 비교", "한계 인식", "후속 질문 생성"],
        gaps: ["장기 탐구의 실증 자료 부족"],
        nextActions: ["동일 주제로 변인을 통제한 후속 실험 설계"],
        caveat: "공개된 평가 자료를 바탕으로 한 준비 점검이며 실제 대학 평가를 예측하지 않음",
      },
    ],
  },
  sections: [
    {
      id: "s1",
      type: "subject_detail",
      schoolYear: 2025,
      subject: "통합과학",
      title: "항생제 내성과 자연선택",
      summary:
        "세균 집단의 내성 비율 변화를 자연선택으로 설명하고 자료만으로 단정하기 어려운 한계를 제시하였다.",
      evidence: [
        "항생제 사용 전후 세균 집단의 내성 비율 그래프를 비교함",
      ],
      keywords: ["자연선택", "항생제 내성", "변이"],
      competencies: ["자료 해석", "비판적 검토"],
    },
  ],
  researchFingerprint: [
    {
      keyword: "자연선택",
      category: "concept",
      weight: 92,
      description:
        "집단 수준의 형질 변화와 환경 선택압의 관계를 반복적으로 탐구함",
      evidenceRefs: ["s1"],
    },
  ],
  ontology: {
    nodes: [
      {
        id: "concept-natural-selection",
        type: "concept",
        label: "자연선택",
        description: "환경과 집단의 형질 비율 변화를 연결하는 중심 개념",
        weight: 92,
        evidenceRefs: ["s1"],
      },
      {
        id: "activity-antibiotic",
        type: "activity",
        label: "항생제 내성 탐구",
        description: "통합과학 세부능력 및 특기사항의 자료 분석 활동",
        weight: 80,
        evidenceRefs: ["s1"],
      },
    ],
    edges: [
      {
        source: "activity-antibiotic",
        target: "concept-natural-selection",
        relation: "개념을 적용함",
        description: "내성 비율 변화를 자연선택으로 해석함",
        weight: 90,
      },
    ],
  },
  wikiPages: [
    {
      slug: "자연선택-탐구",
      type: "concept",
      title: "자연선택 탐구의 발전",
      summary:
        "통합과학에서 시작된 자연선택 질문이 생명과학 탐구로 확장되는 과정",
      bodyMarkdown:
        "# 출발점\n항생제 사용 전후 내성 비율 그래프를 비교하였다.\n\n# 남은 질문\n선택압의 강도에 따라 집단의 형질 비율은 어떤 속도로 달라지는가?",
      keywords: ["자연선택", "항생제 내성"],
      linkedNodeIds: ["concept-natural-selection", "activity-antibiotic"],
    },
  ],
});
