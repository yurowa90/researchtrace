import type { PortalData, Student } from "@/lib/portal-types";
import { recordCoverage } from "@/lib/record-coverage";

export function studentReadiness(data: PortalData, student: Student) {
  const classroom = data.classes.find((item) => item.id === student.classId);
  const requiredGrades = classroom?.grade === 3 ? [1, 2] : [1];
  const covered = data.records.filter((record) => record.studentId === student.id).flatMap(recordCoverage);
  const missingGrades = requiredGrades.filter((grade) => !covered.some((item) => item.grade === grade));
  const currentGradeIncluded = covered.some((item) => item.grade === classroom?.grade);
  const profile = data.profileSnapshots.find((item) => item.studentId === student.id && item.isActive);
  return { classroom, requiredGrades, missingGrades, currentGradeIncluded, covered, profile };
}

export function suggestedRecordYear(schoolYear: number, currentGrade: number, recordGrade: number) {
  return schoolYear - currentGrade + recordGrade;
}
