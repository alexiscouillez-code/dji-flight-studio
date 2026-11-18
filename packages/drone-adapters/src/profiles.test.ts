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

import { DRONE_PROFILES } from "./profiles";
describe("MSDK profiles", () => {
  it("never claim a tested capability: everything but the manual guide is unverified and sourced", () => {
    for (const p of Object.values(DRONE_PROFILES).filter((x) => x.mode === "sdk-adapter")) {
      expect(supportedCapabilities(p)).toEqual(["manual-companion"]);
      expect(p.capabilities.mission.status).toBe("unverified");
      expect(p.sources.length).toBeGreaterThan(0);
    }
  });
  it("Neo 2 is not an SDK drone", () => {
    expect(DRONE_PROFILES["dji-neo-2"]!.mode).toBe("manual-companion");
  });
});
