import React from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/assets/theme.css";
import "./hub.css";

function App() {
  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand"><BookOpen size={22} strokeWidth={1.7} /><span>Tab Hub</span></div>
        <span className="eyebrow">Your reference library</span>
      </header>
      <section className="intro">
        <p className="eyebrow">A quieter place for the open web</p>
        <h1>Keep the thought.<br /><em>Close the tabs.</em></h1>
        <p>Your groups and the pieces worth remembering will live here.</p>
      </section>
      <div className="empty-state">
        <Search size={28} strokeWidth={1.4} />
        <h2>Nothing tucked away yet.</h2>
        <p>Save a tab or group from the Tab Hub button in your toolbar.</p>
        <Button onClick={() => chrome.tabs.create({ url: "https://example.com" })}>Explore an example</Button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
