import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, BookOpen, ImageOff, Layers3, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadLibrary } from "@/src/library";
import { getFragments, type Fragment } from "@/src/media";
import { searchCards } from "@/src/search";
import { getOrCacheVisual } from "@/src/visuals";
import type { SavedCard, SavedGroup } from "@/src/types";
import "@/assets/theme.css";
import "./hub.css";

const PAGE_SIZE = 48;
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function Preview({ card, fragment }: { card: SavedCard; fragment?: Fragment }) {
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    void getOrCacheVisual(card.id, card.previewUrl).then(image => {
      if (!live || !image) return;
      url = URL.createObjectURL(image);
      setSource(url);
    }).catch(error => {
      console.info(`Tab Hub: using text fallback for ${card.site}:`, error);
      if (live) setFailed(true);
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [card.id, card.previewUrl, fragment?.savedAt]);
  return (
    <div className="card-visual">
      {source && !failed
        ? <img src={source} alt={fragment?.kind === "region" ? `Marked region from ${card.title}` : `Preview of ${card.title}`} onError={() => setFailed(true)} />
        : <div className="visual-fallback" aria-label={`No image available for ${card.title}`}>
            <span className="fallback-mark">{card.site.slice(0, 1).toUpperCase()}</span>
            <span className="fallback-site">{card.site}</span>
            <ImageOff size={19} strokeWidth={1.4} aria-hidden="true" />
          </div>}
    </div>
  );
}

function ReferenceCard({ card, group, fragment }: { card: SavedCard; group?: SavedGroup; fragment?: Fragment }) {
  const [iconFailed, setIconFailed] = useState(false);
  const favicon = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(card.url)}&size=32`);
  return (
    <article className="reference-card" data-testid="reference-card">
      <Preview card={card} fragment={fragment} />
      <div className="card-content">
        <div className="card-meta">
          <span className="site-id">
            {!iconFailed && <img width="16" height="16" src={favicon} alt="" onError={() => setIconFailed(true)} />}
            {iconFailed && <span className="favicon-fallback" aria-hidden="true">{card.site.slice(0, 1).toUpperCase()}</span>}
            <span className="site-name">{card.site}</span>
          </span>
          <span>{date.format(card.savedAt)}</span>
        </div>
        <h3 title={card.title}>{card.title}</h3>
        {fragment?.kind === "text" && fragment.text && <blockquote>“{fragment.text}”</blockquote>}
        {card.note && <p className="card-note">{card.note}</p>}
        <div className="card-footer">
          <Badge variant="secondary" className="group-badge">
            <span className="group-marker" data-color={group?.color ?? "grey"} />
            {group?.kind === "single" ? "Single tab" : group?.name ?? "Recovered"}
          </Badge>
          <Button variant="ghost" size="icon" aria-label={`Open ${card.title}`} title="Open source" onClick={() => chrome.tabs.create({ url: card.url })}>
            <ArrowUpRight size={17} />
          </Button>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [fragments, setFragments] = useState<Map<string, Fragment>>(new Map());
  const [selected, setSelected] = useState("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);

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

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand"><BookOpen size={22} strokeWidth={1.7} /><span>Tab Hub</span></div>
        <span className="eyebrow">A home for what caught your eye</span>
      </header>
      <section className={`intro ${cards.length ? "intro-compact" : ""}`}>
        <p className="eyebrow">Your reference library</p>
        <h1>Keep the thought.<br /><em>Close the tabs.</em></h1>
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
                    <ReferenceCard key={card.id} card={card} group={groupById.get(card.groupId)} fragment={fragments.get(card.id)} />)}
                  </div><div ref={sentinel} className="load-status" aria-live="polite">{visible < matching.length ? `Showing ${shown.length} of ${matching.length} references` : ""}</div></>
                : <div className="no-results"><Search size={28} /><h3>No references found</h3><p>Try another word or choose a different collection.</p></div>}
            </section>
          </div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
