CREATE TRIGGER trace_freeze_users_insert
BEFORE INSERT ON "users"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_users_update
BEFORE UPDATE ON "users"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_users_delete
BEFORE DELETE ON "users"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_classes_insert
BEFORE INSERT ON "classes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_classes_update
BEFORE UPDATE ON "classes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_classes_delete
BEFORE DELETE ON "classes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_students_insert
BEFORE INSERT ON "students"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_students_update
BEFORE UPDATE ON "students"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_students_delete
BEFORE DELETE ON "students"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_subjects_insert
BEFORE INSERT ON "subjects"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_subjects_update
BEFORE UPDATE ON "subjects"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_subjects_delete
BEFORE DELETE ON "subjects"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activities_insert
BEFORE INSERT ON "activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activities_update
BEFORE UPDATE ON "activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activities_delete
BEFORE DELETE ON "activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_fingerprints_insert
BEFORE INSERT ON "fingerprints"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_fingerprints_update
BEFORE UPDATE ON "fingerprints"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_fingerprints_delete
BEFORE DELETE ON "fingerprints"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activity_files_insert
BEFORE INSERT ON "activity_files"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activity_files_update
BEFORE UPDATE ON "activity_files"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_activity_files_delete
BEFORE DELETE ON "activity_files"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_inquiry_threads_insert
BEFORE INSERT ON "inquiry_threads"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_inquiry_threads_update
BEFORE UPDATE ON "inquiry_threads"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_inquiry_threads_delete
BEFORE DELETE ON "inquiry_threads"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_thread_activities_insert
BEFORE INSERT ON "thread_activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_thread_activities_update
BEFORE UPDATE ON "thread_activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_thread_activities_delete
BEFORE DELETE ON "thread_activities"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_student_records_insert
BEFORE INSERT ON "student_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_student_records_update
BEFORE UPDATE ON "student_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_student_records_delete
BEFORE DELETE ON "student_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_snapshots_insert
BEFORE INSERT ON "profile_snapshots"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_snapshots_update
BEFORE UPDATE ON "profile_snapshots"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_snapshots_delete
BEFORE DELETE ON "profile_snapshots"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_sections_insert
BEFORE INSERT ON "profile_sections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_sections_update
BEFORE UPDATE ON "profile_sections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_profile_sections_delete
BEFORE DELETE ON "profile_sections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_research_keywords_insert
BEFORE INSERT ON "research_keywords"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_research_keywords_update
BEFORE UPDATE ON "research_keywords"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_research_keywords_delete
BEFORE DELETE ON "research_keywords"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_nodes_insert
BEFORE INSERT ON "ontology_nodes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_nodes_update
BEFORE UPDATE ON "ontology_nodes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_nodes_delete
BEFORE DELETE ON "ontology_nodes"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_edges_insert
BEFORE INSERT ON "ontology_edges"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_edges_update
BEFORE UPDATE ON "ontology_edges"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_ontology_edges_delete
BEFORE DELETE ON "ontology_edges"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_wiki_pages_insert
BEFORE INSERT ON "wiki_pages"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_wiki_pages_update
BEFORE UPDATE ON "wiki_pages"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_wiki_pages_delete
BEFORE DELETE ON "wiki_pages"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_course_records_insert
BEFORE INSERT ON "academic_course_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_course_records_update
BEFORE UPDATE ON "academic_course_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_course_records_delete
BEFORE DELETE ON "academic_course_records"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_trends_insert
BEFORE INSERT ON "academic_trends"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_trends_update
BEFORE UPDATE ON "academic_trends"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_academic_trends_delete
BEFORE DELETE ON "academic_trends"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_credit_summaries_insert
BEFORE INSERT ON "credit_summaries"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_credit_summaries_update
BEFORE UPDATE ON "credit_summaries"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_credit_summaries_delete
BEFORE DELETE ON "credit_summaries"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_evaluation_references_insert
BEFORE INSERT ON "evaluation_references"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_evaluation_references_update
BEFORE UPDATE ON "evaluation_references"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_evaluation_references_delete
BEFORE DELETE ON "evaluation_references"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_competency_evaluations_insert
BEFORE INSERT ON "competency_evaluations"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_competency_evaluations_update
BEFORE UPDATE ON "competency_evaluations"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_competency_evaluations_delete
BEFORE DELETE ON "competency_evaluations"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_materials_insert
BEFORE INSERT ON "reference_materials"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_materials_update
BEFORE UPDATE ON "reference_materials"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_materials_delete
BEFORE DELETE ON "reference_materials"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_selections_insert
BEFORE INSERT ON "reference_selections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_selections_update
BEFORE UPDATE ON "reference_selections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
CREATE TRIGGER trace_freeze_reference_selections_delete
BEFORE DELETE ON "reference_selections"
WHEN EXISTS (SELECT 1 FROM storage_connection WHERE id = 1 AND state IN ('migrating', 'google'))
BEGIN
  SELECT RAISE(ABORT, 'Legacy storage is frozen during and after Google migration');
END;
--> statement-breakpoint
