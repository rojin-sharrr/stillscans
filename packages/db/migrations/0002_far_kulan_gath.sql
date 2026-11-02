CREATE TABLE "waitlist" (
	"email" text NOT NULL,
	"plan" text NOT NULL,
	"source" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "waitlist_email_plan_pk" PRIMARY KEY("email","plan")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "code_allowance" SET DEFAULT 5;
--> statement-breakpoint
UPDATE "users" SET "code_allowance" = 5 WHERE "code_allowance" = 3;
