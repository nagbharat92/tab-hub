import React from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/assets/theme.css";
import "./popup.css";

function Popup() {
  return (
    <div className="popup">
      <div className="popup-brand"><BookOpen size={20} /><strong>Tab Hub</strong></div>
      <p>Your references, without the open tabs.</p>
      <Button className="w-full justify-between" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") })}>
        Open your hub <ArrowUpRight size={16} />
      </Button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
