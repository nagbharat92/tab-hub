import { describe, expect, it, vi } from "vitest";
import { chooseGuessProvider, noGuessProvider } from "../../src/guess";

describe("swappable local guess provider", () => {
  it("does nothing when no model exists or it is not installed", async () => {
    expect(await chooseGuessProvider({})).toBe(noGuessProvider);
    expect(await noGuessProvider.generate({ title: "Page", site: "site.test" })).toBeNull();
    expect(await chooseGuessProvider({ LanguageModel: { availability: async () => "downloadable", create: vi.fn() } })).toBe(noGuessProvider);
  });

  it("uses the built-in model and releases its session", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (_input: string) => " An interesting layout transition. ");
    const provider = await chooseGuessProvider({
      LanguageModel: { availability: async () => "available", create: async () => ({ prompt, destroy }) }
    });

    expect(provider.name).toBe("chrome-on-device");
    expect(await provider.generate({ title: "Transition", site: "folio.test", fragment: "A gentle dissolve" })).toBe("An interesting layout transition.");
    expect(prompt.mock.calls[0]?.[0]).toContain("A gentle dissolve");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("accepts a browser-exposed constructor with static model methods", async () => {
    function LanguageModel() {}
    LanguageModel.availability = async () => "available";
    LanguageModel.create = async () => ({ prompt: async () => " A visual cue. ", destroy: () => undefined });
    const provider = await chooseGuessProvider({ LanguageModel });
    expect(await provider.generate({ title: "Card", site: "folio.test" })).toBe("A visual cue.");
  });

  it("destroys the session even when inference fails", async () => {
    const destroy = vi.fn();
    const provider = await chooseGuessProvider({
      LanguageModel: { availability: async () => "available", create: async () => ({ prompt: async () => { throw new Error("Model stopped"); }, destroy }) }
    });
    await expect(provider.generate({ title: "Page", site: "site.test" })).rejects.toThrow("Model stopped");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
