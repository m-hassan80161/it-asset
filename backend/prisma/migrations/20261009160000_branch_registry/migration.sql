CREATE TABLE "Branch" (
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("name")
);

INSERT INTO "Branch" ("name", "updatedAt")
SELECT DISTINCT branch_name, CURRENT_TIMESTAMP
FROM (
    SELECT NULLIF(BTRIM("branch"), '') AS branch_name FROM "AdminAccount"
    UNION
    SELECT NULLIF(BTRIM(branch_name), '') FROM "AdminAccount", UNNEST("managedBranches") AS branch_name
    UNION
    SELECT NULLIF(BTRIM("branch"), '') FROM "BranchPattern"
    UNION
    SELECT NULLIF(BTRIM("branch"), '') FROM "Ticket"
) AS existing_branches
WHERE branch_name IS NOT NULL
ON CONFLICT ("name") DO NOTHING;
