import { describe, expect, it } from "vitest";
import { normalizePageUrl } from "../../src/urls";

describe("page URL identity", () => {
  it("joins hashed and tracked links while retaining meaningful queries", () => {
    expect(normalizePageUrl("https://henry.codes/?utm_source=design#intro")).toBe("https://henry.codes/");
    expect(normalizePageUrl("https://x.com/henrycodes/status/123?s=20&t=abc#note"))
      .toBe("https://x.com/henrycodes/status/123");
    expect(normalizePageUrl("https://SHOP.example/boards?page=2&ref=mail&utm_campaign=sale#section"))
      .toBe("https://shop.example/boards?page=2");
    expect(normalizePageUrl("https://site.example/search?q=ink&page=2&fbclid=abc&si=abc"))
      .toBe("https://site.example/search?q=ink&page=2");
    expect(normalizePageUrl("https://site.example/?UTM_Medium=x&gclid=y&msclkid=z&igshid=a"))
      .toBe("https://site.example/");
  });

  it("keeps malformed legacy URLs in stable, separate buckets", () => {
    expect(normalizePageUrl("%%not a url%%")).toBe(normalizePageUrl("%%not a url%%"));
    expect(normalizePageUrl("%%not a url%%")).not.toBe(normalizePageUrl("another invalid URL"));
  });
});
