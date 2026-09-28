import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Check, Download, Ellipsis, Filter, Search, Trash2, Upload } from "lucide-react";
import { Toaster, toast } from "sonner";
import { ThreadCard, ThreadFace } from "@/components/reference-card";
import { restoreArchivedCards } from "@/src/archive";
import { exportBackup, importBackup } from "@/src/backup";
import { resumePendingDeletion } from "@/src/delete";
import { chooseGuessProvider, noGuessProvider, type GuessProvider } from "@/src/guess";
import { guessKey, updateGuess } from "@/src/library";
import { openThreadSave } from "@/src/open-save";
import { searchThreads } from "@/src/search";
import {
  pauseSoftDelete, pendingSoftDeletes, purgeExpiredSoftDeletes,
  resumeSoftDelete, softDeleteSave, softDeleteThread, undoSoftDelete, type SoftDeleteJob
} from "@/src/soft-delete";
import { loadThreads, type SavedThread, type ThreadLibrary, type ThreadSave, type ThreadSaveKind } from "@/src/threads";
import "@/assets/theme.css";
import "./hub.css";

const PAGE_SIZE = 48;
const kinds: { kind: ThreadSaveKind; label: string }[] = [
  { kind: "page", label: "Pages" }, { kind: "passage", label: "Passages" }, { kind: "region", label: "Regions" }
];
const queued = new Set<string>();
let guessQueue: Promise<void> = Promise.resolve();

