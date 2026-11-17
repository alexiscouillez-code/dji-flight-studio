import { describe, expect, it } from "vitest";
import { createManualCompanionAdapter } from "./adapter";
import { DJI_NEO_2, supportedCapabilities } from "./profiles";

describe("Neo 2 profile", () => {
  it("only supports manual companion", () => {
    expect(supportedCapabilities(DJI_NEO_2)).toEqual(["manual-companion"]);
  });
  it("every unsupported capability explains why and offers a manual workflow", () => {
    for (const [cap, s] of Object.entries(DJI_NEO_2.capabilities)) {
      if (cap === "manual-companion") continue;
      expect(s.status).toBe("not-supported");
      if (s.status === "not-supported") { expect(s.reason.length).toBeGreaterThan(10); expect(s.manualWorkflow).toBeTruthy(); }
    }
  });
  it("every known limit is sourced", () => {
    for (const l of DJI_NEO_2.knownLimits) expect(l.source.url).toMatch(/^https:\/\/www\.dji\.com/);
  });
  it("companion adapter exposes no flight function", () => {
    const a = createManualCompanionAdapter("dji-neo-2");
    expect(a.startMission).toBeUndefined();
    expect(a.getTelemetry).toBeUndefined();
    expect(a.connect).toBeUndefined();
  });
});
