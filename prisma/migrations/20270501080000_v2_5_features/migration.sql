-- solo añade índices por userId
-- CreateIndex
CREATE INDEX "CalendarFeed_userId_idx" ON "CalendarFeed"("userId");

-- CreateIndex
CREATE INDEX "HabitLog_userId_idx" ON "HabitLog"("userId");

-- CreateIndex
CREATE INDEX "PlanFeedback_userId_idx" ON "PlanFeedback"("userId");

-- CreateIndex
CREATE INDEX "PrehabLog_userId_idx" ON "PrehabLog"("userId");

-- CreateIndex
CREATE INDEX "ReturnProtocol_userId_idx" ON "ReturnProtocol"("userId");

-- CreateIndex
CREATE INDEX "RoutineTest_userId_idx" ON "RoutineTest"("userId");

-- CreateIndex
CREATE INDEX "SharedReport_userId_idx" ON "SharedReport"("userId");

