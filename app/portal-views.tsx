"use client";

import * as React from "react";
import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Link2,
  LoaderCircle,
  Network,
  Plus,
  Printer,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  Classroom,
  Fingerprint,
  InquiryThread,
  Student,
  StudentActivity,
  Subject,
  Viewer,
} from "@/lib/portal-types";
import {
  formatDate,
  splitTerms,
  statusClass,
  statusLabel,
} from "@/lib/portal-types";

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#2457d6]">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-[clamp(1.65rem,3vw,2.35rem)] font-bold tracking-[-0.045em] text-[#102342]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-[#68788d]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cfd9e6] bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eaf0fb] text-[#2457d6]">
          <Icon className="size-6" />
        </span>
        <h2 className="mt-4 font-bold text-[#17345e]">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718095]">
          {description}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function Overview({
  students,
  subjects,
  activities,
  fingerprints,
  onSelectStudent,
  onReview,
  teacher,
}: {
  students: Student[];
  subjects: Subject[];
  activities: StudentActivity[];
  fingerprints: Fingerprint[];
  onSelectStudent: (id: number) => void;
  onReview: (id: number) => void;
  teacher: boolean;
}) {
  const approved = fingerprints.filter((item) => item.status === "approved");
  const pending = fingerprints.filter((item) => item.status === "draft");
  const keywordCounts = new Map<string, number>();
  for (const fingerprint of fingerprints) {
    for (const keyword of fingerprint.keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    }
  }
  const topKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const latest = [...activities].slice(0, 6);

  const stats = [
    {
      label: teacher ? "등록 학생" : "내 활동",
      value: teacher ? students.length : activities.length,
      detail: teacher ? "활성 프로필" : "누적 기록",
      icon: Users,
      color: "#2457d6",
    },
    {
      label: "활동 원문",
      value: activities.length,
      detail: `${subjects.length}개 교과 연결`,
      icon: FileText,
      color: "#0d8b72",
    },
    {
      label: "승인 지문",
      value: approved.length,
      detail: "교사 검토 완료",
      icon: ShieldCheck,
      color: "#7a4cc5",
    },
    {
      label: "검토 대기",
      value: pending.length,
      detail: teacher ? "승인 필요" : "교사 확인 중",
      icon: ClipboardCheck,
      color: "#d56e24",
    },
  ];

  return (
    <>
      <SectionHeading
        eyebrow="Research overview"
        title={teacher ? "학급의 탐구 흐름을 한눈에 봅니다." : "내 활동이 만든 연구 지문입니다."}
        description="원문은 그대로 보존하고, 자동 분석 초안은 교사의 검토를 거쳐 프로필에 반영합니다."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="주요 현황">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden border-[#dfe6ef] bg-white shadow-[0_6px_26px_rgba(29,55,90,0.05)]">
            <CardContent className="relative p-5">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: stat.color }} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#6c7b8f]">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.04em]">{stat.value}</p>
                  <p className="mt-1 text-xs text-[#8794a5]">{stat.detail}</p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${stat.color}14`, color: stat.color }}>
                  <stat.icon className="size-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <Card className="border-[#dfe6ef] shadow-[0_6px_26px_rgba(29,55,90,0.05)]">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg tracking-[-0.02em]">최근 활동 흐름</CardTitle>
              <p className="mt-1 text-sm text-[#77869a]">교과 활동과 분석 상태를 시간순으로 확인합니다.</p>
            </div>
            <BarChart3 className="size-5 text-[#2457d6]" />
          </CardHeader>
          <CardContent>
            {latest.length === 0 ? (
              <EmptyState icon={FileText} title="아직 기록된 활동이 없습니다." description="첫 활동 원문을 등록하면 교과별 탐구 흐름이 이곳에 나타납니다." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#e7ebf1]">
                      <TableHead>학생</TableHead>
                      <TableHead>교과·유형</TableHead>
                      <TableHead>활동</TableHead>
                      <TableHead className="text-right">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latest.map((activity) => {
                      const student = students.find((item) => item.id === activity.studentId);
                      const subject = subjects.find((item) => item.id === activity.subjectId);
                      return (
                        <TableRow key={activity.id} className="border-[#edf0f4]">
                          <TableCell>
                            <button type="button" onClick={() => student && onSelectStudent(student.id)} className="font-semibold text-[#173a73] hover:underline">
                              {student?.name ?? "학생"}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ background: subject?.color ?? "#718095" }} />
                              <span className="text-sm">{subject?.name ?? "교과"}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-[#8592a4]">{activity.activityType}</p>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-[360px] truncate font-medium">{activity.title}</p>
                            <p className="mt-0.5 text-xs text-[#8794a5]">{formatDate(activity.activityDate)}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={statusClass(activity.status)}>
                              {statusLabel[activity.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#dfe6ef] bg-[#102b55] text-white shadow-[0_14px_38px_rgba(16,43,85,0.18)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BrainCircuit className="size-5 text-[#77e0c2]" />
              학급 개념 지문
            </CardTitle>
            <p className="text-sm leading-6 text-blue-100/70">활동 원문에서 반복적으로 나타난 개념입니다.</p>
          </CardHeader>
          <CardContent>
            {topKeywords.length ? (
              <div className="flex min-h-48 flex-wrap content-start gap-2">
                {topKeywords.map(([keyword, count], index) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-white/10 bg-white/8 px-3 py-2 font-medium text-blue-50"
                    style={{ fontSize: `${Math.max(13, 18 - index * 0.35)}px`, opacity: Math.max(0.68, 1 - index * 0.025) }}
                  >
                    {keyword} <small className="ml-1 text-[#77e0c2]">{count}</small>
                  </span>
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-blue-100/60">활동 분석 후 핵심 개념이 표시됩니다.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {teacher && pending.length > 0 && (
        <section className="mt-5">
          <Card className="border-[#dfe6ef] shadow-[0_6px_26px_rgba(29,55,90,0.05)]">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">교사 검토 대기</CardTitle>
                <p className="mt-1 text-sm text-[#77869a]">자동 분석은 승인 전까지 학생의 공식 프로필에 포함되지 않습니다.</p>
              </div>
              <Badge className="bg-[#fff1df] text-[#a95315] hover:bg-[#fff1df]">{pending.length}건</Badge>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {pending.slice(0, 4).map((fingerprint) => {
                const activity = activities.find((item) => item.id === fingerprint.activityId);
                const student = students.find((item) => item.id === fingerprint.studentId);
                return (
                  <button
                    type="button"
                    key={fingerprint.id}
                    onClick={() => onReview(fingerprint.id)}
                    className="group flex items-center gap-4 rounded-xl border border-[#e3e8ef] p-4 text-left transition hover:border-[#9fb8e3] hover:bg-[#f8faff]"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf0fb] text-[#2457d6]"><Sparkles className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-[#77869a]">{student?.name} · {activity?.activityType}</span>
                      <span className="mt-1 block truncate font-semibold">{activity?.title}</span>
                    </span>
                    <ChevronRight className="size-4 text-[#9aa6b6] group-hover:text-[#2457d6]" />
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}

export function StudentsView({
  students,
  subjects,
  activities,
  fingerprints,
  onSelect,
  onAdd,
  teacher,
}: {
  students: Student[];
  subjects: Subject[];
  activities: StudentActivity[];
  fingerprints: Fingerprint[];
  onSelect: (id: number) => void;
  onAdd: () => void;
  teacher: boolean;
}) {
  return (
    <>
      <SectionHeading
        eyebrow="People"
        title={teacher ? "학생별 연구 프로필" : "내 연구 프로필"}
        description="활동 수가 아니라 질문·방법·근거·교과 연결이 어떻게 축적되는지 확인합니다."
        action={teacher ? <Button onClick={onAdd} className="bg-[#173a73] hover:bg-[#102f61]"><UserPlus className="size-4" />학생 추가</Button> : undefined}
      />
      {students.length === 0 ? (
        <EmptyState icon={Users} title="검색 조건에 맞는 학생이 없습니다." description="검색어를 지우거나 학생 프로필을 추가하세요." action={teacher ? <Button onClick={onAdd}><Plus className="size-4" />학생 추가</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {students.map((student) => {
            const studentActivities = activities.filter((item) => item.studentId === student.id);
            const studentPrints = fingerprints.filter((item) => item.studentId === student.id);
            const approved = studentPrints.filter((item) => item.status === "approved");
            const keywords = [...new Set(studentPrints.flatMap((item) => item.keywords))].slice(0, 5);
            const usedSubjects = subjects.filter((subject) => studentActivities.some((item) => item.subjectId === subject.id));
            const progress = Math.min(100, studentActivities.length * 12 + approved.length * 18);
            return (
              <Card key={student.id} className="group border-[#dfe6ef] bg-white shadow-[0_6px_24px_rgba(29,55,90,0.045)] transition hover:-translate-y-0.5 hover:border-[#a9bde0] hover:shadow-[0_14px_34px_rgba(29,55,90,0.09)]">
                <CardContent className="p-5">
                  <button type="button" className="w-full text-left" onClick={() => onSelect(student.id)}>
                    <div className="flex items-start gap-4">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e8eef9] text-lg font-bold text-[#1f4b91]">{student.name.replace("예시 학생 ", "")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-bold">{student.name}</span>
                          {student.isExample && <Badge variant="outline" className="text-[10px]">예시</Badge>}
                        </span>
                        <span className="mt-1 block text-xs text-[#8290a1]">{student.studentNumber} · {student.userId ? "계정 연결" : "계정 미연결"}</span>
                      </span>
                      <ChevronRight className="size-5 text-[#a2adba] transition group-hover:translate-x-0.5 group-hover:text-[#2457d6]" />
                    </div>
                    <div className="mt-5 grid grid-cols-3 divide-x divide-[#e8ecf2] rounded-xl bg-[#f7f9fc] px-2 py-3 text-center">
                      <span><strong className="block text-lg">{studentActivities.length}</strong><small className="text-[#7e8c9e]">활동</small></span>
                      <span><strong className="block text-lg">{approved.length}</strong><small className="text-[#7e8c9e]">승인 지문</small></span>
                      <span><strong className="block text-lg">{usedSubjects.length}</strong><small className="text-[#7e8c9e]">교과 연결</small></span>
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-xs"><span className="text-[#77869a]">프로필 축적도</span><span className="font-semibold text-[#2457d6]">{progress}%</span></div>
                      <Progress value={progress} className="h-1.5 bg-[#e9eef5] [&>div]:bg-[#2457d6]" />
                    </div>
                    <div className="mt-4 flex min-h-7 flex-wrap gap-1.5">
                      {keywords.length ? keywords.map((keyword) => <Badge key={keyword} variant="secondary" className="bg-[#edf2fa] text-[#45617f]">{keyword}</Badge>) : <span className="text-xs text-[#95a0af]">분석된 핵심어가 없습니다.</span>}
                    </div>
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ActivitiesView({
  activities,
  students,
  subjects,
  fingerprints,
  files,
  onAdd,
  onAnalyze,
  busy,
}: {
  activities: StudentActivity[];
  students: Student[];
  subjects: Subject[];
  fingerprints: Fingerprint[];
  files: Array<{ id: number; activityId: number; originalName: string; sizeBytes: number }>;
  onAdd: () => void;
  onAnalyze: (activityId: number) => void;
  busy: boolean;
}) {
  const [subjectFilter, setSubjectFilter] = React.useState("all");
  const filtered = subjectFilter === "all" ? activities : activities.filter((item) => item.subjectId === Number(subjectFilter));
  return (
    <>
      <SectionHeading
        eyebrow="Research outputs"
        title="활동 원문과 분석 기록"
        description="보고서·논술·토론·실험 기록을 원문 그대로 보존하고 분석 지문과 나란히 관리합니다."
        action={<div className="flex gap-2"><Select value={subjectFilter} onValueChange={(value) => setSubjectFilter(value ?? "all")}><SelectTrigger className="h-10 min-w-36 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 교과</SelectItem>{subjects.map((subject) => <SelectItem value={String(subject.id)} key={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select><Button onClick={onAdd} className="bg-[#173a73] hover:bg-[#102f61]"><FilePlus2 className="size-4" />활동 등록</Button></div>}
      />
      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="등록된 활동이 없습니다." description="활동 원문을 붙여 넣으면 자동 분석 초안을 만들고 교사 검토 대기열에 올립니다." action={<Button onClick={onAdd}><Plus className="size-4" />첫 활동 등록</Button>} />
      ) : (
        <div className="space-y-3">
          {filtered.map((activity) => {
            const student = students.find((item) => item.id === activity.studentId);
            const subject = subjects.find((item) => item.id === activity.subjectId);
            const fingerprint = fingerprints.find((item) => item.activityId === activity.id);
            const attachments = files.filter((item) => item.activityId === activity.id);
            return (
              <Card key={activity.id} className="border-[#dfe6ef] shadow-[0_4px_20px_rgba(29,55,90,0.04)]">
                <CardContent className="p-5">
                  <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#718095]">
                        <span className="font-semibold text-[#173a73]">{student?.name}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: subject?.color }} />{subject?.name}</span>
                        <span>·</span>
                        <span>{activity.activityType}</span>
                        <span>·</span>
                        <span>{formatDate(activity.activityDate)}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-bold tracking-[-0.02em]">{activity.title}</h2>
                      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#5f7085]">{activity.rawText}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={statusClass(activity.status)}>{statusLabel[activity.status]}</Badge>
                        {attachments.map((file) => <Badge key={file.id} variant="secondary" className="bg-[#f0f3f7] text-[#617187]"><FileText className="mr-1 size-3" />{file.originalName}</Badge>)}
                        {activity.sourceNote && <span className="text-xs text-[#8a96a6]">출처 메모: {activity.sourceNote}</span>}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#e4e9f0] bg-[#f8fafc] p-4">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold"><BrainCircuit className="size-4 text-[#2457d6]" />분석 지문</p>
                        {!fingerprint && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnalyze(activity.id)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}분석</Button>}
                      </div>
                      {fingerprint ? (
                        <>
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#627287]">{fingerprint.summary}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">{fingerprint.keywords.slice(0, 6).map((keyword) => <Badge key={keyword} className="bg-white text-[#345878] hover:bg-white">{keyword}</Badge>)}</div>
                        </>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-[#8794a5]">원문은 저장되었지만 분석 초안이 아직 없습니다.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ReviewsView({
  fingerprints,
  activities,
  students,
  onReview,
}: {
  fingerprints: Fingerprint[];
  activities: StudentActivity[];
  students: Student[];
  onReview: (id: number) => void;
}) {
  const pending = fingerprints.filter((item) => item.status === "draft");
  const resolved = fingerprints.filter((item) => item.status !== "draft");
  return (
    <>
      <SectionHeading eyebrow="Teacher review" title="자동 분석 검토·승인" description="핵심어와 역량은 사실이 아니라 텍스트 기반 추론입니다. 원문을 대조한 뒤 수정하거나 승인합니다." />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-[#dfe6ef]">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="size-5 text-[#2457d6]" />검토 대기 <Badge className="bg-[#eaf0fb] text-[#2457d6] hover:bg-[#eaf0fb]">{pending.length}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 ? <EmptyState icon={Check} title="검토할 분석이 없습니다." description="새 활동을 분석하면 이곳에 초안이 나타납니다." /> : pending.map((fingerprint) => {
              const activity = activities.find((item) => item.id === fingerprint.activityId);
              const student = students.find((item) => item.id === fingerprint.studentId);
              return (
                <button type="button" key={fingerprint.id} onClick={() => onReview(fingerprint.id)} className="w-full rounded-2xl border border-[#e2e7ee] p-4 text-left transition hover:border-[#9db5df] hover:bg-[#f8faff]">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[#2457d6]">{student?.name} · {activity?.activityType}</p><h2 className="mt-1 font-bold">{activity?.title}</h2></div><ArrowRight className="mt-1 size-4 shrink-0 text-[#8b98a8]" /></div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#65758a]">{fingerprint.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{fingerprint.keywords.slice(0, 5).map((keyword) => <Badge key={keyword} variant="secondary">{keyword}</Badge>)}</div>
                </button>
              );
            })}
          </CardContent>
        </Card>
        <Card className="border-[#dfe6ef]">
          <CardHeader><CardTitle className="text-lg">처리 기록</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {resolved.length === 0 ? <p className="py-16 text-center text-sm text-[#8794a5]">승인 또는 보완 처리된 기록이 없습니다.</p> : resolved.slice(0, 10).map((fingerprint) => {
              const activity = activities.find((item) => item.id === fingerprint.activityId);
              return <div key={fingerprint.id} className="flex items-center gap-3 border-b border-[#edf0f4] py-3 last:border-0"><span className={`grid size-8 place-items-center rounded-full ${fingerprint.status === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{fingerprint.status === "approved" ? <Check className="size-4" /> : <ArrowRight className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{activity?.title}</p><p className="text-xs text-[#8794a5]">{fingerprint.status === "approved" ? "승인됨" : "보완 필요"}</p></div></div>;
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function ThreadsView({
  threads,
  links,
  activities,
  students,
  onAdd,
  onLink,
  busy,
}: {
  threads: InquiryThread[];
  links: Array<{ threadId: number; activityId: number; sequence: number }>;
  activities: StudentActivity[];
  students: Student[];
  onAdd: () => void;
  onLink: (threadId: number, activityId: number) => void;
  busy: boolean;
}) {
  const [selections, setSelections] = React.useState<Record<number, string>>({});
  return (
    <>
      <SectionHeading
        eyebrow="Inquiry pathways"
        title="활동을 탐구 흐름으로 연결합니다."
        description="서로 다른 교과에서 나온 활동을 하나의 중심 질문 아래 배치해 학생의 질문 발전 과정을 봅니다."
        action={<Button onClick={onAdd} className="bg-[#173a73] hover:bg-[#102f61]"><Link2 className="size-4" />탐구 흐름 만들기</Button>}
      />
      {threads.length === 0 ? (
        <EmptyState icon={Network} title="연결된 탐구 흐름이 없습니다." description="반복되는 관심 개념이나 후속 질문을 중심으로 여러 활동을 연결하세요." action={<Button onClick={onAdd}><Plus className="size-4" />첫 흐름 만들기</Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {threads.map((thread) => {
            const student = students.find((item) => item.id === thread.studentId);
            const threadLinks = links.filter((item) => item.threadId === thread.id).sort((a, b) => a.sequence - b.sequence);
            const linkedActivities = threadLinks.map((link) => activities.find((activity) => activity.id === link.activityId)).filter(Boolean) as StudentActivity[];
            const linkedIds = new Set(linkedActivities.map((activity) => activity.id));
            const available = activities.filter(
              (activity) =>
                activity.studentId === thread.studentId &&
                !linkedIds.has(activity.id),
            );
            return (
              <Card key={thread.id} className="overflow-hidden border-[#dfe6ef]">
                <div className="h-1.5 bg-gradient-to-r from-[#2457d6] via-[#2f88c8] to-[#77e0c2]" />
                <CardHeader>
                  <div className="flex items-center justify-between"><Badge variant="outline" className="text-[#2457d6]">{student?.name}</Badge><Badge variant="secondary">{thread.status === "active" ? "진행 중" : thread.status === "complete" ? "완료" : "구성 중"}</Badge></div>
                  <CardTitle className="mt-2 text-xl">{thread.title}</CardTitle>
                  <p className="mt-1 text-sm leading-6 text-[#5f7085]">{thread.focusQuestion}</p>
                </CardHeader>
                <CardContent>
                  {linkedActivities.length ? <ol className="relative space-y-4 border-l border-[#cfd9e6] pl-5">{linkedActivities.map((activity, index) => <li key={activity.id} className="relative"><span className="absolute -left-[27px] top-1 grid size-4 place-items-center rounded-full border-2 border-white bg-[#2457d6] text-[9px] text-white">{index + 1}</span><p className="text-xs text-[#8592a4]">{formatDate(activity.activityDate)} · {activity.activityType}</p><p className="mt-0.5 font-semibold">{activity.title}</p></li>)}</ol> : <p className="rounded-xl bg-[#f7f9fc] p-4 text-sm text-[#7d8b9d]">아직 연결된 활동이 없습니다.</p>}
                  {available.length > 0 && (
                    <div className="mt-5 flex gap-2 border-t border-[#edf0f4] pt-4">
                      <Select
                        value={selections[thread.id] ?? ""}
                        onValueChange={(value) =>
                          setSelections((current) => ({
                            ...current,
                            [thread.id]: value ?? "",
                          }))
                        }
                      >
                        <SelectTrigger className="min-w-0 flex-1">
                          <SelectValue placeholder="연결할 활동 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((activity) => (
                            <SelectItem
                              key={activity.id}
                              value={String(activity.id)}
                            >
                              {activity.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        disabled={busy || !selections[thread.id]}
                        onClick={() =>
                          onLink(thread.id, Number(selections[thread.id]))
                        }
                      >
                        <Link2 className="size-4" />
                        연결
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function SettingsView({
  classroom,
  students,
  pendingUsers,
  onApprove,
  onArchive,
  onAddClass,
  onAddSubject,
  busy,
}: {
  classroom?: Classroom;
  students: Student[];
  pendingUsers: Array<{ id: number; email: string; displayName: string; createdAt: string }>;
  onApprove: (userId: number, studentId: number) => void;
  onArchive: (studentId: number) => void;
  onAddClass: () => void;
  onAddSubject: () => void;
  busy: boolean;
}) {
  const [mapping, setMapping] = React.useState<Record<number, string>>({});
  return (
    <>
      <SectionHeading
        eyebrow="Administration"
        title="학급과 접근 권한"
        description="학생 계정은 교사가 기존 학생 프로필과 연결한 뒤에만 본인 자료를 열람할 수 있습니다."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={onAddSubject}>
              <BookOpenText className="size-4" />
              교과 추가
            </Button>
            <Button
              onClick={onAddClass}
              className="bg-[#173a73] hover:bg-[#102f61]"
            >
              <Plus className="size-4" />
              학급 추가
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <Card className="border-[#dfe6ef]">
            <CardHeader><CardTitle className="text-lg">학급 정보</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-[#77869a]">학급명</Label><p className="mt-1 font-semibold">{classroom?.name ?? "학급 없음"}</p></div>
              <div className="grid grid-cols-2 gap-4"><div><Label className="text-[#77869a]">학년도</Label><p className="mt-1 font-semibold">{classroom?.schoolYear}</p></div><div><Label className="text-[#77869a]">학년</Label><p className="mt-1 font-semibold">{classroom?.grade}학년</p></div></div>
              <div className="rounded-xl bg-[#edf3fc] p-4"><p className="text-xs font-semibold text-[#56708f]">학생 연결 코드</p><p className="mt-1 font-mono text-lg font-bold tracking-[0.08em] text-[#173a73]">{classroom?.inviteCode}</p><p className="mt-2 text-xs leading-5 text-[#718095]">코드는 학급 식별용입니다. 사이트 접근 권한과 학생 프로필 연결은 별도로 승인합니다.</p></div>
            </CardContent>
          </Card>
          <Card className="border-[#dfe6ef]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-[#0d8b72]" />데이터 처리 원칙</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-[#637389]">
              <p>활동 원문과 시스템 분석을 별도 기록으로 보관합니다.</p>
              <p>분석 초안은 교사 승인 전 공식 프로필에 포함하지 않습니다.</p>
              <p>학생은 연결된 본인 프로필만 열람합니다.</p>
              <p>자료 공개·공유는 기본적으로 비활성화합니다.</p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="border-[#dfe6ef]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserPlus className="size-5 text-[#2457d6]" />승인 대기 계정 <Badge variant="secondary">{pendingUsers.length}</Badge></CardTitle></CardHeader>
            <CardContent>
              {pendingUsers.length === 0 ? <p className="py-12 text-center text-sm text-[#8794a5]">승인 대기 중인 계정이 없습니다.</p> : <div className="space-y-3">{pendingUsers.map((user) => <div key={user.id} className="grid gap-3 rounded-xl border border-[#e3e8ef] p-4 sm:grid-cols-[1fr_220px_auto] sm:items-center"><div><p className="font-semibold">{user.displayName}</p><p className="mt-0.5 text-xs text-[#7e8c9e]">{user.email}</p></div><Select value={mapping[user.id] ?? ""} onValueChange={(value) => setMapping((current) => ({ ...current, [user.id]: value ?? "" }))}><SelectTrigger className="w-full"><SelectValue placeholder="연결할 학생 선택" /></SelectTrigger><SelectContent>{students.filter((student) => !student.userId).map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.studentNumber} {student.name}</SelectItem>)}</SelectContent></Select><Button disabled={busy || !mapping[user.id]} onClick={() => onApprove(user.id, Number(mapping[user.id]))}>승인</Button></div>)}</div>}
            </CardContent>
          </Card>
          <Card className="border-[#dfe6ef]">
            <CardHeader><CardTitle className="text-lg">학생 계정 연결</CardTitle></CardHeader>
            <CardContent>
              <Table><TableHeader><TableRow><TableHead>학생</TableHead><TableHead>이메일</TableHead><TableHead>상태</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader><TableBody>{students.map((student) => <TableRow key={student.id}><TableCell><p className="font-semibold">{student.name}</p><p className="text-xs text-[#8794a5]">{student.studentNumber}</p></TableCell><TableCell className="text-sm text-[#68788d]">{student.email ?? "미등록"}</TableCell><TableCell><Badge variant="outline" className={student.userId ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{student.userId ? "연결됨" : "미연결"}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(student.id)} className="text-[#7b8797]"><Archive className="size-4" />보관</Button></TableCell></TableRow>)}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function StudentProfileSheet({
  open,
  student,
  activities,
  subjects,
  fingerprints,
  threads,
  onOpenChange,
}: {
  open: boolean;
  student: Student | null;
  activities: StudentActivity[];
  subjects: Subject[];
  fingerprints: Fingerprint[];
  threads: InquiryThread[];
  onOpenChange: (open: boolean) => void;
}) {
  if (!student) return null;
  const studentActivities = activities.filter((item) => item.studentId === student.id);
  const studentPrints = fingerprints.filter((item) => item.studentId === student.id);
  const studentThreads = threads.filter((item) => item.studentId === student.id);
  const keywords = [...new Set(studentPrints.filter((item) => item.status === "approved").flatMap((item) => item.keywords))];
  const competencies = [...new Set(studentPrints.filter((item) => item.status === "approved").flatMap((item) => item.competencies))];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-l-[#dfe6ef] p-0 sm:max-w-2xl">
        <div className="bg-[#102b55] p-6 text-white sm:p-8">
          <SheetHeader>
            <div className="flex items-start gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#77e0c2] text-xl font-bold text-[#0c3f39]">{student.name.replace("예시 학생 ", "")}</span>
              <div><SheetTitle className="text-2xl text-white">{student.name}</SheetTitle><SheetDescription className="mt-1 text-blue-100/70">{student.studentNumber} · {studentActivities.length}개 활동 · {studentPrints.filter((item) => item.status === "approved").length}개 승인 지문</SheetDescription></div>
            </div>
          </SheetHeader>
          <div className="mt-6 flex flex-wrap gap-2">{keywords.length ? keywords.slice(0, 10).map((keyword) => <span key={keyword} className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-sm text-blue-50">{keyword}</span>) : <p className="text-sm text-blue-100/60">승인된 핵심어가 없습니다.</p>}</div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="no-print mb-5 flex justify-end"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" />프로필 PDF 저장</Button></div>
          <Tabs defaultValue="profile">
            <TabsList className="grid h-auto w-full grid-cols-3 bg-[#edf1f6] p-1"><TabsTrigger value="profile">연구 지문</TabsTrigger><TabsTrigger value="activities">활동 원문</TabsTrigger><TabsTrigger value="threads">탐구 흐름</TabsTrigger></TabsList>
            <TabsContent value="profile" className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="border-[#e2e7ee]"><CardHeader className="pb-2"><CardTitle className="text-sm text-[#6b7b8f]">드러난 탐구 역량</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{competencies.length ? competencies.map((item) => <Badge key={item} className="bg-[#e8f6f2] text-[#14705e] hover:bg-[#e8f6f2]">{item}</Badge>) : <span className="text-sm text-[#8a96a6]">승인 자료 없음</span>}</CardContent></Card>
                <Card className="border-[#e2e7ee]"><CardHeader className="pb-2"><CardTitle className="text-sm text-[#6b7b8f]">교과 연결</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{[...new Set(studentActivities.map((activity) => subjects.find((subject) => subject.id === activity.subjectId)?.name).filter(Boolean))].map((name) => <Badge key={name} variant="outline">{name}</Badge>)}</CardContent></Card>
              </div>
              {studentPrints.map((fingerprint) => {
                const activity = studentActivities.find((item) => item.id === fingerprint.activityId);
                return <Card key={fingerprint.id} className="border-[#e2e7ee]"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{activity?.title}</p><Badge variant="outline" className={statusClass(fingerprint.status)}>{statusLabel[fingerprint.status]}</Badge></div><p className="mt-3 text-sm leading-6 text-[#627287]">{fingerprint.summary}</p><div className="mt-3 flex flex-wrap gap-1.5">{fingerprint.keywords.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div>{fingerprint.status === "approved" && fingerprint.questions.length > 0 && <div className="mt-4 rounded-xl bg-[#f5f8fc] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#2457d6]">후속 질문</p><ul className="mt-2 space-y-2 text-sm leading-5">{fingerprint.questions.map((question) => <li key={question} className="flex gap-2"><CircleDot className="mt-0.5 size-4 shrink-0 text-[#0d8b72]" />{question}</li>)}</ul></div>}</CardContent></Card>;
              })}
            </TabsContent>
            <TabsContent value="activities" className="mt-5 space-y-4">{studentActivities.map((activity) => <article key={activity.id} className="rounded-2xl border border-[#e2e7ee] p-5"><p className="text-xs text-[#78879a]">{formatDate(activity.activityDate)} · {subjects.find((item) => item.id === activity.subjectId)?.name} · {activity.activityType}</p><h3 className="mt-1.5 font-bold">{activity.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5d6e83]">{activity.rawText}</p>{activity.sourceNote && <p className="mt-3 border-t border-[#edf0f4] pt-3 text-xs text-[#8794a5]">출처 메모: {activity.sourceNote}</p>}</article>)}</TabsContent>
            <TabsContent value="threads" className="mt-5 space-y-4">{studentThreads.length ? studentThreads.map((thread) => <Card key={thread.id} className="border-[#e2e7ee]"><CardContent className="p-5"><Badge variant="outline">탐구 흐름</Badge><h3 className="mt-3 font-bold">{thread.title}</h3><p className="mt-2 text-sm leading-6 text-[#627287]">{thread.focusQuestion}</p></CardContent></Card>) : <EmptyState icon={Network} title="연결된 탐구 흐름이 없습니다." description="여러 활동이 하나의 질문으로 이어질 때 탐구 흐름에 표시됩니다." />}</TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ClassDialog({
  open,
  onOpenChange,
  busy,
  admin,
  staffUsers,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  admin: boolean;
  staffUsers: Array<{ id: number; displayName: string; email: string; role: "admin" | "teacher" }>;
  onSave: (payload: {
    name: string;
    grade: number;
    schoolYear: number;
    teacherId?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [grade, setGrade] = React.useState("2");
  const [schoolYear, setSchoolYear] = React.useState("2026");
  const [teacherId, setTeacherId] = React.useState("");
  React.useEffect(() => {
    if (admin && !teacherId && staffUsers.length) {
      const timer = window.setTimeout(() => setTeacherId(String(staffUsers[0].id)), 0);
      return () => window.clearTimeout(timer);
    }
  }, [admin, staffUsers, teacherId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학급 추가</DialogTitle>
          <DialogDescription>
            새 학급에는 통합과학·과학탐구실험·생명과학 교과가 기본으로
            생성됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="class-name">학급명</Label>
            <Input
              id="class-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 2학년 생명과학 연구반"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>학년</Label>
              <Select value={grade} onValueChange={(value) => setGrade(value ?? "2")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="school-year">학년도</Label>
              <Input
                id="school-year"
                type="number"
                value={schoolYear}
                onChange={(event) => setSchoolYear(event.target.value)}
              />
            </div>
          </div>
          {admin && <div className="grid gap-2"><Label>담당 교사</Label><Select value={teacherId} onValueChange={(value) => setTeacherId(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="담당 교사 선택" /></SelectTrigger><SelectContent>{staffUsers.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.displayName} · {user.role === "admin" ? "관리자" : "담임"}</SelectItem>)}</SelectContent></Select></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={busy || !name.trim() || (admin && !teacherId)}
            onClick={() =>
              void onSave({
                name,
                grade: Number(grade),
                schoolYear: Number(schoolYear),
                teacherId: admin ? Number(teacherId) : undefined,
              })
            }
            className="bg-[#173a73]"
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            학급 만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubjectDialog({
  open,
  onOpenChange,
  classroom,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroom?: Classroom;
  busy: boolean;
  onSave: (payload: {
    classId: number;
    name: string;
    color: string;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#2457d6");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>교과 추가</DialogTitle>
          <DialogDescription>
            {classroom?.name ?? "현재 학급"}에서 사용할 교과를 추가합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="subject-name">교과명</Label>
            <Input
              id="subject-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 고급 생명과학"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="subject-color">구분 색상</Label>
            <div className="flex items-center gap-3">
              <Input
                id="subject-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-11 w-20 p-1"
              />
              <Input
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={busy || !classroom || !name.trim()}
            onClick={() =>
              classroom &&
              void onSave({ classId: classroom.id, name, color })
            }
            className="bg-[#173a73]"
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            교과 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StudentDialog({
  open,
  onOpenChange,
  classrooms,
  defaultClassId,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classrooms: Classroom[];
  defaultClassId: number | null;
  busy: boolean;
  onSave: (payload: { classId: number; studentNumber: string; name: string; email: string }) => Promise<void>;
}) {
  const [classId, setClassId] = React.useState("");
  const [studentNumber, setStudentNumber] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  React.useEffect(() => {
    if (open) {
      const next = defaultClassId && classrooms.some((item) => item.id === defaultClassId) ? defaultClassId : classrooms[0]?.id;
      const timer = window.setTimeout(() => setClassId(next ? String(next) : ""), 0);
      return () => window.clearTimeout(timer);
    }
  }, [classrooms, defaultClassId, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>학생 프로필 추가</DialogTitle><DialogDescription>학급을 지정하고 학생 이메일을 입력하면 같은 이메일의 학생 계정을 안전하게 연결합니다.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>소속 학급</Label><Select value={classId} onValueChange={(value) => setClassId(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="학급 선택" /></SelectTrigger><SelectContent>{classrooms.map((classroom) => <SelectItem key={classroom.id} value={String(classroom.id)}>{classroom.name} · {classroom.grade}학년</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="student-number">학번</Label><Input id="student-number" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="예: 20104" /></div><div className="grid gap-2"><Label htmlFor="student-name">이름</Label><Input id="student-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="student-email">학생 계정 이메일(선택)</Label><Input id="student-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={busy || !classId || !studentNumber.trim() || !name.trim()} onClick={() => void onSave({ classId: Number(classId), studentNumber, name, email })} className="bg-[#173a73]">{busy && <LoaderCircle className="size-4 animate-spin" />}추가</Button></DialogFooter></DialogContent></Dialog>;
}

export function ActivityDialog({
  open,
  onOpenChange,
  students,
  subjects,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  subjects: Subject[];
  busy: boolean;
  onSave: (payload: { studentId: number; subjectId: number; title: string; activityType: string; activityDate: string; sourceNote: string; rawText: string }, file: File | null) => Promise<void>;
}) {
  const [studentId, setStudentId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [activityType, setActivityType] = React.useState("탐구 보고서");
  const [activityDate, setActivityDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [sourceNote, setSourceNote] = React.useState("");
  const [rawText, setRawText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const selectedStudent = students.find((item) => item.id === Number(studentId));
  const availableSubjects = subjects.filter((item) => !selectedStudent || item.classId === selectedStudent.classId);
  React.useEffect(() => {
    if (!studentId && students.length === 1) {
      const timer = window.setTimeout(() => setStudentId(String(students[0].id)), 0);
      return () => window.clearTimeout(timer);
    }
  }, [studentId, students]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>활동 원문 등록</DialogTitle><DialogDescription>학생이 실제로 작성한 텍스트를 그대로 넣으세요. 저장 후 분석 초안이 별도 생성됩니다.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="grid gap-2"><Label>학생</Label><Select value={studentId} onValueChange={(value) => { setStudentId(value ?? ""); setSubjectId(""); }}><SelectTrigger className="w-full"><SelectValue placeholder="학생 선택" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.studentNumber} {student.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>교과</Label><Select value={subjectId} onValueChange={(value) => setSubjectId(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="교과 선택" /></SelectTrigger><SelectContent>{availableSubjects.map((subject) => <SelectItem key={subject.id} value={String(subject.id)}>{subject.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="activity-title">활동 제목</Label><Input id="activity-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="grid gap-2"><Label>활동 유형</Label><Select value={activityType} onValueChange={(value) => setActivityType(value ?? "탐구 보고서")}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["탐구 보고서", "실험", "독서 논술", "토론", "발표", "자료 분석", "진로 활동"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="activity-date">활동 날짜</Label><Input id="activity-date" type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="activity-text">활동 원문</Label><Textarea id="activity-text" value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-48 leading-6" placeholder="학생 보고서, 발표문, 성찰문 등 분석할 원문을 붙여 넣습니다." /><p className="text-right text-xs text-[#8a96a6]">{rawText.length.toLocaleString()}자</p></div><div className="grid gap-2"><Label htmlFor="source-note">출처·맥락 메모</Label><Input id="source-note" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="예: 통합과학 수행평가" /></div><div className="grid gap-2"><Label htmlFor="activity-file">원본 파일(선택, 10MB 이하)</Label><Input id="activity-file" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={busy || !studentId || !subjectId || !title.trim() || !rawText.trim()} onClick={() => void onSave({ studentId: Number(studentId), subjectId: Number(subjectId), title, activityType, activityDate, sourceNote, rawText }, file)} className="bg-[#173a73]">{busy && <LoaderCircle className="size-4 animate-spin" />}저장하고 분석</Button></DialogFooter></DialogContent></Dialog>;
}

export function ThreadDialog({
  open,
  onOpenChange,
  students,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  busy: boolean;
  onSave: (payload: { studentId: number; title: string; focusQuestion: string }) => Promise<void>;
}) {
  const [studentId, setStudentId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [focusQuestion, setFocusQuestion] = React.useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>탐구 흐름 만들기</DialogTitle><DialogDescription>여러 활동을 묶을 중심 질문을 먼저 만듭니다.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>학생</Label><Select value={studentId} onValueChange={(value) => setStudentId(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="학생 선택" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.studentNumber} {student.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="thread-title">흐름 제목</Label><Input id="thread-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 변이에서 적응까지" /></div><div className="grid gap-2"><Label htmlFor="focus-question">중심 질문</Label><Textarea id="focus-question" value={focusQuestion} onChange={(event) => setFocusQuestion(event.target.value)} className="min-h-28" /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={busy || !studentId || !title.trim() || !focusQuestion.trim()} onClick={() => void onSave({ studentId: Number(studentId), title, focusQuestion })} className="bg-[#173a73]">{busy && <LoaderCircle className="size-4 animate-spin" />}만들기</Button></DialogFooter></DialogContent></Dialog>;
}

export function ReviewDialog({
  open,
  onOpenChange,
  fingerprint,
  activity,
  student,
  busy,
  onSave,
  onApprove,
  onReturn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fingerprint: Fingerprint | null;
  activity: StudentActivity | null;
  student: Student | null;
  busy: boolean;
  onSave: (payload: { summary: string; keywords: string[]; methods: string[]; evidence: string[]; competencies: string[]; questions: string[]; subjectLinks: string[] }) => Promise<void>;
  onApprove: () => Promise<void>;
  onReturn: () => Promise<void>;
}) {
  const [summary, setSummary] = React.useState("");
  const [keywords, setKeywords] = React.useState("");
  const [methods, setMethods] = React.useState("");
  const [evidence, setEvidence] = React.useState("");
  const [competencies, setCompetencies] = React.useState("");
  const [subjectLinks, setSubjectLinks] = React.useState("");
  const [questions, setQuestions] = React.useState("");
  React.useEffect(() => {
    if (!fingerprint) return;
    const timer = window.setTimeout(() => {
      setSummary(fingerprint.summary);
      setKeywords(fingerprint.keywords.join(", "));
      setMethods(fingerprint.methods.join(", "));
      setEvidence(fingerprint.evidence.join(", "));
      setCompetencies(fingerprint.competencies.join(", "));
      setSubjectLinks(fingerprint.subjectLinks.join(", "));
      setQuestions(fingerprint.questions.join("\n"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fingerprint]);
  if (!fingerprint) return null;
  const payload = { summary, keywords: splitTerms(keywords), methods: splitTerms(methods), evidence: splitTerms(evidence), competencies: splitTerms(competencies), subjectLinks: splitTerms(subjectLinks), questions: questions.split("\n").map((item) => item.trim()).filter(Boolean) };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>분석 초안 검토</DialogTitle><DialogDescription>{student?.name} · {activity?.title}. 왼쪽 원문과 오른쪽 추론을 대조합니다.</DialogDescription></DialogHeader><div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-[#e1e7ef] bg-[#f8fafc] p-5"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#65758a]">학생 활동 원문</p><h3 className="mt-2 font-bold">{activity?.title}</h3><p className="mt-4 max-h-[52vh] overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-7 text-[#53657a]">{activity?.rawText}</p></section><section className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">아래 내용은 텍스트 패턴을 바탕으로 생성한 분석 초안입니다. 학생의 실제 역량으로 단정하지 말고 원문 근거를 확인하세요.</div><div className="grid gap-2"><Label>요약</Label><Textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-24" /></div><TermInput label="핵심 개념" value={keywords} setValue={setKeywords} /><div className="grid gap-3 sm:grid-cols-2"><TermInput label="탐구 방법" value={methods} setValue={setMethods} /><TermInput label="근거 유형" value={evidence} setValue={setEvidence} /><TermInput label="드러난 역량" value={competencies} setValue={setCompetencies} /><TermInput label="교과 연결" value={subjectLinks} setValue={setSubjectLinks} /></div><div className="grid gap-2"><Label>후속 질문(한 줄에 하나)</Label><Textarea value={questions} onChange={(event) => setQuestions(event.target.value)} className="min-h-28" /></div></section></div><DialogFooter className="mt-2 flex-wrap sm:justify-between"><Button variant="outline" className="border-amber-300 text-amber-700" disabled={busy} onClick={() => void onReturn()}>보완 필요</Button><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void onSave(payload)}>수정 저장</Button><Button disabled={busy || !summary.trim()} onClick={() => void onSave(payload).then(onApprove)} className="bg-[#0d7b68] hover:bg-[#0b6758]">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}수정 저장 후 승인</Button></div></DialogFooter></DialogContent></Dialog>;
}

function TermInput({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
}) {
  return <div className="grid gap-2"><Label>{label}</Label><Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="쉼표로 구분" /></div>;
}

export function PortalSkeleton() {
  return <div className="min-h-screen bg-[#f4f7fb] p-6 lg:pl-[280px]"><div className="mx-auto max-w-6xl space-y-6"><div className="flex justify-between"><Skeleton className="h-14 w-64" /><Skeleton className="h-11 w-80" /></div><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div><div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]"><Skeleton className="h-[440px] rounded-2xl" /><Skeleton className="h-[440px] rounded-2xl" /></div></div></div>;
}

export function PortalError({
  message,
  retry,
}: {
  message: string;
  retry: () => Promise<void>;
}) {
  return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-6"><Card className="w-full max-w-lg border-[#dfe5ee] shadow-lg"><CardContent className="p-8 text-center"><X className="mx-auto size-10 text-rose-500" /><h1 className="mt-4 text-xl font-bold">자료를 불러오지 못했습니다.</h1><p className="mt-2 text-sm leading-6 text-[#66768a]">{message}</p><Button className="mt-6 bg-[#173a73]" onClick={() => void retry()}>다시 시도</Button></CardContent></Card></main>;
}

export function PendingAccess({ viewer }: { viewer: Viewer }) {
  const blocked = viewer.status === "suspended", linking = viewer.id === 0;
  return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-6"><Card className="w-full max-w-lg border-[#dfe5ee] shadow-lg"><CardContent className="p-8"><ShieldCheck className="size-10 text-[#2457d6]" /><h1 className="mt-5 text-2xl font-bold">{blocked?"계정 또는 사이트 연결이 중지되어 있습니다.":linking?"기존 학교 계정과의 연결 승인을 기다리고 있습니다.":"학교 계정 승인을 기다리고 있습니다."}</h1><p className="mt-3 leading-7 text-[#66768a]">{viewer.email} 계정으로 접속했습니다. {blocked?"학교 관리자에게 계정과 연결 상태 확인을 요청해야 합니다. 학생 기록은 삭제되지 않습니다.":linking?"연결 요청을 저장했습니다. 학교 관리자가 본인 확인 후 기존 계정에 연결하면 누적된 학생 기록을 이어서 볼 수 있습니다.":"학교 관리자가 담임 역할을 승인하거나 담당 교사가 등록된 학생과 계정을 연결하면 허용된 자료를 열람할 수 있습니다."}</p><Button variant="outline" className="mt-5" onClick={()=>window.location.reload()}>승인 상태 다시 확인</Button></CardContent></Card></main>;
}
