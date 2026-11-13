-- Consult messages are filtered by sender during account erasure and appointment views.
CREATE INDEX IF NOT EXISTS "consult_messages_senderId_idx" ON "consult_messages"("senderId");
