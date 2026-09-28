import type { RegionAnchor } from "./media";

export interface PageRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  anchor?: RegionAnchor;
}

export function showRegionOverlay(): void {
  const previous = document.getElementById("tab-hub-region-overlay");
  if (previous) {
    previous.dispatchEvent(new Event("tab-hub-dispose"));
    previous.remove();
  }
  const host = document.createElement("div");
  host.id = "tab-hub-region-overlay";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; color-scheme: light dark; }
      .surface { position: fixed; inset: 0; cursor: crosshair; background: color-mix(in srgb, CanvasText 10%, transparent); touch-action: none; }
      .selection { position: fixed; box-sizing: border-box; border: 2px solid Highlight; background: color-mix(in srgb, Highlight 16%, transparent); pointer-events: none; display: none; }
      .hint { display: none; position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: Canvas; color: CanvasText; border: 1px solid GrayText; border-radius: 10px; padding: 12px 18px; font-size: 13px; white-space: nowrap; pointer-events: none; }
      .cancel { position: fixed; top: 16px; right: 16px; border: 1px solid GrayText; border-radius: 10px; background: Canvas; color: CanvasText; padding: 10px 14px; cursor: pointer; }
    </style>
    <div class="surface"></div><div class="selection"></div>
    <div class="hint" role="status"></div>
    <button class="cancel" type="button">Cancel</button>`;
  document.documentElement.append(host);
  const surface = shadow.querySelector<HTMLElement>(".surface");
  const selection = shadow.querySelector<HTMLElement>(".selection");
  const hint = shadow.querySelector<HTMLElement>(".hint");
  const cancel = shadow.querySelector<HTMLButtonElement>(".cancel");
  if (!surface || !selection || !hint || !cancel) {
    host.remove();
    throw new Error("Could not initialize the region selector.");
  }

  let start: { x: number; y: number } | undefined;
  const controller = new AbortController();
  let removalTimer: ReturnType<typeof setTimeout> | undefined;
  function destroy() {
    controller.abort();
    if (removalTimer) clearTimeout(removalTimer);
    host.remove();
  }
  host.addEventListener("tab-hub-dispose", destroy, { signal: controller.signal });
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") destroy();
  }
  document.addEventListener("keydown", onKey, { signal: controller.signal });
  cancel.addEventListener("click", destroy, { signal: controller.signal });
  surface.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    selection.style.display = "block";
  }, { signal: controller.signal });
  surface.addEventListener("pointermove", event => {
    if (!start) return;
    const left = Math.min(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY);
    Object.assign(selection.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.abs(event.clientX - start.x)}px`,
      height: `${Math.abs(event.clientY - start.y)}px`
    });
  }, { signal: controller.signal });
  surface.addEventListener("pointerup", event => {
    if (!start) return;
    const rect: PageRectangle = {
      x: Math.min(start.x, event.clientX),
      y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
    start = undefined;
    if (rect.width < 20 || rect.height < 20) {
      selection.style.display = "none";
      hint.textContent = "Drag at least 20 pixels in each direction.";
      hint.style.display = "block";
      return;
    }
    host.style.pointerEvents = "none";
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const element = hit?.closest("p, blockquote, figure, img, h1, h2, h3, h4, article, section") ??
      (hit === document.documentElement || hit === host ? document.body : hit) ?? document.body;
    let selector: string | undefined;
    if (element) {
      if (element.id) selector = `#${CSS.escape(element.id)}`;
      else {
        const parts: string[] = [];
        for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
          const index = [...(node.parentElement?.children ?? [])].filter(child => child.tagName === node?.tagName).indexOf(node) + 1;
          parts.unshift(`${node.localName}:nth-of-type(${index})`);
        }
        selector = parts.join(" > ");
      }
    }
    rect.anchor = {
      ...(selector ? { selector } : {}),
      ...(element?.textContent?.trim() ? { text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 160) } : {}),
      scrollX: window.scrollX, scrollY: window.scrollY
    };
    surface.style.display = "none";
    cancel.style.display = "none";
    selection.style.display = "none";
    hint.style.display = "none";
    void (async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!host.isConnected) return;
      const response: { ok: boolean; error?: string } = await chrome.runtime.sendMessage({ type: "mark-region", rect, pageUrl: location.href });
      if (!host.isConnected) return;
      hint.style.display = "block";
      if (response.ok) destroy();
      else {
        hint.textContent = `Could not save: ${response.error ?? "Unknown error"}`;
        cancel.style.display = "block";
      }
    })().catch(error => {
      if (!host.isConnected) return;
      hint.style.display = "block";
      hint.textContent = `Could not save: ${String(error)}`;
      cancel.style.display = "block";
    });
  }, { signal: controller.signal });
}
