import { describe, expect, it } from "vitest";

import { appleDays, feedApple, newAppleState } from "./apple-health";

const xml = `<?xml version="1.0"?><HealthData>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-07 23:30:00 +0200" endDate="2026-10-08 03:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-08 03:30:00 +0200" endDate="2026-10-08 07:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-07 23:00:00 +0200" endDate="2026-10-08 07:10:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-08 08:00:00 +0200" endDate="2026-10-08 08:00:00 +0200" value="52"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-08 20:00:00 +0200" endDate="2026-10-08 20:00:00 +0200" value="55"/>
<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-10-08 08:00:00 +0200" endDate="2026-10-08 09:00:00 +0200" value="900"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-01-01 08:00:00 +0200" endDate="2026-01-01 08:00:00 +0200" value="60"/>
</HealthData>`;

describe("Apple Health", () => {
  it("suma solo las fases de sueño y promedia la FC en reposo, aunque el XML llegue troceado", () => {
    const st = newAppleState();
    for (let i = 0; i < xml.length; i += 37) feedApple(st, xml.slice(i, i + 37), "2026-06-01");
    expect(appleDays(st)).toEqual([{ date: "2026-10-08", sleepMin: 450, restingHr: 54 }]);
  });
});
