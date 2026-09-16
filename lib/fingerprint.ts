type WeightedTerm = { term: string; count: number };

const stopWords = new Set(
  "그리고 그러나 그래서 대한 통해 위해 있는 없는 하는 했다 대해 결과 활동 탐구 연구 자료 학생 생각 이번 이를 것은 것을 수가 에서 으로 로서 따라 관련 바탕 실제 사용 활용 과정 내용 경우 가지 대한 이후 또한 보다 매우 가장 서로 직접 해당 우리 자신 작성 확인 제시 설명 분석 비교 실험 교과 수업 보고서 발표 결론 문제 방법 목적 이유 의미 필요 통해 관한 중에서 그에 대하여 위하여 하였다 되었다 있었다 있었다".split(
    /\s+/,
  ),
);

const methodPatterns: Array<[string, RegExp]> = [
  ["문헌 조사", /논문|문헌|선행\s*연구|학술/],
  ["실험", /실험|변인|대조군|처리군|반복\s*측정/],
  ["관찰", /관찰|현미경|관측|기록/],
  ["데이터 분석", /데이터|통계|상관|회귀|분포|평균|표준편차/],
  ["비교 분석", /비교|대조|차이|공통점/],
  ["모델링", /모델|모형|시뮬레이션|예측/],
  ["설문·면담", /설문|인터뷰|면담|응답자/],
  ["토론·논증", /토론|주장|반론|근거|논증/],
];

const evidencePatterns: Array<[string, RegExp]> = [
  ["수치 데이터", /수치|측정값|통계|백분율|평균|그래프/],
  ["실험 결과", /실험\s*결과|대조군|처리군|관찰\s*결과/],
  ["학술 자료", /논문|학술|연구진|저널/],
  ["공공 데이터", /공공기관|통계청|질병관리청|환경부|교육부|KOSIS/],
  ["사례", /사례|사건|현장|예시/],
  ["표·그래프", /표|그래프|도표|시각화/],
];

const subjectPatterns: Array<[string, RegExp]> = [
  ["생명과학", /세포|유전|생태|진화|단백질|효소|질병|면역|생명/],
  ["화학", /원자|분자|결합|반응|산화|환원|용액|화학/],
  ["물리학", /힘|운동|에너지|전자기|파동|빛|물리/],
  ["지구과학", /기후|대기|해양|지질|우주|지구/],
  ["수학·통계", /함수|확률|통계|수학|상관|회귀|그래프/],
  ["사회·윤리", /정책|사회|윤리|불평등|법|경제|공정/],
  ["인문·언어", /철학|문학|서사|언어|역사|인간/],
  ["공학·기술", /인공지능|알고리즘|설계|공학|기술|센서|로봇/],
];

function uniqMatches(text: string, patterns: Array<[string, RegExp]>) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function extractKeywords(text: string): WeightedTerm[] {
  const normalized = text
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const counts = new Map<string, number>();
  for (const raw of normalized.split(" ")) {
    const term = raw.replace(/(으로|에서|에게|까지|부터|보다|처럼|하고|하며|하여|했다|한다|이다|이며|적인|하게|하기|들의|에는|과의|와의|을|를|은|는|이|가|에|의)$/u, "");
    if (term.length < 2 || stopWords.has(term) || /^\d+$/.test(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length)
    .slice(0, 10);
}

export function analyzeActivityText(title: string, rawText: string) {
  const text = `${title} ${rawText}`;
  const keywords = extractKeywords(text);
  const methods = uniqMatches(text, methodPatterns);
  const evidence = uniqMatches(text, evidencePatterns);
  const subjectLinks = uniqMatches(text, subjectPatterns);
  const competencies: string[] = [];

  if (methods.length > 0) competencies.push("탐구 방법 설계");
  if (evidence.length > 0) competencies.push("근거 기반 해석");
  if (/한계|오류|반론|예외|비판|재검토/.test(text)) competencies.push("비판적 검토");
  if (/질문|의문|궁금|왜|어떻게/.test(text)) competencies.push("질문 생성");
  if (subjectLinks.length >= 2) competencies.push("교과 간 연결");
  if (/수정|개선|다시|후속|확장/.test(text)) competencies.push("탐구 개선");
  if (competencies.length === 0) competencies.push("개념 이해와 설명");

  const sentences = rawText
    .split(/(?<=[.!?]|다\.)\s+|\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const summarySource = sentences.slice(0, 2).join(" ") || rawText;
  const summary = summarySource.length > 210
    ? `${summarySource.slice(0, 207).trim()}…`
    : summarySource;

  const first = keywords[0]?.term ?? "핵심 개념";
  const second = keywords[1]?.term ?? "활동 결과";
  const questions = [
    `${first}와 ${second}의 관계를 어떤 자료로 검증할 수 있는가?`,
    `이 활동의 조건이나 대상을 바꾸면 결과는 어떻게 달라지는가?`,
    `현재 해석과 다른 결론을 지지하는 반례나 대안 설명은 무엇인가?`,
  ];

  return {
    summary,
    keywords: keywords.map(({ term }) => term),
    methods,
    evidence,
    competencies,
    questions,
    subjectLinks,
  };
}
