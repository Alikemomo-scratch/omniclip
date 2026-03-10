CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"platform" varchar(30) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"title" text,
	"body" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"author_name" varchar(255),
	"author_url" varchar(500),
	"original_url" varchar(500) NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_items" (
	"digest_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	CONSTRAINT "digest_items_digest_id_content_item_id_pk" PRIMARY KEY("digest_id","content_item_id")
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"digest_type" varchar(10) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"language" varchar(10) NOT NULL,
	"topic_groups" jsonb NOT NULL,
	"trend_analysis" text,
	"item_count" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(30) NOT NULL,
	"connection_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"auth_data" jsonb,
	"sync_interval_minutes" integer DEFAULT 60 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"platform" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"items_collected" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"preferred_language" varchar(10) DEFAULT 'zh' NOT NULL,
	"digest_frequency" varchar(10) DEFAULT 'daily' NOT NULL,
	"digest_time" time DEFAULT '08:00' NOT NULL,
	"timezone" varchar(50) DEFAULT 'Asia/Shanghai' NOT NULL,
	"content_retention_days" integer DEFAULT 90 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ci_dedup" ON "content_items" USING btree ("user_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "idx_ci_feed" ON "content_items" USING btree ("user_id","published_at");--> statement-breakpoint
CREATE INDEX "idx_ci_platform_date" ON "content_items" USING btree ("user_id","platform","published_at");--> statement-breakpoint
CREATE INDEX "idx_ci_content_type" ON "content_items" USING btree ("user_id","content_type");--> statement-breakpoint
CREATE INDEX "idx_digest_user_period" ON "digests" USING btree ("user_id","period_end");--> statement-breakpoint
CREATE INDEX "idx_digest_status" ON "digests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pc_user_platform" ON "platform_connections" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "idx_pc_status" ON "platform_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sj_connection" ON "sync_jobs" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");