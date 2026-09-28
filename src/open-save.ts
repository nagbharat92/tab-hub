import type { RegionAnchor } from "./media";
import type { ThreadSave } from "./threads";

function revealRegion(anchor: RegionAnchor): void {
  let element: Element | null = null;
  if (anchor.selector) {
    try { element = document.querySelector(anchor.selector); } catch { /* The page may have changed. */ }
  }
  if (!element && anchor.text) {
    const text = anchor.text.slice(0, 80);
    element = [...document.querySelectorAll("p, h1, h2, h3, h4, blockquote, figure, img, article, section")]
      .slice(0, 3000).find(candidate => candidate.textContent?.replace(/\s+/g, " ").includes(text)) ?? null;
  }
  if (!element) return;
  if (element === document.body || element === document.documentElement) {
    window.scrollTo({ top: anchor.scrollY, left: anchor.scrollX, behavior: "smooth" });
  } else element.scrollIntoView({ block: "center", behavior: "smooth" });
  const outline = document.createElement("div");
  outline.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid currentColor;border-radius:4px;box-sizing:border-box;";
  document.documentElement.append(outline);
  requestAnimationFrame(() => {
    const bounds = element.getBoundingClientRect();
    Object.assign(outline.style, {
      left: `${bounds.x - 5}px`, top: `${bounds.y - 5}px`,
      width: `${bounds.width + 10}px`, height: `${bounds.height + 10}px`
    });
    const animation = outline.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 2200, fill: "forwards" });
    animation.finished.then(() => outline.remove()).catch(() => outline.remove());
  });
}

export async function openThreadSave(save: ThreadSave): Promise<void> {
  const address = new URL(save.url);
  address.hash = "";
  if (save.kind === "passage" && save.anchor?.kind === "text") {
    address.hash = `:~:text=${encodeURIComponent(save.anchor.text)}`;
  }
  const tab = await chrome.tabs.create({ url: address.href });
  if (save.kind !== "region" || save.anchor?.kind !== "region" || tab.id === undefined) return;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await chrome.tabs.get(tab.id)).status === "complete") {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: revealRegion, args: [save.anchor.value] });
        return;
      }
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
