import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Archive, ArchiveRestore, BookOpen, Download, Layers3, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HowThisWorks } from "@/components/how-this-works";
import { ReferenceCard } from "@/components/reference-card";
import { exportBackup, importBackup } from "@/src/backup";
import { isCardArchived, setCardsArchived, setGroupArchived } from "@/src/archive";
import { chooseGuessProvider, noGuessProvider, type GuessProvider } from "@/src/guess";
import { loadLibrary } from "@/src/library";
import { getFragments, type FragmentRecord } from "@/src/media";
import { searchCards } from "@/src/search";
import type { ArchiveStates, SavedCard, SavedGroup } from "@/src/types";
import "@/assets/theme.css";
import "./hub.css";

const PAGE_SIZE = 48;

interface PendingArchiveAction {
  kind: "cards" | "group";
  ids: string[];
  label: string;
  archive: boolean;
  count: number;
}

function App() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [archives, setArchives] = useState<ArchiveStates>({ cards: {}, groups: {} });
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingArchiveAction | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState("");
  const [archiveError, setArchiveError] = useState("");
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
        setArchives(library.archives);
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

  useEffect(() => { setVisible(PAGE_SIZE); setSelectedIds([]); }, [query, selected]);
  const groupById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const [activeCards, archivedCards] = useMemo(() => {
    const active: SavedCard[] = [];
    const archived: SavedCard[] = [];
    for (const card of cards) (isCardArchived(card, archives) ? archived : active).push(card);
    return [active, archived];
  }, [cards, archives]);
  const scoped = useMemo(() => selected === "archived" ? archivedCards : activeCards.filter(card =>
    selected === "all" || selected === "loose" && groupById.get(card.groupId)?.kind === "single" || selected === card.groupId
  ), [activeCards, archivedCards, selected, groupById]);
  const matching = useMemo(() => searchCards(scoped, query, fragments), [scoped, query, fragments]);
  const shown = matching.slice(0, visible);
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of activeCards) counts.set(card.groupId, (counts.get(card.groupId) ?? 0) + 1);
    return counts;
  }, [activeCards]);
  const archivedGroupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of archivedCards) counts.set(card.groupId, (counts.get(card.groupId) ?? 0) + 1);
    return counts;
  }, [archivedCards]);
  const nativeGroups = groups.filter(group => group.kind === "group" && groupCounts.has(group.id));
  const archivedGroups = groups.filter(group => group.kind === "group" && archives.groups[group.id]?.archivedAt != null &&
    archivedGroupCounts.has(group.id));
  const looseCount = activeCards.filter(card => groupById.get(card.groupId)?.kind === "single").length;
  const selectedCount = selectedIds.filter(id => matching.some(card => card.id === id)).length;

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

  function toggleCard(id: string) {
    setSelectedIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  }

  async function applyArchiveAction() {
    if (!pendingAction || archiveBusy) return;
    setArchiveBusy(true);
    setArchiveError("");
    setArchiveStatus("");
    try {
      if (pendingAction.kind === "group") await setGroupArchived(pendingAction.ids[0] ?? "", pendingAction.archive);
      else await setCardsArchived(pendingAction.ids, pendingAction.archive);
      setArchiveStatus(pendingAction.kind === "group"
        ? `${pendingAction.archive ? "Archived" : "Restored"} collection ${pendingAction.label}. Independently archived references stay archived when a collection is restored. Nothing was deleted.`
        : `${pendingAction.archive ? "Archived" : "Restored"} ${pendingAction.count} ${pendingAction.count === 1 ? "reference" : "references"}. No links or marked pieces were deleted.`);
      if (pendingAction.kind === "group" && pendingAction.archive) setSelected("archived");
      if (pendingAction.kind === "group" && !pendingAction.archive) setSelected(pendingAction.ids[0] ?? "all");
      if (pendingAction.kind === "cards" && pendingAction.archive && groupById.get(selected)?.kind === "group" &&
          pendingAction.count === scoped.length) setSelected("archived");
      setSelectedIds([]);
      setSelectionMode(false);
      setPendingAction(null);
    } catch (cause) {
      setArchiveError(`${pendingAction.archive ? "Archive" : "Restore"} failed: ${String(cause)}`);
      setPendingAction(null);
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand"><BookOpen size={22} strokeWidth={1.7} /><span>Tab Hub</span></div>
        <div className="header-tools">
          <span className="eyebrow">A home for what caught your eye</span>
          <HowThisWorks />
          <Button size="sm" variant="outline" disabled={backupBusy} aria-label="Export backup" onClick={() => void downloadBackup()}><Download size={15} /><span className="action-copy">Export</span></Button>
          <Button size="sm" variant="outline" disabled={backupBusy} aria-label="Import backup" onClick={() => archiveInput.current?.click()}><Upload size={15} /><span className="action-copy">Import</span></Button>
          <Input ref={archiveInput} type="file" accept=".tabhub,application/zip" className="sr-only" aria-label="Choose a Tab Hub backup" onChange={event => void restoreBackup(event)} />
        </div>
      </header>
      {backupStatus && <p className="backup-status" role="status">{backupStatus}</p>}
      {backupError && <p className="library-error" role="alert">{backupError}</p>}
      {archiveStatus && <p className="backup-status" role="status">{archiveStatus}</p>}
      {archiveError && <p className="library-error" role="alert">{archiveError}</p>}
      <section className={`intro ${cards.length ? "intro-compact" : ""}`}>
        <p className="eyebrow">Your reference library</p>
        {cards.length ? <h1>Your references<span className="title-stop">.</span></h1>
          : <h1>Keep the thought.<br /><em>Close the tabs.</em></h1>}
        <p>{cards.length ? `${activeCards.length} in your library${archivedCards.length ? ` · ${archivedCards.length} archived` : ""}. Nothing disappears unless you choose to move it.` : "Your groups and the pieces worth remembering will live here."}</p>
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
                <span className="collection-label"><Layers3 size={17} /> All references</span><span>{activeCards.length}</span>
              </Button>
              {nativeGroups.map(group => {
                const count = groupCounts.get(group.id) ?? 0;
                return <Button key={group.id} variant="ghost" className={`collection ${selected === group.id ? "is-selected" : ""}`} onClick={() => setSelected(group.id)}>
                  <span className="collection-label"><span className="group-marker" data-color={group.color} /> <span className="collection-name">{group.name}</span></span><span>{count}</span>
                </Button>;
              })}
              {looseCount > 0 && <Button variant="ghost" className={`collection ${selected === "loose" ? "is-selected" : ""}`} onClick={() => setSelected("loose")}>
                <span className="collection-label"><span className="group-marker" data-color="grey" /> Individual tabs</span><span>{looseCount}</span>
              </Button>}
              <div className="collection-divider" />
              <Button variant="ghost" className={`collection ${selected === "archived" ? "is-selected" : ""}`} onClick={() => setSelected("archived")}>
                <span className="collection-label"><Archive size={17} /> Archived</span><span>{archivedCards.length}</span>
              </Button>
              <div className="sidebar-note">The web, without the clutter.<br />Everything stays on this device.</div>
            </aside>
            <section className="library-main" aria-label="Saved references">
              <div className="library-toolbar">
                <div>
                  <p className="eyebrow">{selected === "all" ? "Everything" : selected === "loose" ? "Individual tabs" : selected === "archived" ? "Out of sight, not gone" : groupById.get(selected)?.name ?? "Collection"}</p>
                  <h2>{query ? `${matching.length} ${matching.length === 1 ? "match" : "matches"}` : `${scoped.length} ${scoped.length === 1 ? "reference" : "references"}`}</h2>
                </div>
                <label className="search-field">
                  <Search size={17} aria-hidden="true" />
                  <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={selected === "archived" ? "Search archived" : "Search everything"} aria-label="Search references" />
                  {query && <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></Button>}
                </label>
              </div>
              {selected === "archived" && archivedGroups.length > 0 && <div className="archived-group-list" aria-label="Archived collections">
                {archivedGroups.map(group => <div className="archived-group" key={group.id}>
                  <span><span className="group-marker" data-color={group.color} /> {group.name} · {archivedGroupCounts.get(group.id)} references</span>
                  <Button size="sm" variant="outline" disabled={archiveBusy} aria-label={`Restore collection ${group.name}`} onClick={() =>
                    setPendingAction({ kind: "group", ids: [group.id], archive: false, label: group.name,
                      count: archivedCards.filter(card => card.groupId === group.id && archives.cards[card.id]?.archivedAt == null).length })
                  }><ArchiveRestore size={15} /> Restore collection</Button>
                </div>)}
              </div>}
              {selected !== "archived" && scoped.length > 0 && groupById.get(selected)?.kind === "group" && <div className="collection-tools">
                {archives.groups[selected]?.archivedAt != null
                  ? <Button size="sm" variant="outline" disabled={archiveBusy} onClick={() =>
                    setPendingAction({ kind: "cards", ids: scoped.map(card => card.id), archive: true,
                      label: `${scoped.length} remaining references from ${groupById.get(selected)?.name ?? "this collection"}`, count: scoped.length })
                  }><Archive size={15} /> Archive remaining</Button>
                  : <Button size="sm" variant="outline" disabled={archiveBusy} onClick={() =>
                    setPendingAction({ kind: "group", ids: [selected], archive: true, label: groupById.get(selected)?.name ?? "this collection", count: scoped.length })
                  }><Archive size={15} /> Archive collection</Button>}
              </div>}
              {scoped.length > 0 && <div className="selection-toolbar">
                <Button size="sm" variant="ghost" onClick={() => { setSelectionMode(value => !value); setSelectedIds([]); }}>
                  {selectionMode ? "Cancel selection" : "Select references"}
                </Button>
                {selectionMode && <>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(matching.map(card => card.id))}>Select all matches</Button>
                  <span>{selectedCount} selected</span>
                  <Button size="sm" disabled={!selectedCount || archiveBusy} onClick={() =>
                    setPendingAction({ kind: "cards", ids: selectedIds.filter(id => matching.some(card => card.id === id)), archive: selected !== "archived",
                      label: `${selectedCount} selected references`, count: selectedCount })
                  }>{selected === "archived" ? "Restore selected" : "Archive selected"}</Button>
                </>}
              </div>}
              {matching.length
                ? <><div className="card-grid">{shown.map(card =>
                    <ReferenceCard key={card.id} card={card} group={groupById.get(card.groupId)} fragments={fragments.get(card.id)} provider={provider}
                      archived={selected === "archived"} selectionMode={selectionMode} selected={selectedIds.includes(card.id)} onToggleSelect={toggleCard}
                      onArchiveAction={(item, archive) => setPendingAction({ kind: "cards", ids: [item.id], archive, label: item.title, count: 1 })} />)}
                  </div><div ref={sentinel} className="load-status" aria-live="polite">{visible < matching.length ? `Showing ${shown.length} of ${matching.length} references` : ""}</div></>
                : <div className="no-results"><Search size={28} /><h3>{query ? "No references found" : selected === "archived" ? "Your archive is empty" : "No references here"}</h3>
                  <p>{query ? "Try another word or choose a different collection." : selected === "archived" ? "Move a reference here whenever you want it out of the main view. You can restore it anytime." : "Save a reference or look in Archived for something you moved."}</p></div>}
            </section>
          </div>}
      <Dialog open={pendingAction !== null} onOpenChange={open => { if (!open && !archiveBusy) setPendingAction(null); }}>
        <DialogContent className="archive-dialog">
          <DialogHeader>
            <DialogTitle>{pendingAction?.archive ? "Archive" : "Restore"} {pendingAction?.label}?</DialogTitle>
            <DialogDescription>
              {pendingAction?.kind === "group" && !pendingAction.archive
                ? "This restores the collection to your main library. References you archived individually remain in Archived. Nothing is deleted."
                : pendingAction?.archive
                  ? "This moves the reference out of your main library. Its link, images, marked pieces and notes stay on this device. There is no automatic deletion."
                  : "This returns the reference to your main library. Notes, images and marked pieces stay with it."}
            </DialogDescription>
          </DialogHeader>
          <div className="archive-dialog-actions">
            <Button variant="outline" disabled={archiveBusy} onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button disabled={archiveBusy} onClick={() => void applyArchiveAction()}>{archiveBusy ? "Saving…" : pendingAction?.archive ? "Archive" : "Restore"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
