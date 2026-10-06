-- The site's pin code, which the calculator now asks for. Null on projects
-- saved before it did: their layouts never recorded one, so there is nothing
-- to backfill.
ALTER TABLE "Project" ADD COLUMN "pincode" VARCHAR(6);

CREATE INDEX "Project_pincode_idx" ON "Project"("pincode");
