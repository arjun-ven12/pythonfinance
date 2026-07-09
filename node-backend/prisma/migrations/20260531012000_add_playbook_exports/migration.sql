-- CreateTable
CREATE TABLE "PlaybookExport" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybookExport_playbookId_createdAt_idx" ON "PlaybookExport"("playbookId", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybookExport_format_idx" ON "PlaybookExport"("format");

-- AddForeignKey
ALTER TABLE "PlaybookExport" ADD CONSTRAINT "PlaybookExport_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
