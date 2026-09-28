import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { relativeTime, saveDomain } from "../../src/meta";

const previousTimeZone = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/Los_Angeles"; });
afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
});

describe("coarse saved time", () => {
  it("uses calendar days across a daylight-saving transition", () => {
    expect(relativeTime(new Date(2026, 2, 8, 12).getTime(), new Date(2026, 2, 9, 12).getTime()))
      .toBe("Yesterday");
  });

  it("uses a weekday within the last week and a year only when it differs", () => {
    expect(relativeTime(new Date(2026, 8, 22, 12).getTime(), new Date(2026, 8, 27, 12).getTime()))
      .toBe("Tuesday");
    expect(relativeTime(new Date(2025, 7, 12, 12).getTime(), new Date(2026, 8, 27, 12).getTime()))
      .toMatch(/2025/);
  });
});

describe("meta line domain", () => {
  it("drops www and shows the X handle instead of the domain", () => {
    expect(saveDomain({ url: "https://www.henry.codes/work", site: "henry.codes" })).toBe("henry.codes");
    expect(saveDomain({ url: "https://x.com/henrycodes/status/123?s=20", site: "x.com" })).toBe("@henrycodes");
    expect(saveDomain({ url: "https://twitter.com/i/web/status/1", site: "twitter.com" })).toBe("twitter.com");
    expect(saveDomain({ url: "%bad%", site: "legacy.example" })).toBe("legacy.example");
  });
});
