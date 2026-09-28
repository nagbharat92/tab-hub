import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Crop, Layers3, Save, TextSelect } from "lucide-react";
import type { WorkerRequest, WorkerResponse } from "@/src/types";
import "@/assets/theme.css";
import "./popup.css";

function canMark(url?: string): boolean {
  if (!url) return false;
  try {
    const address = new URL(url);
    return (address.protocol === "https:" || address.protocol === "http:") &&
      address.hostname !== "chromewebstore.google.com" &&
      !(address.hostname === "chrome.google.com" && address.pathname.startsWith("/webstore"));
  } catch { return false; }
}

function Popup() {
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [group, setGroup] = useState<{ name: string; count: number }>();
  const [selectedText, setSelectedText] = useState(false);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void chrome.commands.getAll().then(commands => setShortcuts(Object.fromEntries(
      commands.filter(command => command.shortcut).map(command => [command.name, command.shortcut ?? ""])
    ))).catch(() => undefined);
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([active]) => {
      if (!active || (active.pendingUrl ?? active.url)?.startsWith(chrome.runtime.getURL(""))) return;
      setTab(active);
      if (active.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        const [savedGroup, members] = await Promise.all([
          chrome.tabGroups.get(active.groupId), chrome.tabs.query({ groupId: active.groupId })
        ]);
        setGroup({ name: savedGroup.title?.trim() || "Untitled group", count: members.length });
      }
      if (active.id !== undefined && canMark(active.url)) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: active.id },
            func: () => Boolean(window.getSelection()?.toString().trim())
          });
          setSelectedText(Boolean(result?.result));
        } catch { setSelectedText(false); }
      }
    }).catch(cause => setError(`Could not inspect this tab: ${String(cause)}`));
  }, []);

  async function send(request: WorkerRequest) {
    setBusy(true);
    setError("");
    try {
      const response = await chrome.runtime.sendMessage<WorkerRequest, WorkerResponse>(request);
      if (!response.ok) throw new Error(response.error);
      window.close();
    } catch (cause) {
      setError(`${request.type === "start-region" ? "Could not start region capture" : "Save failed. Tabs remain open"}: ${String(cause)}`);
    } finally { setBusy(false); }
  }

  const allowed = canMark(tab?.url);
  const shortcut = (name: string) => shortcuts[name] ? <kbd>{shortcuts[name]}</kbd> : null;
  return <div className="popup" aria-label="Tab Hub actions">
    {tab?.id !== undefined && <>
      {group && <button className="group-action" type="button" disabled={busy} onClick={() => void send({ type: "capture-group", groupId: tab.groupId })}>
        <Layers3 size={17} aria-hidden="true" /><span>Save {group.name} · {group.count} {group.count === 1 ? "tab" : "tabs"}</span>
        {shortcut("save-current-group")}
      </button>}
      <button type="button" disabled={busy} onClick={() => void send({ type: "capture-tab", tabId: tab.id! })}>
        <Save size={17} aria-hidden="true" /><span>Save this tab</span>{shortcut("save-current-tab")}
      </button>
      <span className="popup-divider" aria-hidden="true" />
      <button type="button" disabled={busy || !allowed || !selectedText} onClick={() => void send({ type: "mark-text", tabId: tab.id! })}>
        <TextSelect size={17} aria-hidden="true" /><span>Save the text you selected</span>{shortcut("mark-selected-text")}
      </button>
      <button type="button" disabled={busy || !allowed} onClick={() => void send({ type: "start-region", tabId: tab.id! })}>
        <Crop size={17} aria-hidden="true" /><span>Save part of the page</span>
      </button>
      <span className="popup-divider" aria-hidden="true" />
    </>}
    <button type="button" onClick={() => void send({ type: "open-hub" })}>
      <ArrowUpRight size={17} aria-hidden="true" /><span>Open Tab Hub</span>{shortcut("open-hub")}
    </button>
    {error && <p role="status" className="popup-error">{error}</p>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<Popup />);
