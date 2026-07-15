-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "alien_user_id" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_onboarding_seen" (
    "user_id" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_onboarding_seen_pkey" PRIMARY KEY ("user_id","intro")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "head_version_id" TEXT,
    "ingested_version_id" TEXT,
    "cluster_dataset_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "openaire_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "doi" TEXT,
    "title" TEXT,
    "author" TEXT,
    "year" INTEGER,
    "date_label" TEXT,
    "doc_type" TEXT,
    "instance_type" TEXT,
    "lang" TEXT,
    "publisher" TEXT,
    "venue" TEXT,
    "abstract" TEXT,
    "open_access_color" TEXT,
    "is_green" BOOLEAN,
    "best_access_right" TEXT,
    "peer_reviewed" BOOLEAN,
    "citation_count" INTEGER,
    "influence_class" TEXT,
    "cited_by_count" INTEGER,
    "references_count" INTEGER,
    "related_count" INTEGER,
    "fulltext_url" TEXT,
    "source_repo_url" TEXT,
    "funder" TEXT,
    "raw_metadata" JSONB,
    "resolved_at" TIMESTAMP(3),
    "resolve_status" TEXT NOT NULL DEFAULT 'pending',
    "resolve_error" TEXT,
    "resolve_attempts" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMP(3),
    "index_error" TEXT,

    CONSTRAINT "document_pkey" PRIMARY KEY ("project_id","openaire_id")
);

-- CreateTable
CREATE TABLE "corpus_version" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_by" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_membership" (
    "version_id" TEXT NOT NULL,
    "openaire_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "corpus_membership_pkey" PRIMARY KEY ("version_id","openaire_id")
);

-- CreateTable
CREATE TABLE "app_session" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "active_message_id" TEXT,
    "system_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_contribution" (
    "project_id" TEXT NOT NULL,
    "openaire_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_contribution_pkey" PRIMARY KEY ("project_id","openaire_id","session_id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "app_session_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "model" TEXT,
    "usage" JSONB,
    "thinking" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_call" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'custom',
    "server_name" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "content_offset" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "tool_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_item" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "origin" TEXT,
    "position" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "app_session_id" TEXT,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "citation_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_version" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "body_md" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "openaire_id" TEXT NOT NULL,
    "locator" TEXT,
    "label" TEXT,

    CONSTRAINT "citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_job" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "target_version_id" TEXT NOT NULL,
    "base_version_id" TEXT,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "progress" DECIMAL(65,30),
    "added_count" INTEGER,
    "removed_count" INTEGER,
    "chunks_written" INTEGER,
    "stats" JSONB,
    "error" TEXT,
    "callback_secret" TEXT,
    "cluster_job_id" TEXT,
    "added_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removed_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ingest_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "langfuse_session_id" TEXT,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_alien_user_id_key" ON "user"("alien_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "project_head_version_id_key" ON "project"("head_version_id");

-- CreateIndex
CREATE INDEX "document_project_id_year_idx" ON "document"("project_id", "year");

-- CreateIndex
CREATE INDEX "document_resolve_status_project_id_idx" ON "document"("resolve_status", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_version_project_id_seq_key" ON "corpus_version"("project_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "app_session_active_message_id_key" ON "app_session"("active_message_id");

-- CreateIndex
CREATE INDEX "corpus_contribution_session_id_idx" ON "corpus_contribution"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_app_session_id_seq_key" ON "message"("app_session_id", "seq");

-- CreateIndex
CREATE INDEX "tool_call_created_at_idx" ON "tool_call"("created_at");

-- CreateIndex
CREATE INDEX "memory_item_project_id_scope_section_idx" ON "memory_item"("project_id", "scope", "section");

-- CreateIndex
CREATE UNIQUE INDEX "note_version_note_id_seq_key" ON "note_version"("note_id", "seq");

-- CreateIndex
CREATE INDEX "citation_note_id_idx" ON "citation"("note_id");

-- CreateIndex
CREATE INDEX "citation_openaire_id_idx" ON "citation"("openaire_id");

-- CreateIndex
CREATE INDEX "feedback_project_id_target_idx" ON "feedback"("project_id", "target");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_user_id_target_target_id_key" ON "feedback"("user_id", "target", "target_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding_seen" ADD CONSTRAINT "user_onboarding_seen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_version" ADD CONSTRAINT "corpus_version_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_version" ADD CONSTRAINT "corpus_version_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "corpus_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_membership" ADD CONSTRAINT "corpus_membership_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "corpus_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_membership" ADD CONSTRAINT "corpus_membership_project_id_openaire_id_fkey" FOREIGN KEY ("project_id", "openaire_id") REFERENCES "document"("project_id", "openaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_active_message_id_fkey" FOREIGN KEY ("active_message_id") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_contribution" ADD CONSTRAINT "corpus_contribution_project_id_openaire_id_fkey" FOREIGN KEY ("project_id", "openaire_id") REFERENCES "document"("project_id", "openaire_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_contribution" ADD CONSTRAINT "corpus_contribution_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_app_session_id_fkey" FOREIGN KEY ("app_session_id") REFERENCES "app_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call" ADD CONSTRAINT "tool_call_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_item" ADD CONSTRAINT "memory_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_app_session_id_fkey" FOREIGN KEY ("app_session_id") REFERENCES "app_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_version" ADD CONSTRAINT "note_version_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation" ADD CONSTRAINT "citation_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_job" ADD CONSTRAINT "ingest_job_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_job" ADD CONSTRAINT "ingest_job_target_version_id_fkey" FOREIGN KEY ("target_version_id") REFERENCES "corpus_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_job" ADD CONSTRAINT "ingest_job_base_version_id_fkey" FOREIGN KEY ("base_version_id") REFERENCES "corpus_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

