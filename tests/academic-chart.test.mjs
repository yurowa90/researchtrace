import assert from 'node:assert/strict';
import test from 'node:test';
import {academicChart,courseGradeValue} from '../lib/academic-chart.ts';
import {activityReview} from '../lib/activity-review.ts';

const course=(patch={})=>({id:1,studentId:1,snapshotId:10,schoolYear:2025,gradeLevel:1,semester:1,subjectGroup:'과학',subject:'통합과학',courseType:'공통',selectionStatus:'completed',credits:3,gradingSystem:'five',rawScore:'80',rankGrade:'2',achievement:'A',classAverage:'',standardDeviation:'',studentCount:null,evidenceText:'',evidenceRefs:['s1'],...patch});
const chart=(rows,patch={})=>academicChart(rows,{studentId:1,snapshotId:10,metric:'raw',grouping:'group',average:'simple',...patch});

test('chart scopes current student and active version, including current-grade records',()=>{
 const m=chart([course(),course({id:2,schoolYear:2027,gradeLevel:3}),course({id:3,studentId:2,rawScore:'1'}),course({id:4,snapshotId:9,rawScore:'1'}),course({id:5,schoolYear:2028,selectionStatus:'planned'})]);
 assert.equal(m.includedCount,2);assert.equal(m.terms.at(-1).schoolYear,2027);assert.equal(m.nonCompletedCount,1);assert.equal(m.points.at(-1).value,80);
});
test('missing semesters and missing scores stay null; a verified zero stays zero',()=>{
 const m=chart([course({rawScore:'0'}),course({id:2,schoolYear:2026,gradeLevel:2,rawScore:'90'}),course({id:3,schoolYear:2026,gradeLevel:2,semester:2,rawScore:'미확인'})]);
 assert.deepEqual(m.rows.map(r=>r.series0),[0,null,90,null]);assert.equal(m.excluded.length,1);
 assert.equal(courseGradeValue(course({rawScore:'90점'}),'raw'),90);assert.equal(courseGradeValue(course({rawScore:'약 90 / 100'}),'raw'),null);assert.equal(courseGradeValue(course({rawScore:'101'}),'raw'),null);
});
test('five and nine grade scales never mix and unknown scales are not inferred',()=>{
 const rows=[course(),course({id:2,subject:'화학',gradingSystem:'nine',rankGrade:'7'}),course({id:3,subject:'생물',gradingSystem:'unknown',rankGrade:'1'})];
 assert.equal(chart(rows,{metric:'five'}).points[0].value,2);assert.equal(chart(rows,{metric:'nine'}).points[0].value,7);assert.equal(chart(rows,{metric:'five'}).excluded.length,2);
 assert.equal(courseGradeValue(course({rankGrade:'6'}),'five'),null);assert.equal(courseGradeValue(course({rankGrade:'1.5'}),'five'),null);
});
test('weighted averages use only known positive credits and retain distinct simple averages',()=>{
 const rows=[course({credits:1}),course({id:2,subject:'화학',rawScore:'100',credits:3}),course({id:3,subject:'생물',rawScore:'0',credits:null}),course({id:4,subject:'지구과학',rawScore:'0',credits:0})];
 assert.equal(chart(rows).points[0].value,45);const weighted=chart(rows,{average:'credits'});assert.equal(weighted.points[0].value,95);assert.equal(weighted.excluded.length,2);assert.equal(weighted.points[0].courses.length,2);
});
test('duplicates merge evidence; conflicting grades or course statuses are excluded',()=>{
 const clean=chart([course(),course({id:2,evidenceRefs:['s2']})]);assert.equal(clean.duplicates,1);assert.deepEqual(clean.points[0].courses[0].evidenceRefs,['s1','s2']);
 const conflict=chart([course(),course({id:2,rawScore:'99'})]);assert.equal(conflict.includedCount,0);assert.match(conflict.excluded[0].reason,/충돌/);
 assert.equal(chart([course(),course({id:2,selectionStatus:'selected'})]).includedCount,0);
 assert.equal(chart([course(),course({id:2,credits:4})],{average:'credits'}).includedCount,0);
});
test('individual subject series do not connect a different subject across semesters',()=>{
 const m=chart([course(),course({id:2,semester:2,subject:'화학'})],{grouping:'subject'});
 assert.equal(m.series.length,2);for(const s of m.series)assert.equal(m.rows.filter(r=>r[s.key]!==null).length,1);
});
test('activity filters preserve student/version scope and search all evidence terms',()=>{
 const section=(patch={})=>({id:1,studentId:1,snapshotId:10,schoolYear:2025,sectionType:'subject_detail',sourceState:'recorded',subject:'생명과학',title:'내성 탐구',summary:'자료 비교',evidence:['대조군을 두고 분석'],keywords:['자연선택'],competencies:['비판적 사고'],sortOrder:0,...patch});
 const rows=[section(),section({id:2,schoolYear:2026,sectionType:'creative_activity',subject:'',sourceState:'planned'}),section({id:3,studentId:2}),section({id:4,snapshotId:9})];
 const opts={studentId:1,snapshotId:10,grouping:'year',year:'all',area:'all',state:'all',query:''};
 assert.equal(activityReview(rows,opts).own.length,2);assert.equal(activityReview(rows,opts).groups.length,2);
 const filtered=activityReview(rows,{...opts,state:'recorded',query:'자연선택 대조군'});assert.deepEqual(filtered.filtered.map(s=>s.id),[1]);
 assert.equal(activityReview(rows,{...opts,area:'reading'}).groups.length,0);
});