function App() {
  const [library, setLibrary] = useState<ThreadLibrary>();
  const [jobs, setJobs] = useState<SoftDeleteJob[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>();
  const [kindFilter, setKindFilter] = useState<ThreadSaveKind>();
  const [archivedView, setArchivedView] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [columnCount, setColumnCount] = useState(() => window.matchMedia("(max-width: 900px)").matches ? 2 : 4);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [backupBusy, setBackupBusy] = useState(false);
  const [provider, setProvider] = useState<GuessProvider>(noGuessProvider);
  const archiveInput = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const displayedToasts = useRef(new Set<string>());
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [next, pending] = await Promise.all([loadThreads(), pendingSoftDeletes()]);
      if (!mounted.current) return;
      setLibrary(next);
      setJobs(pending);
    } catch (cause) {
      if (mounted.current) setError(`Saved pages could not be read: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        await resumePendingDeletion();
        for (const job of await pendingSoftDeletes()) if (job.pausedRemaining !== undefined) await resumeSoftDelete(job.id);
        await purgeExpiredSoftDeletes();
        await refresh();
      } catch (cause) { setError(`Deletion cleanup needs attention: ${String(cause)}`); }
    })();
    void chooseGuessProvider().then(found => { if (mounted.current) setProvider(found); });
    const changed = (_: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local") void refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      mounted.current = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [refresh]);

  const archived = library?.threads.some(thread => thread.archivedSaves.length) ?? false;
  const groups = (library?.groups ?? []).filter(group => group.kind === "group" &&
    library?.threads.some(thread => thread.visibleSaves.some(save => save.groupId === group.id)));
  const currentThreads = useMemo(() => {
    const all = library?.threads ?? [];
    const scoped = archivedView ? all.filter(thread => thread.archivedSaves.length).map(thread => ({
      ...thread, face: thread.archivedSaves[0]!, lastTouched: thread.archivedSaves[0]!.savedAt,
      groupIds: [...new Set(thread.archivedSaves.map(save => save.groupId))]
    })) : all.filter(thread => thread.visibleSaves.length);
    return scoped.filter(thread =>
      (!groupFilter || thread.groupIds.includes(groupFilter)) &&
      (!kindFilter || thread.face.kind === kindFilter)
    ).sort((a, b) => b.lastTouched - a.lastTouched || a.id.localeCompare(b.id));
  }, [library, groupFilter, kindFilter, archivedView]);
  const matching = useMemo(() => searchThreads(currentThreads, query, archivedView), [currentThreads, query, archivedView]);
  const shown = matching.slice(0, visibleCount);
  const selected = matching.find(thread => thread.id === selectedId);
  const hasVisible = library?.threads.some(thread => thread.visibleSaves.length) ?? false;
  const groupLabel = groups.find(group => group.id === groupFilter)?.name;
  const kindLabel = kinds.find(item => item.kind === kindFilter)?.label;
  const activeLabel = archivedView ? "Previously archived" : [groupLabel, kindLabel].filter(Boolean).join(" · ");

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, groupFilter, kindFilter, archivedView]);
  useEffect(() => {
    if (selectedId && selected && window.matchMedia("(max-width: 900px)").matches) {
      panelRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    }
  }, [selectedId]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setColumnCount(media.matches ? 2 : 4);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (groupFilter && !groups.some(group => group.id === groupFilter)) setGroupFilter(undefined);
    if (archivedView && !archived) setArchivedView(false);
  }, [archived, groupFilter, groups, archivedView]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || visibleCount >= matching.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisibleCount(count => Math.min(matching.length, count + PAGE_SIZE));
    }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, matching.length]);

  const undo = useCallback(async (id: string) => {
    try {
      if (!await undoSoftDelete(id)) {
        await purgeExpiredSoftDeletes();
        await refresh();
        setError("This deletion can no longer be undone.");
        return;
      }
      toast.dismiss(id);
      displayedToasts.current.delete(id);
      await refresh();
    } catch (cause) { setError(`Undo failed: ${String(cause)}`); }
  }, [refresh]);

  useEffect(() => {
    const active = new Set(jobs.map(job => job.id));
    for (const id of displayedToasts.current) {
      if (!active.has(id)) { toast.dismiss(id); displayedToasts.current.delete(id); }
    }
    for (const job of jobs) {
      if (displayedToasts.current.has(job.id)) continue;
      displayedToasts.current.add(job.id);
      toast.custom(() => (
        <div className="undo-toast" onMouseEnter={() => void pauseSoftDelete(job.id).then(refresh)}
          onMouseLeave={() => void resumeSoftDelete(job.id).then(refresh)}>
          <span>Deleted</span><span aria-hidden="true"> · </span>
          <button type="button" onClick={() => void undo(job.id)}>Undo</button>
        </div>
      ), { id: job.id, duration: Infinity });
    }
    const timeouts = jobs.filter(job => job.pausedRemaining === undefined).map(job => setTimeout(() => {
      void purgeExpiredSoftDeletes().then(refresh).catch(cause => setError(`Deletion cleanup needs attention: ${String(cause)}`));
    }, Math.max(0, job.expiresAt - Date.now() + 20)));
    return () => timeouts.forEach(clearTimeout);
  }, [jobs, refresh, undo]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  const guessFor = useCallback((save: ThreadSave) => {
    if (provider.name === "none" || save.guess || queued.has(save.cardId)) return;
    const card = library?.cards.find(item => item.id === save.cardId);
    if (!card) return;
    queued.add(card.id);
    guessQueue = guessQueue.then(async () => {
      if ((await chrome.storage.local.get(guessKey(card.id)))[guessKey(card.id)]) return;
      const fragment = library?.threads.find(thread => thread.saves.some(item => item.cardId === card.id))
        ?.saves.find(item => item.cardId === card.id && item.kind === "passage")?.text;
      const generated = await provider.generate({
        title: card.title, site: card.site, description: card.description, note: card.note, fragment
      });
      if (generated) await updateGuess(card.id, generated, "model");
    }).catch(cause => console.warn("Tab Hub: on-device guess unavailable; reference remains saved.", cause))
      .finally(() => queued.delete(card.id));
  }, [provider, library]);

  async function remove(thread: SavedThread, save?: ThreadSave) {
    try {
      const job = save ? await softDeleteSave(thread, save) : await softDeleteThread(thread);
      const leavesView = job.kind === "thread" || save &&
        (archivedView ? thread.archivedSaves.length === 1 : thread.visibleSaves.length === 1);
      if (leavesView && selectedId === thread.id) {
        const index = matching.findIndex(item => item.id === thread.id);
        setSelectedId(matching[index + 1]?.id ?? matching[index - 1]?.id);
      }
      await refresh();
    } catch (cause) { setError(`Delete failed: ${String(cause)}`); }
  }

  async function removeSave(thread: SavedThread, save: ThreadSave) {
    setLeaving(current => new Set(current).add(save.id));
    await new Promise(resolve => setTimeout(resolve, 180));
    try { await remove(thread, save); }
    finally {
      setLeaving(current => {
        const next = new Set(current);
        next.delete(save.id);
        return next;
      });
    }
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        const last = jobs.filter(job => job.pausedRemaining !== undefined || job.expiresAt > Date.now()).at(-1);
        if (last) { event.preventDefault(); void undo(last.id); }
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void remove(selected);
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [jobs, selected, matching, selectedId, undo]);

  async function downloadBackup() {
    setBackupBusy(true);
    try {
      const { file, filename } = await exportBackup();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(`Backup export failed: ${String(cause)}`); }
    finally { setBackupBusy(false); }
  }

  async function restoreBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    try { await importBackup(file); await refresh(); }
    catch (cause) { setError(`Backup import failed: ${String(cause)}`); }
    finally { input.value = ""; setBackupBusy(false); }
  }

  async function restore(thread: SavedThread) {
    try {
      await restoreArchivedCards([...new Set(thread.archivedSaves.map(save => save.cardId))]);
      setArchivedView(false);
      setSelectedId(undefined);
      await refresh();
    } catch (cause) { setError(`Restore failed: ${String(cause)}`); }
  }

  function changeFilters(group?: string, kind?: ThreadSaveKind, showArchived = false) {
    setGroupFilter(group);
    setKindFilter(kind);
    setArchivedView(showArchived);
    setSelectedId(undefined);
    setFilterOpen(false);
    setMoreOpen(false);
  }

  return (
    <main className="shell">
      <header className={`masthead ${activeLabel ? "has-filter" : ""}`}>
        <span className="brand">Tab Hub</span>
        <div className="header-tools">
          {hasVisible && <>
            <label className="search-field"><Search size={17} aria-hidden="true" />
              <input aria-label="Search references" type="search" value={query}
                onChange={event => { setQuery(event.target.value); setSelectedId(undefined); }} />
            </label>
            <div className="menu-wrap" ref={filterRef}>
              <button className={`icon-button filter-trigger ${activeLabel ? "is-active" : ""}`} type="button"
                aria-label="Filter" aria-haspopup="menu" aria-expanded={filterOpen}
                onClick={() => { setFilterOpen(!filterOpen); setMoreOpen(false); }}><Filter size={19} /></button>
              {filterOpen && <div className="menu filter-menu" role="menu" aria-label="Filter references"
                onKeyDown={event => { if (event.key === "Escape") setFilterOpen(false); }}>
                <button role="menuitemcheckbox" aria-checked={!groupFilter && !kindFilter && !archivedView}
                  onClick={() => changeFilters()}><Check className={!groupFilter && !kindFilter && !archivedView ? "" : "invisible"} size={16} />All</button>
                {groups.map(group => <button key={group.id} role="menuitemcheckbox" aria-checked={groupFilter === group.id}
                  onClick={() => changeFilters(groupFilter === group.id ? undefined : group.id, kindFilter)}>
                  <Check className={groupFilter === group.id ? "" : "invisible"} size={16} />{group.name}</button>)}
                {archived && <button role="menuitemcheckbox" aria-checked={archivedView}
                  onClick={() => changeFilters(undefined, undefined, true)}>
                  <Check className={archivedView ? "" : "invisible"} size={16} />Previously archived</button>}
                <span className="menu-separator" aria-hidden="true" />
                {kinds.map(item => <button key={item.kind} role="menuitemcheckbox" aria-checked={kindFilter === item.kind}
                  onClick={() => changeFilters(groupFilter, kindFilter === item.kind ? undefined : item.kind)}>
                  <Check className={kindFilter === item.kind ? "" : "invisible"} size={16} />{item.label}</button>)}
              </div>}
            </div>
            {activeLabel && <button className="filter-label" type="button" onClick={() => changeFilters()} aria-label={`Clear ${activeLabel}`}>
              <span>{activeLabel}</span>
            </button>}
          </>}
          <div className="menu-wrap" ref={moreRef}>
            <button className="icon-button" type="button" aria-label="More" aria-haspopup="menu" aria-expanded={moreOpen}
              onClick={() => { setMoreOpen(!moreOpen); setFilterOpen(false); }}><Ellipsis size={20} /></button>
            {moreOpen && <div className="menu more-menu" role="menu" aria-label="More actions"
              onKeyDown={event => { if (event.key === "Escape") setMoreOpen(false); }}>
              <button role="menuitem" disabled={backupBusy} onClick={() => { setMoreOpen(false); void downloadBackup(); }}><Download size={16} />Export</button>
              <button role="menuitem" disabled={backupBusy} onClick={() => { setMoreOpen(false); archiveInput.current?.click(); }}><Upload size={16} />Import</button>
              {archived && !hasVisible && <button role="menuitem" onClick={() => changeFilters(undefined, undefined, true)}>Previously archived</button>}
            </div>}
          </div>
          <input ref={archiveInput} type="file" accept=".tabhub,application/zip" className="sr-only"
            aria-label="Choose a Tab Hub backup" onChange={event => void restoreBackup(event)} />
        </div>
      </header>
      {error && <p className="library-error" role="alert">{error}</p>}
      {error.includes("cleanup") && <button type="button" className="cleanup-button" onClick={() =>
        void resumePendingDeletion().then(purgeExpiredSoftDeletes).then(refresh).then(() => setError(""))
          .catch(cause => setError(`Deletion cleanup needs attention: ${String(cause)}`))
      }>Retry deletion cleanup</button>}
      {!library ? null : !hasVisible && !archivedView
        ? <p className="empty-state">Save a tab from the Tab Hub button in your toolbar.</p>
        : <div className={`gallery-layout ${selected ? "has-selection" : ""}`}>
          <section className="gallery-grid" aria-label="Saved pages">
            {matching.length > 0 && <div className="masonry-grid">
              {Array.from({ length: columnCount }, (_, column) => (
                <div className="masonry-column" key={column}>{shown.filter((_, index) => index % columnCount === column).map((thread, index) =>
                  <ThreadCard key={thread.id} thread={thread} index={index * columnCount + column} selected={selectedId === thread.id}
                    onSelect={setSelectedId} onVisible={guessFor} />)}</div>
              ))}
            </div>}
            <div ref={sentinel} className="gallery-sentinel" aria-hidden="true" />
          </section>
          {selected && <aside ref={panelRef} className="thread-panel" aria-label={`Saves for ${selected.face.title}`}>
            <div className="panel-header">
              <button type="button" className="panel-open" onClick={() =>
                void openThreadSave({ ...selected.face, kind: "page", anchor: undefined })}>
                <img src={chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(selected.face.url)}&size=32`)} alt="" />
                <span>{selected.face.title}</span><ArrowUpRight size={17} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button panel-delete" aria-label={`Delete page ${selected.face.title}`}
                onClick={() => void remove(selected)}><Trash2 size={17} /></button>
            </div>
            {archivedView && <button className="restore-button" type="button" onClick={() => void restore(selected)}>Restore</button>}
            <div className="panel-saves">{(archivedView ? selected.archivedSaves : selected.visibleSaves).map(save =>
              <div className={`panel-save ${leaving.has(save.id) ? "is-leaving" : ""}`} key={save.id}>
                <div role="button" tabIndex={0} className="panel-save-open"
                  aria-label={`Open save from ${save.title}`} onClick={() => void openThreadSave(save)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openThreadSave(save); }
                  }}><ThreadFace save={save} panel /></div>
                <button type="button" className="panel-save-delete" aria-label={`Delete save ${save.id}`}
                  disabled={leaving.has(save.id)} onClick={() => void removeSave(selected, save)}><Trash2 size={15} /></button>
              </div>)}</div>
          </aside>}
        </div>}
      <Toaster position="bottom-center" expand={false} visibleToasts={6} gap={7} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
