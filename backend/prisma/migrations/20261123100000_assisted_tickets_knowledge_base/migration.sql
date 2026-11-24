ALTER TABLE "Ticket"
ADD COLUMN "requesterEmail" TEXT,
ADD COLUMN "requesterLocation" TEXT;

CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeAttachment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeArticle_createdAt_idx" ON "KnowledgeArticle"("createdAt");
CREATE INDEX "KnowledgeArticle_authorId_idx" ON "KnowledgeArticle"("authorId");
CREATE INDEX "KnowledgeAttachment_articleId_idx" ON "KnowledgeAttachment"("articleId");

ALTER TABLE "KnowledgeArticle"
ADD CONSTRAINT "KnowledgeArticle_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeAttachment"
ADD CONSTRAINT "KnowledgeAttachment_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
