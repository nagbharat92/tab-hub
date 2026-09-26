export interface PageRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function showRegionOverlay(): void {
  if (document.getElementById("tab-hub-region-overlay")) return;
  const host = document.createElement("div");
  host.id = "tab-hub-region-overlay";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { --cp-bg: #f7f4ef; --cp-text: #242424; --cp-accent: #b11f4b; --cp-accent-soft: rgba(177,31,75,.18); --cp-border: #dedede; font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; }
      .surface { position: fixed; inset: 0; cursor: crosshair; background: var(--cp-accent-soft); touch-action: none; }
      .selection { position: fixed; box-sizing: border-box; border: 2px solid var(--cp-accent); background: var(--cp-accent-soft); pointer-events: none; display: none; }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: var(--cp-bg); color: var(--cp-text); border: 1px solid var(--cp-border); border-radius: 10px; padding: 12px 18px; font-size: 13px; box-shadow: 0 18px 48px var(--cp-accent-soft); white-space: nowrap; pointer-events: none; }
      .cancel { position: fixed; top: 16px; right: 16px; border: 1px solid var(--cp-border); border-radius: 10px; background: var(--cp-bg); color: var(--cp-text); padding: 10px 14px; cursor: pointer; }
    </style>
    <div class="surface"></div><div class="selection"></div>
    <div class="hint" role="status">Drag to frame what matters · Esc to cancel</div>
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
  function destroy() {
    document.removeEventListener("keydown", onKey);
    host.remove();
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") destroy();
  }
  document.addEventListener("keydown", onKey);
  cancel.addEventListener("click", destroy);
  surface.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    selection.style.display = "block";
  });
  surface.addEventListener("pointermove", event => {
    if (!start) return;
    const left = Math.min(start.x, event.clientX);
    const top = Math.min(start.y, event.clientY);
    Object.assign(selection.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.abs(event.clientX - start.x)}px`,
      height: `${Math.abs(event.clientY - start.y)}px`
    });
  });
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
      return;
    }
    surface.style.display = "none";
    cancel.style.display = "none";
    selection.style.display = "none";
    hint.textContent = "Saving your region…";
    void new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      .then(() => chrome.runtime.sendMessage({ type: "mark-region", rect, pageUrl: location.href }))
      .then((response: { ok: boolean; error?: string }) => {
      hint.textContent = response.ok ? "Region saved to Tab Hub." : `Could not save: ${response.error ?? "Unknown error"}`;
      setTimeout(destroy, response.ok ? 1800 : 5000);
    }).catch(error => {
      hint.textContent = `Could not save: ${String(error)}`;
      setTimeout(destroy, 5000);
    });
  });
}
