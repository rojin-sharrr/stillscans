CREATE TABLE "checks" (
	"id" text PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"result" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"code_id" text NOT NULL,
	"destination" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codes" (
	"id" text PRIMARY KEY NOT NULL,
	"short_code" text NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"destination" text NOT NULL,
	"design" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"synced_version" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "codes_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_slug" text,
	"domain" text,
	"message" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"short_code" text NOT NULL,
	"scanned_at" bigint NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"device_type" text NOT NULL,
	"os" text DEFAULT 'other' NOT NULL,
	"visitor_hash" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unknown_domains" (
	"domain" text NOT NULL,
	"first_seen" bigint NOT NULL,
	"last_seen" bigint NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "unknown_domains_domain_pk" PRIMARY KEY("domain")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_allowance" integer DEFAULT 3 NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "code_destinations" ADD CONSTRAINT "code_destinations_code_id_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checks_input_hash_idx" ON "checks" USING btree ("input_hash","created_at");--> statement-breakpoint
CREATE INDEX "checks_created_at_idx" ON "checks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "code_destinations_code_id_idx" ON "code_destinations" USING btree ("code_id","created_at");--> statement-breakpoint
CREATE INDEX "codes_user_id_idx" ON "codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "codes_sync_idx" ON "codes" USING btree ("synced_version","version");--> statement-breakpoint
CREATE INDEX "login_tokens_expires_at_idx" ON "login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "scans_short_code_idx" ON "scans" USING btree ("short_code","scanned_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");