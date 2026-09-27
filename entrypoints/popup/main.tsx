import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, BookOpen, Crop, Highlighter, Layers3, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkerRequest, WorkerResponse } from "@/src/types";
import "@/assets/theme.css";
import "./popup.css";

function Popup() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([active]) => {
      if (!active || active.url?.startsWith(chrome.runtime.getURL(""))) return;
      setTab(active);
      if (active.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        const group = await chrome.tabGroups.get(active.groupId);
        setGroupName(group.title || "Untitled group");
      }
    }).catch(error => setFeedback(String(error)));
  }, []);

  async function save(request: WorkerRequest) {
    setBusy(true);
    setFeedback("");
    try {
      const response = await chrome.runtime.sendMessage<WorkerRequest, WorkerResponse>(request);
      if (!response.ok) throw new Error(response.error);
      if (response.result && "saved" in response.result) {
        setFeedback(`Saved ${response.result.saved} links; ${response.result.closed} tabs closed.${response.result.warnings.length ? ` ${response.result.warnings.join(" ")}` : ""}`);
      } else if (response.result && "fragmentId" in response.result) {
        setFeedback(`Passage saved${response.result.createdCard ? " as a new reference" : " on its existing card"}. Your tab remains open.`);
      } else {
        window.close();
      }
    } catch (error) {
      setFeedback(`${request.type === "start-region" ? "Could not start region capture" : "Save failed. Tabs remain open"}. ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="popup">
      <div className="popup-brand"><BookOpen size={20} /><strong>Tab Hub</strong></div>
      <p>Your references, without the open tabs.</p>
      {tab?.id !== undefined && (
        <div className="popup-actions">
          {groupName && <Button disabled={busy} className="w-full justify-between" onClick={() => save({ type: "capture-group", groupId: tab.groupId })}>
            Save “{groupName}” <Layers3 size={16} />
          </Button>}
          <Button disabled={busy} variant="outline" className="w-full justify-between" onClick={() => save({ type: "capture-tab", tabId: tab.id! })}>
            Save this tab <Scissors size={16} />
          </Button>
          <div className="popup-divider" />
          <Button disabled={busy} variant="ghost" className="w-full justify-between" onClick={() => save({ type: "mark-text", tabId: tab.id! })}>
            Mark selected text <Highlighter size={16} />
          </Button>
          <Button disabled={busy} variant="ghost" className="w-full justify-between" onClick={() => save({ type: "start-region", tabId: tab.id! })}>
            Mark a visible region <Crop size={16} />
          </Button>
        </div>
      )}
      <Button variant="ghost" className="w-full justify-between" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") })}>
        Open your hub <ArrowUpRight size={16} />
      </Button>
      {feedback && <p role="status" className="popup-feedback">{feedback}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
