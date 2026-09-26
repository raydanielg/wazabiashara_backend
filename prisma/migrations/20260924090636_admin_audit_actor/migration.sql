-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actorAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
