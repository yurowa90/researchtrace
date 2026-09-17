"use client";

import { ArrowRight, BookOpenText, CheckCircle2, Download, FileJson, FileText, Users } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PortalData, Student, ViewId } from "@/lib/portal-types";
import { studentReadiness } from "@/lib/portal-workflow";

type GuideProps = { data: PortalData; students: Student[]; onNavigate: (view: ViewId) => void; onAddClass: () => void; onAddStudents: () => void };

export function QuickStart({ data, students, onNavigate, onAddClass, onAddStudents }: GuideProps) {
  if (data.viewer.role === "student") return null;
  const real = students.filter((student) => !student.isExample && student.status === "active");
  const ready = real.filter((student) => !studentReadiness(data, student).missingGrades.length).length;
  const analyzed = real.filter((student) => studentReadiness(data, student).profile).length;
  const steps = [
    { title: "학급 확인", detail: `${data.classes.length}개 학급`, done: data.classes.length > 0, action: onAddClass, button: "학급 추가" },
    { title: "학생 등록", detail: `실제 재학생 ${real.length}명`, done: real.length > 0, action: onAddStudents, button: "학생 일괄 등록" },
    { title: "학생부 원본", detail: `${ready}/${real.length}명 원본 준비`, done: real.length > 0 && ready === real.length, action: () => onNavigate("records"), button: "원본 등록" },
    { title: "Work 결과", detail: `${analyzed}/${real.length}명 프로필 반영`, done: real.length > 0 && analyzed === real.length, action: () => onNavigate("import"), button: "결과 가져오기" },
  ];
  return <section className="mb-6 rounded-2xl border border-[#cddbec] bg-white p-4 sm:p-5" aria-label="처음 시작과 진행 상태">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-[#17345e]">시작하기 · 현재 선택한 범위</h2><Button size="sm" variant="ghost" onClick={() => onNavigate("guide")}><BookOpenText />사용 안내</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{steps.map((step, index) => <div key={step.title} className="rounded-xl bg-[#f4f7fb] p-4"><div className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173a73] text-xs text-white">{index + 1}</span><p className="text-sm font-semibold">{step.title}</p>{step.done && <CheckCircle2 className="ml-auto size-4 text-emerald-700" aria-label="완료" />}</div><p className="mt-2 text-sm text-[#62748b]">{step.detail}</p><Button size="sm" variant="outline" className="mt-3 bg-white" onClick={step.action}>{step.button}<ArrowRight /></Button></div>)}</div>
    <p className="mt-3 text-sm text-[#6b7c92]">AI 분석은 Work에서 수행합니다. 예시 학생과 졸업생은 위 진행 수에서 제외됩니다.</p>
  </section>;
}

export function UsageGuide({ data, students, onNavigate, onAddClass, onAddStudents }: GuideProps) {
  const staff = data.viewer.role !== "student";
  const admin = data.viewer.role === "admin";
  const steps = staff ? [
    { title: "학급을 준비합니다", text: "학교 설정에서 학급명·학년도·현재 학년(2·3학년)을 등록합니다. 관리자는 승인된 교사를 담당자로 배정할 수 있습니다.", button: "학교 설정", view: "settings" as ViewId, icon: Users },
    { title: "학생 명단을 한 번에 등록합니다", text: "엑셀 양식의 학생등록 시트에 학번·이름·이메일을 입력하거나, 엑셀 세 열을 복사해 붙여넣습니다. 대상 학급과 오류 행을 확인하고 등록합니다.", button: "학생 일괄 등록", action: onAddStudents, icon: Users },
    { title: "학생부 원본을 보관합니다", text: "2학년은 1학년, 3학년은 1·2학년 학생부를 기본으로 등록합니다. 현재 학년 내용이 있으면 추가하고, 한 파일에 여러 학년이 들어 있으면 모두 선택합니다. ‘여러 원본 등록’에서 최대 50개를 선택하면 파일명의 학번·이름으로 학생을 제안합니다. 저장 전 각 파일의 대상 학생과 포함 학년을 확인하세요. 학년도는 학급 정보를 기준으로 제안되므로 유급·전입 등 이력이 있으면 직접 수정합니다.", button: "학생부 원본", view: "records" as ViewId, icon: FileText },
    { title: "Work에서 분석합니다", text: "Work 결과 메뉴의 ‘Work 자료 묶음 받기’로 학생 원본·요청문·JSON 예시·선택한 공용 자료를 함께 받습니다. 공용 평가 자료실에서 관리자가 등록한 모집요강·평가 기준을 선택해 저장합니다. 자료 묶음을 한 번 받아 Work에서 재사용하고, 학생별로 학생부와 요청문을 제공합니다. 사이트 원본은 Work로 자동 전송되지 않습니다.", button: "Work 결과", view: "import" as ViewId, icon: FileJson },
    { title: "결과를 확인하고 저장합니다", text: "Work가 만든 JSON 파일을 선택하거나 결과를 붙여넣고 ‘검증·미리보기’를 누릅니다. 대상 학생·버전명·근거·교과·키워드 수를 확인한 뒤 저장합니다. 기존 버전은 이력으로 남습니다.", button: "결과 가져오기", view: "import" as ViewId, icon: FileJson },
    { title: "다음 행동과 피드백을 관리합니다", text: "질문·실행 결과·관찰을 남기고, 제출된 결과에 보완 요청 또는 확인 완료를 기록합니다. 학생 자기보고와 교사 해석을 구분하며 수정 이력은 보존합니다. 진학·과목 계획에서 방향·진로·학기·당장 할 일 목표를 함께 정합니다.", button: "다음 행동·피드백", view: "guidance" as ViewId, icon: BookOpenText },
    { title: "상담과 누적 관리에 활용합니다", text: "연구지문은 개념·활동 연결, 교과·성적은 과목 선택과 변화, 역량 점검은 제공한 평가 기준별 근거를 보여줍니다. 새 활동을 반영할 때에는 Work에서 새 버전을 만들어 가져옵니다.", button: "학생 프로필", view: "students" as ViewId, icon: BookOpenText },
  ] : [
    { title: "본인 계정 연결을 확인합니다", text: "학교에 등록한 계정으로 로그인합니다. 처음 로그인하거나 새 학생 사이트를 사용하면 관리자의 계정 승인이 필요할 수 있습니다. 이메일이 같아도 새 사이트의 로그인은 자동으로 연결되지 않습니다. 승인 대기이거나 본인 자료가 보이지 않으면 담임에게 계정 연결 상태를 확인받습니다.", button: "내 현황", view: "overview" as ViewId, icon: Users },
    { title: "질문과 다음 행동을 남깁니다", text: "질문 한 문장부터 시작하고 실행한 결과를 제출합니다. 읽은 내용을 자신의 말로 설명하거나 학습 루틴·기여한 일을 기록할 수 있습니다. 피드백을 받은 뒤 수정하면 이전 기록과 함께 남습니다.", button: "다음 행동·피드백", view: "guidance" as ViewId, icon: BookOpenText },
    { title: "진학과 과목 계획을 세웁니다", text: "지원 희망과 네 단계 목표, 선택하고 싶은 과목을 저장합니다. 계획한 과목은 실제 이수학점과 구분되며, 교사가 연결한 평가 자료의 적용 범위를 확인할 수 있습니다.", button: "진학·과목 계획", view: "planning" as ViewId, icon: BookOpenText },
    { title: "내 연구 흐름을 읽습니다", text: "연구지문에서 반복되는 관심과 탐구 질문을 보고, LLM 위키에서 개념·교과·활동의 연결을 확인합니다. 표시되지 않는 내용은 아직 교사가 분석 결과를 반영하지 않은 것일 수 있습니다.", button: "연구지문", view: "fingerprint" as ViewId, icon: BookOpenText },
    { title: "근거와 원본을 대조합니다", text: "교과·성적과 역량 점검은 원본에 근거한 참고 자료입니다. 잘못된 내용은 담임에게 정정을 요청합니다. ‘정정 요청’으로 원문 위치와 이유를 남기면 담임이 검토합니다. 원본과 분석 결과의 교체는 교사가 처리합니다.", button: "교과·성적", view: "academics" as ViewId, icon: FileText },
  ];
  return <div className="space-y-6">
    <div><Badge variant="outline">{admin ? "학교 관리자" : staff ? "학급 담임" : "학생"} 안내</Badge><h1 className="mt-3 text-3xl font-bold tracking-tight">사용 순서와 자주 막히는 부분</h1><p className="mt-3 text-base leading-7 text-[#65768b]">자료 등록 → Work 분석 → 결과 검토 → 학생별 열람 순서로 사용합니다.</p></div>
    {staff && <QuickStart data={data} students={students} onNavigate={onNavigate} onAddClass={onAddClass} onAddStudents={onAddStudents} />}
    {admin && <section className="rounded-2xl border border-[#c5d5e7] bg-white p-5"><h2 className="font-bold">새 사이트의 계정을 기존 학교 계정에 연결하기</h2><p className="mt-3 text-base leading-7 text-[#596d85]">학교 설정 → 공통 계정 연결에서 요청자를 확인합니다. 본인 확인 후 기존 학교 계정을 선택하고 확인 근거를 입력해 연결합니다. 연결 해제 시 해당 사이트의 접근이 차단되며 학생 기록은 유지됩니다. 승인·거절·해제는 처리 이력에 남습니다.</p><p className="mt-2 text-sm leading-6 text-[#65768b]">현재는 통합 사이트를 사용합니다. 학생·교사·관리자 사이트가 추가되면 각 사이트에서 로그인하고 한 번씩 연결 승인을 받습니다. 처음 학교에 등록하는 계정의 역할 승인은 ‘승인 대기 계정’에서 처리합니다.</p><Button variant="outline" className="mt-4" onClick={()=>onNavigate("settings")}>공통 계정 연결 열기</Button></section>}
    {admin && <section className="rounded-2xl border border-[#c5d5e7] bg-white p-5"><h2 className="font-bold">사이트 분리 전 자료 점검과 백업</h2><p className="mt-3 text-base leading-7 text-[#596d85]">학교 설정에서 ‘자료 연결 점검하기’를 누르면 중복 계정·끊어진 자료 연결을 확인할 수 있습니다. 이어서 ‘전체 백업 받기’를 누르면 분석 이력과 등록 원본을 ZIP으로 내려받습니다. 받은 파일은 ‘백업 파일 검증’으로 다시 확인할 수 있습니다.</p><p className="mt-2 text-sm leading-6 text-[#65768b]">구글 이전 전에도 사용할 수 있습니다. 점검 결과 JSON과 원본 포함 백업 ZIP은 서로 다른 파일입니다.</p><Button variant="outline" className="mt-4" onClick={()=>onNavigate("settings")}>자료 점검·백업 열기</Button></section>}
    <div className="grid gap-4 lg:grid-cols-2">{steps.map((step, index) => <Card key={step.title} className="border-[#dfe6ef]"><CardContent className="p-5"><div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#173a73] text-sm font-bold text-white">{index + 1}</span><h2 className="font-bold">{step.title}</h2></div><p className="mt-4 text-base leading-7 text-[#596d85]">{step.text}</p><Button variant="outline" className="mt-4" onClick={() => "action" in step && step.action ? step.action() : step.view && onNavigate(step.view)}><step.icon />{step.button}</Button></CardContent></Card>)}</div>
    <section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="font-bold">성적과 활동을 함께 읽는 방법</h2><div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="font-semibold">교과·성적 → 성적 추이</h3><p className="mt-2 text-base leading-7 text-[#596d85]">원점수 또는 확인된 등급제를 선택하고, 교과군·개별 과목별 꺾은선으로 학기별 흐름을 봅니다. 아래에서 학기를 선택하면 평균에 들어간 과목과 근거가 나옵니다. 학점 가중 평균은 양수 학점이 확인된 과목만 사용합니다.</p><Button className="mt-3" variant="outline" onClick={()=>onNavigate("academics")}>성적 추이 열기</Button></div><div><h3 className="font-semibold">활동 모아보기</h3><p className="mt-2 text-base leading-7 text-[#596d85]">영역별·학년도별·교과별로 묶고, 학년도·학생부 영역·근거 상태로 좁혀 읽습니다. 활동을 누르면 근거 문장과 원문 위치가 나옵니다. 키워드를 누르면 같은 관심이 이어지는 다른 활동을 찾을 수 있습니다.</p><Button className="mt-3" variant="outline" onClick={()=>onNavigate("activityReview")}>활동 모아보기 열기</Button></div></div><p className="mt-4 border-t pt-4 text-sm leading-6 text-[#65768b]">최신 활성 분석에 포함된 모든 학년도 자료를 보여 줍니다. 빈 성적은 0점으로 처리하지 않고, 5등급제와 9등급제를 환산하지 않습니다.</p></section>
    {staff && <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><a href="/templates/trace-student-bulk-template.xlsx" download><Download />학생 등록 엑셀</a></Button><Button asChild variant="outline"><a href="/api/profile-template"><Download />Work 결과 JSON 예시</a></Button></div>}
    <section className="rounded-2xl border border-[#dfe6ef] bg-white px-5"><h2 className="pt-5 font-bold">자주 막히는 부분</h2><Accordion type="single" collapsible>
      <AccordionItem value="access"><AccordionTrigger>명단에 학생을 등록했는데 사이트에 접속하지 못합니다.</AccordionTrigger><AccordionContent className="text-base leading-7 text-[#596d85]">학생 명단 등록, 사이트 공유 허용, 학생 계정 연결은 서로 다른 절차입니다. 사이트 소유자가 공유 설정에서 대상자의 접근을 허용해야 하며, 사이트 안에서는 등록 이메일과 로그인 이메일이 일치해야 합니다. 엑셀 등록은 초대 메일 발송이나 사이트 공유 범위 변경을 하지 않습니다.</AccordionContent></AccordionItem>
      <AccordionItem value="analysis"><AccordionTrigger>학생부를 올렸는데 분석이 나오지 않습니다.</AccordionTrigger><AccordionContent className="text-base leading-7 text-[#596d85]">파일 업로드는 원본 보관입니다. 자동 AI 분석은 실행되지 않습니다. Work에서 분석한 JSON 결과를 담당 교사가 검토·저장해야 연구지문·교과·성적·위키가 나타납니다.</AccordionContent></AccordionItem>
      <AccordionItem value="errors"><AccordionTrigger>학생 일괄 등록에서 오류가 표시됩니다.</AccordionTrigger><AccordionContent className="text-base leading-7 text-[#596d85]">오류 행의 입력칸을 직접 고치거나 그 행을 이번 등록에서 제외합니다. 이미 등록된 학생은 덮어쓰지 않습니다. 학번의 앞자리 0이 엑셀에서 사라졌다면 복원해 입력해야 합니다. 권한과 전체 계정 충돌은 저장할 때 서버에서 한 번 더 검사합니다.</AccordionContent></AccordionItem>
      <AccordionItem value="evaluation"><AccordionTrigger>역량 점검 결과가 없거나 점수가 확정적이지 않습니다.</AccordionTrigger><AccordionContent className="text-base leading-7 text-[#596d85]">공용 평가 자료실에서 대학·전형·학년도에 맞는 자료를 선택하고 실제 파일을 Work에 처음 한 번 전달하세요. 해당 기준을 연결한 결과를 가져오면 역량 점검이 나타납니다. 근거 상태를 먼저 보여 주며, 산출 기준이 있는 점수만 보조적으로 표시합니다. 자료가 개정되거나 지원 학년도가 달라지면 재점검 안내를 확인하세요.</AccordionContent></AccordionItem>
      <AccordionItem value="retention"><AccordionTrigger>졸업 처리하면 자료가 삭제됩니까?</AccordionTrigger><AccordionContent className="text-base leading-7 text-[#596d85]">졸업 처리는 학생 상태를 바꾸는 기능이며 원본과 버전은 삭제하지 않습니다. 이 기능이 개인정보를 무기한 보관할 근거가 되는 것은 아닙니다. 실제 운영에서는 학교의 승인된 보관·접근·파기 절차를 별도로 적용해야 합니다.</AccordionContent></AccordionItem>
    </Accordion></section>
  </div>;
}
