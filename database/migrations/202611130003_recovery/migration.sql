CREATE TABLE "RecoveryToken" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "tokenHash" TEXT NOT NULL UNIQUE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RecoveryToken_expiresAt_idx" ON "RecoveryToken"("expiresAt");
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
