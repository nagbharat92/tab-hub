import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Download, Layers3, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceCard } from "@/components/reference-card";
import { exportBackup, importBackup } from "@/src/backup";
import { chooseGuessProvider, noGuessProvider, type GuessProvider } from "@/src/guess";
import { loadLibrary } from "@/src/library";
import { getFragments, type FragmentRecord } from "@/src/media";
import { searchCards } from "@/src/search";
import type { SavedCard, SavedGroup } from "@/src/types";
import "@/assets/theme.css";
import "./hub.css";

const PAGE_SIZE = 48;

function App() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [fragments, setFragments] = useState<Map<string, FragmentRecord>>(new Map());
  const [selected, setSelected] = useState("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [backupError, setBackupError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [provider, setProvider] = useState<GuessProvider>(noGuessProvider);
  const sentinel = useRef<HTMLDivElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void chooseGuessProvider().then(found => { if (mounted) setProvider(found); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const library = await loadLibrary();
        if (!mounted) return;
        setGroups(library.groups);
        setCards(library.cards);
        setError("");
        try {
          const savedFragments = await getFragments();
          if (mounted) setFragments(new Map(savedFragments.map(fragment => [fragment.cardId, fragment])));
        } catch (cause) {
          if (mounted) setError(`References are available, but fragments could not be read: ${String(cause)}`);
        }
      } catch (cause) {
        if (mounted) setError(`Local references could not be read: ${String(cause)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void refresh();
    const changed = (_changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local") void refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { mounted = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);

  useEffect(() => { setVisible(PAGE_SIZE); }, [query, selected]);
  const groupById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const scoped = useMemo(() => cards.filter(card => selected === "all" || selected === "loose" && groupById.get(card.groupId)?.kind === "single" || selected === card.groupId), [cards, selected, groupById]);
  const matching = useMemo(() => searchCards(scoped, query, fragments), [scoped, query, fragments]);
  const shown = matching.slice(0, visible);
  const nativeGroups = groups.filter(group => group.kind === "group");
  const looseCount = cards.filter(card => groupById.get(card.groupId)?.kind === "single").length;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || visible >= matching.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(count => Math.min(count + PAGE_SIZE, matching.length));
    }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, matching.length]);

  async function downloadBackup() {
    setBackupBusy(true);
    setBackupError("");
    setBackupStatus("");
    try {
      const { file, filename, result } = await exportBackup();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupStatus(`Prepared a local backup of ${result.cards} references and ${result.fragments} marked pieces. Keep the downloaded file somewhere safe.`);
    } catch (cause) {
      setBackupError(`Backup export failed: ${String(cause)}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    setBackupError("");
    setBackupStatus("");
    try {
      const result = await importBackup(file);
      setBackupStatus(`Restored or verified ${result.cards} references, ${result.fragments} marked pieces and ${result.images} images.${result.alreadyPresent ? ` ${result.alreadyPresent} existing records were unchanged.` : ""}`);
    } catch (cause) {
      setBackupError(`Backup import failed: ${String(cause)}`);
    } finally {
      input.value = "";
      setBackupBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand"><BookOpen size={22} strokeWidth={1.7} /><span>Tab Hub</span></div>
        <div className="header-tools">
          <span className="eyebrow">A home for what caught your eye</span>
          <Button size="sm" variant="outline" disabled={backupBusy} aria-label="Export backup" onClick={() => void downloadBackup()}><Download size={15} /><span className="action-copy">Export</span></Button>
          <Button size="sm" variant="outline" disabled={backupBusy} aria-label="Import backup" onClick={() => archiveInput.current?.click()}><Upload size={15} /><span className="action-copy">Import</span></Button>
          <Input ref={archiveInput} type="file" accept=".tabhub,application/zip" className="sr-only" aria-label="Choose a Tab Hub backup" onChange={event => void restoreBackup(event)} />
        </div>
      </header>
      {backupStatus && <p className="backup-status" role="status">{backupStatus}</p>}
      {backupError && <p className="library-error" role="alert">{backupError}</p>}
      <section className={`intro ${cards.length ? "intro-compact" : ""}`}>
        <p className="eyebrow">Your reference library</p>
        {cards.length ? <h1>Your references<span className="title-stop">.</span></h1>
          : <h1>Keep the thought.<br /><em>Close the tabs.</em></h1>}
        <p>{cards.length ? `${cards.length} references, saved from ${nativeGroups.length} groups${looseCount ? ` and ${looseCount} individual tabs` : ""}.` : "Your groups and the pieces worth remembering will live here."}</p>
      </section>
      {error && <p className="library-error" role="alert">{error}</p>}
      {!loading && cards.length === 0 && !error
        ? <section className="empty-state">
            <BookOpen size={30} strokeWidth={1.3} />
            <h2>Nothing tucked away yet.</h2>
            <p>Save a tab or group from the Tab Hub button in your toolbar.</p>
          </section>
        : <div className="library-layout">
            <aside className="collections" aria-label="Collections">
              <p className="eyebrow">Collections</p>
              <Button variant="ghost" className={`collection ${selected === "all" ? "is-selected" : ""}`} onClick={() => setSelected("all")}>
                <span className="collection-label"><Layers3 size={17} /> All references</span><span>{cards.length}</span>
              </Button>
              {nativeGroups.map(group => {
                const count = cards.filter(card => card.groupId === group.id).length;
                return <Button key={group.id} variant="ghost" className={`collection ${selected === group.id ? "is-selected" : ""}`} onClick={() => setSelected(group.id)}>
                  <span className="collection-label"><span className="group-marker" data-color={group.color} /> <span className="collection-name">{group.name}</span></span><span>{count}</span>
                </Button>;
              })}
              {looseCount > 0 && <Button variant="ghost" className={`collection ${selected === "loose" ? "is-selected" : ""}`} onClick={() => setSelected("loose")}>
                <span className="collection-label"><span className="group-marker" data-color="grey" /> Individual tabs</span><span>{looseCount}</span>
              </Button>}
              <div className="sidebar-note">The web, without the clutter.<br />Everything stays on this device.</div>
            </aside>
            <section className="library-main" aria-label="Saved references">
              <div className="library-toolbar">
                <div>
                  <p className="eyebrow">{selected === "all" ? "Everything" : selected === "loose" ? "Individual tabs" : groupById.get(selected)?.name ?? "Collection"}</p>
                  <h2>{query ? `${matching.length} ${matching.length === 1 ? "match" : "matches"}` : `${scoped.length} ${scoped.length === 1 ? "reference" : "references"}`}</h2>
                </div>
                <label className="search-field">
                  <Search size={17} aria-hidden="true" />
                  <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search everything" aria-label="Search references" />
                  {query && <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></Button>}
                </label>
              </div>
              {matching.length
                ? <><div className="card-grid">{shown.map(card =>
                    <ReferenceCard key={card.id} card={card} group={groupById.get(card.groupId)} fragments={fragments.get(card.id)} provider={provider} />)}
                  </div><div ref={sentinel} className="load-status" aria-live="polite">{visible < matching.length ? `Showing ${shown.length} of ${matching.length} references` : ""}</div></>
                : <div className="no-results"><Search size={28} /><h3>No references found</h3><p>Try another word or choose a different collection.</p></div>}
            </section>
          </div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
