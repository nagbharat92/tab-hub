import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveRestore, BookOpen, Download, Layers3, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HowThisWorks } from "@/components/how-this-works";
import { ReferenceCard } from "@/components/reference-card";
import { exportBackup, importBackup } from "@/src/backup";
import { isCardArchived, restoreArchivedCards, restoreArchivedGroup } from "@/src/archive";
import { deleteCollection, deleteReferences, hasPendingDeletion, resumePendingDeletion } from "@/src/delete";
import { chooseGuessProvider, noGuessProvider, type GuessProvider } from "@/src/guess";
import { loadLibrary } from "@/src/library";
import { getFragments, type FragmentRecord } from "@/src/media";
import { searchCards } from "@/src/search";
import type { ArchiveStates, SavedCard, SavedGroup } from "@/src/types";
import "@/assets/theme.css";
import "./hub.css";

const PAGE_SIZE = 48;

interface PendingAction {
  kind: "cards" | "group";
  ids: string[];
  expectedCardIds?: string[];
  label: string;
  mode: "delete" | "restore";
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [cleanupNeeded, setCleanupNeeded] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void chooseGuessProvider().then(found => { if (mounted) setProvider(found); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    void resumePendingDeletion().then(() => setCleanupNeeded(false)).catch(cause => {
      console.error("Tab Hub: permanent deletion needs cleanup.", cause);
      setCleanupNeeded(true);
      setActionError(`A previous deletion needs cleanup: ${String(cause)}. Retry cleanup below.`);
    });
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
  useEffect(() => {
    if (!loading && selected === "archived" && archivedCards.length === 0) setSelected("all");
  }, [archivedCards.length, loading, selected]);
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
  const archivedGroups = groups.filter(group => group.kind === "group" && archivedGroupCounts.has(group.id));
  const looseCount = activeCards.filter(card => groupById.get(card.groupId)?.kind === "single").length;
  const selectedCount = selectedIds.filter(id => matching.some(card => card.id === id)).length;
  useEffect(() => {
    if (!loading && (selected === "loose" && looseCount === 0 ||
        selected !== "all" && selected !== "loose" && selected !== "archived" && !groupCounts.has(selected))) {
      setSelected("all");
    }
  }, [groupCounts, loading, looseCount, selected]);

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
    setActionStatus("");
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
      setBackupStatus(`Prepared a local backup of ${result.cards} ${result.cards === 1 ? "reference" : "references"} and ${result.fragments} marked pieces. Keep the downloaded file somewhere safe.`);
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
    setActionStatus("");
    try {
      const result = await importBackup(file);
      setBackupStatus(`Restored or verified ${result.cards} ${result.cards === 1 ? "reference" : "references"}, ${result.fragments} marked pieces and ${result.images} images.${result.alreadyPresent ? ` ${result.alreadyPresent} existing records were unchanged.` : ""}`);
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

  async function retryCleanup() {
    setActionBusy(true);
    setActionError("");
    try {
      await resumePendingDeletion();
      setCleanupNeeded(false);
      setActionStatus("The previous permanent deletion finished.");
    } catch (cause) {
      setCleanupNeeded(true);
      setActionError(`Cleanup still needs attention: ${String(cause)}`);
    } finally {
      setActionBusy(false);
    }
  }

  async function applyAction() {
    if (!pendingAction || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    setActionStatus("");
    setBackupStatus("");
    try {
      if (pendingAction.mode === "delete") {
        const deleted = pendingAction.kind === "group"
          ? await deleteCollection(pendingAction.ids[0] ?? "", pendingAction.expectedCardIds ?? [])
          : await deleteReferences(pendingAction.ids);
        setActionStatus(`Permanently deleted ${deleted} ${deleted === 1 ? "reference" : "references"} from Tab Hub, including their stored notes and images.`);
        if (pendingAction.kind === "group") setSelected("all");
      } else {
        if (pendingAction.kind === "group") await restoreArchivedGroup(pendingAction.ids[0] ?? "");
        else await restoreArchivedCards(pendingAction.ids);
        setActionStatus(`Restored ${pendingAction.count} ${pendingAction.count === 1 ? "reference" : "references"} to your library.`);
        if (pendingAction.kind === "group") setSelected(pendingAction.ids[0] ?? "all");
      }
      setSelectedIds([]);
      setSelectionMode(false);
      setPendingAction(null);
    } catch (cause) {
      setActionError(`${pendingAction.mode === "delete" ? "Delete" : "Restore"} failed: ${String(cause)}`);
      if (await hasPendingDeletion()) setCleanupNeeded(true);
      setPendingAction(null);
    } finally {
      setActionBusy(false);
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
      {actionStatus && <p className="backup-status" role="status">{actionStatus}</p>}
      {actionError && <p className="library-error" role="alert">{actionError}</p>}
      {cleanupNeeded && <Button size="sm" variant="outline" disabled={actionBusy} onClick={() => void retryCleanup()}>Retry deletion cleanup</Button>}
      <section className={`intro ${cards.length ? "intro-compact" : ""}`}>
        <p className="eyebrow">Your reference library</p>
        {cards.length ? <h1>Your references<span className="title-stop">.</span></h1>
          : <h1>Keep the thought.<br /><em>Close the tabs.</em></h1>}
        <p>{cards.length ? `${activeCards.length} in your library${archivedCards.length ? ` · ${archivedCards.length} previously archived` : ""}.` : "Your groups and the pieces worth remembering will live here."}</p>
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
              {archivedCards.length > 0 && <Button variant="ghost" className={`collection ${selected === "archived" ? "is-selected" : ""}`} onClick={() => setSelected("archived")}>
                <span className="collection-label"><ArchiveRestore size={17} /> Previously archived</span><span>{archivedCards.length}</span>
              </Button>}
              <div className="sidebar-note">The web, without the clutter.<br />Everything stays on this device.</div>
            </aside>
            <section className="library-main" aria-label="Saved references">
              <div className="library-toolbar">
                <div>
                  <p className="eyebrow">{selected === "all" ? "Everything" : selected === "loose" ? "Individual tabs" : selected === "archived" ? "Saved before permanent deletion" : groupById.get(selected)?.name ?? "Collection"}</p>
                  <h2>{query ? `${matching.length} ${matching.length === 1 ? "match" : "matches"}` : `${scoped.length} ${scoped.length === 1 ? "reference" : "references"}`}</h2>
                </div>
                <label className="search-field">
                  <Search size={17} aria-hidden="true" />
                  <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={selected === "archived" ? "Search previously archived" : "Search everything"} aria-label="Search references" />
                  {query && <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></Button>}
                </label>
              </div>
              {selected === "archived" && <p className="legacy-note">These references were archived in an earlier version. Nothing here will be deleted automatically. Restore them or permanently delete them when you choose.</p>}
              {selected === "archived" && archivedGroups.length > 0 && <div className="archived-group-list" aria-label="Previously archived collections">
                {archivedGroups.map(group => <div className="archived-group" key={group.id}>
                  <span><span className="group-marker" data-color={group.color} /> {group.name} · {archivedGroupCounts.get(group.id)} references</span>
                  <div className="legacy-actions">
                  {archives.groups[group.id]?.archivedAt != null && <Button size="sm" variant="outline" disabled={actionBusy} aria-label={`Restore collection ${group.name}`} onClick={() =>
                    setPendingAction({ kind: "group", ids: [group.id], mode: "restore", label: group.name,
                      count: archivedCards.filter(card => card.groupId === group.id && archives.cards[card.id]?.archivedAt == null).length })
                  }><ArchiveRestore size={15} /> Restore collection</Button>}
                  <Button size="sm" variant="outline" disabled={actionBusy || cleanupNeeded} aria-label={`Delete collection ${group.name}`} onClick={() =>
                    setPendingAction({ kind: "group", ids: [group.id], mode: "delete", label: group.name,
                      expectedCardIds: cards.filter(card => card.groupId === group.id).map(card => card.id),
                      count: cards.filter(card => card.groupId === group.id).length })
                  }><Trash2 size={15} /> Delete collection</Button>
                  </div>
                </div>)}
              </div>}
              {selected !== "archived" && scoped.length > 0 && groupById.get(selected)?.kind === "group" && <div className="collection-tools">
                <Button size="sm" variant="outline" disabled={actionBusy || cleanupNeeded} onClick={() =>
                  setPendingAction({ kind: "group", ids: [selected], mode: "delete", label: groupById.get(selected)?.name ?? "this collection",
                    expectedCardIds: cards.filter(card => card.groupId === selected).map(card => card.id),
                    count: cards.filter(card => card.groupId === selected).length })
                }><Trash2 size={15} /> Delete collection</Button>
              </div>}
              {scoped.length > 0 && <div className="selection-toolbar">
                <Button size="sm" variant="ghost" onClick={() => { setSelectionMode(value => !value); setSelectedIds([]); }}>
                  {selectionMode ? "Cancel selection" : "Select references"}
                </Button>
                {selectionMode && <>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(matching.map(card => card.id))}>Select all matches</Button>
                  <span>{selectedCount} selected</span>
                  <Button size="sm" disabled={!selectedCount || actionBusy || cleanupNeeded} onClick={() =>
                    setPendingAction({ kind: "cards", ids: selectedIds.filter(id => matching.some(card => card.id === id)), mode: "delete",
                      label: `${selectedCount} selected references`, count: selectedCount })
                  }>Delete selected permanently</Button>
                  {selected === "archived" && <Button size="sm" variant="outline" disabled={!selectedCount || actionBusy} onClick={() =>
                    setPendingAction({ kind: "cards", ids: selectedIds.filter(id => matching.some(card => card.id === id)), mode: "restore",
                      label: `${selectedCount} selected references`, count: selectedCount })
                  }>Restore selected</Button>}
                </>}
              </div>}
              {matching.length
                ? <><div className="card-grid">{shown.map(card =>
                    <ReferenceCard key={card.id} card={card} group={groupById.get(card.groupId)} fragments={fragments.get(card.id)} provider={provider}
                      archived={selected === "archived"} selectionMode={selectionMode} selected={selectedIds.includes(card.id)} onToggleSelect={toggleCard}
                      onDelete={item => setPendingAction({ kind: "cards", ids: [item.id], mode: "delete", label: item.title, count: 1 })}
                      onRestore={item => setPendingAction({ kind: "cards", ids: [item.id], mode: "restore", label: item.title, count: 1 })} />)}
                  </div><div ref={sentinel} className="load-status" aria-live="polite">{visible < matching.length ? `Showing ${shown.length} of ${matching.length} references` : ""}</div></>
                : <div className="no-results"><Search size={28} /><h3>{query ? "No references found" : selected === "archived" ? "No previously archived references" : "No references here"}</h3>
                  <p>{query ? "Try another word or choose a different collection." : selected === "archived" ? "Nothing remains here; new removals permanently delete rather than archive." : "Save a reference to see it here."}</p></div>}
            </section>
          </div>}
      <Dialog open={pendingAction !== null} onOpenChange={open => { if (!open && !actionBusy) setPendingAction(null); }}>
        <DialogContent className="archive-dialog">
          <DialogHeader>
            <DialogTitle>{pendingAction?.mode === "delete" ? "Permanently delete" : "Restore"} {pendingAction?.label}?</DialogTitle>
            <DialogDescription>
              {pendingAction?.mode === "delete"
                ? `This cannot be undone in Tab Hub. ${pendingAction.kind === "group" ? "Every saved reference in this collection, including previously archived ones, " : "The selected references " }will lose their links, notes, guesses, marked pieces and locally stored images. Previously exported backup files are not affected.`
                : "This brings the previously archived reference back to your library. Nothing is deleted."}
            </DialogDescription>
          </DialogHeader>
          <div className="archive-dialog-actions">
            <Button variant="outline" disabled={actionBusy} onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button variant={pendingAction?.mode === "delete" ? "destructive" : "default"} disabled={actionBusy || pendingAction?.mode === "delete" && cleanupNeeded}
              onClick={() => void applyAction()}>{actionBusy ? "Working…" : pendingAction?.mode === "delete" ? "Delete permanently" : "Restore"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
