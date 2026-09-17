import type { Student } from "@/lib/portal-types";

export function matchRecordStudent(name:string,students:Pick<Student,"id"|"studentNumber"|"name">[]){
  const tokens=name.replace(/\.[^.]+$/,"").normalize("NFKC").split(/[\s_()[\]{}.-]+/).filter(Boolean);
  const numbered=students.filter(s=>tokens.includes(s.studentNumber.normalize("NFKC")));
  const named=students.filter(s=>tokens.includes(s.name.normalize("NFKC")));
  const choices=numbered.length&&named.length?numbered.filter(s=>named.some(n=>n.id===s.id)):numbered.length?numbered:named;
  return {studentId:choices.length===1?choices[0].id:null,reason:choices.length===1?"파일명 일치 · 원본 확인 필요":choices.length>1?"동명이인·중복 학번 확인 필요":numbered.length&&named.length?"학번과 이름이 서로 다름":"학생을 직접 선택하세요"};
}
export function recordFileIssue(file:{name:string;size:number}){
  return !/\.(pdf|hwp|hwpx|docx)$/i.test(file.name)||file.size===0||file.size>20*1024*1024?"20MB 이하 PDF·HWP·HWPX·DOCX 파일이 필요합니다.":"";
}
