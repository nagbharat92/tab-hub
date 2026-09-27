import React, { useEffect, useRef, useState } from "react";
import { ArchiveRestore, ArrowUpRight, ImageOff, PencilLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { guessKey, updateGuess, updateNote } from "@/src/library";
import type { GuessProvider } from "@/src/guess";
import { getImage, type Fragment, type FragmentRecord } from "@/src/media";
import type { SavedCard, SavedGroup } from "@/src/types";
import { getOrCacheVisual } from "@/src/visuals";

const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const queued = new Set<string>();
let guessQueue: Promise<void> = Promise.resolve();

function enqueueGuess(card: SavedCard, fragment: Fragment | undefined, provider: GuessProvider) {
  if (queued.has(card.id)) return;
  queued.add(card.id);
  guessQueue = guessQueue.then(async () => {
    const existing = await chrome.storage.local.get(guessKey(card.id));
    if (existing[guessKey(card.id)]) return;
    const response = await provider.generate({
      title: card.title,
      site: card.site,
      description: card.description,
      fragment: fragment?.text,
      note: card.note
    });
    if (response) await updateGuess(card.id, response, "model");
  }).catch(error => {
    console.warn(`Tab Hub: on-device guess failed for ${card.site}; the card remains usable.`, error);
  }).finally(() => queued.delete(card.id));
}

function Preview({ card, fragment }: { card: SavedCard; fragment?: Fragment }) {
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    setSource(undefined);
    setFailed(false);
    const imageId = fragment?.id ?? card.id;
    void (fragment
      ? getImage(imageId).then(image => image ?? getOrCacheVisual(card.id, card.previewUrl))
      : getOrCacheVisual(card.id, card.previewUrl)).then(image => {
      if (!live || !image) return;
      url = URL.createObjectURL(image);
      setSource(url);
    }).catch(error => {
      console.info(`Tab Hub: using text fallback for ${card.site}:`, error);
      if (live) setFailed(true);
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [card.id, card.previewUrl, fragment?.id]);
  return (
    <div className="card-visual">
      {source && !failed
        ? <img src={source} alt={fragment?.kind === "region" ? `Marked region from ${card.title}` : `Preview of ${card.title}`} onError={() => setFailed(true)} />
        : <div className="visual-fallback" aria-label={`No image available for ${card.title}`}>
            <span className="fallback-kicker">{fragment?.text ? "A marked detail" : card.site}</span>
            <span className="fallback-headline">{fragment?.text ? `“${fragment.text}”` : card.title}</span>
            <span className="fallback-bottom"><span>Saved reference</span><ImageOff size={17} strokeWidth={1.4} aria-hidden="true" /></span>
          </div>}
    </div>
  );
}

function FragmentImage({ fragment }: { fragment: Fragment }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    void getImage(fragment.id).then(image => {
      if (live && image) {
        url = URL.createObjectURL(image);
        setSource(url);
      }
    }).catch(error => console.warn("Tab Hub: fragment image could not be read.", error));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [fragment.id]);
  return source ? <img src={source} alt={fragment.kind === "region" ? "Marked visual region" : "Marked passage crop"} /> : null;
}

function Details({ card, fragments, provider, onClose, onDirtyChange, closeRequested, onDiscard }: {
  card: SavedCard;
  fragments: Fragment[];
  provider: GuessProvider;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  closeRequested: boolean;
  onDiscard: () => void;
}) {
  const [note, setNote] = useState(card.note);
  const [interpretation, setInterpretation] = useState(card.guess ?? "");
  const [noteEdited, setNoteEdited] = useState(false);
  const [guessEdited, setGuessEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const dirty = noteEdited || guessEdited;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!noteEdited) setNote(card.note); }, [card.note, noteEdited]);
  useEffect(() => { if (!guessEdited) setInterpretation(card.guess ?? ""); }, [card.guess, guessEdited]);

  async function save(): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      if (noteEdited) await updateNote(card.id, note);
      if (guessEdited) await updateGuess(card.id, interpretation, "user");
      setNoteEdited(false);
      setGuessEdited(false);
      setStatus("Saved on this device.");
      return true;
    } catch (cause) {
      setError(`Your edits were not saved: ${String(cause)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="detail-dialog">
      <DialogHeader>
        <p className="eyebrow">{card.site} · Saved {date.format(card.savedAt)}</p>
        <DialogTitle>{card.title}</DialogTitle>
        <DialogDescription>Keep the exact piece that made this page worth saving.</DialogDescription>
      </DialogHeader>
      <div className="detail-body">
        <Button variant="outline" onClick={() => chrome.tabs.create({ url: card.url })}>Open original <ArrowUpRight size={16} /></Button>
        <p className="detail-url" title={card.url}>{card.url}</p>
        {fragments.length > 0 && <section className="detail-section">
          <h3>Marked pieces <span>{fragments.length}</span></h3>
          <div className="fragment-list">{fragments.map(fragment => (
            <div className="fragment-item" key={fragment.id}>
              <FragmentImage fragment={fragment} />
              {fragment.text && <blockquote>“{fragment.text}”</blockquote>}
              <span className="fragment-date">{fragment.kind === "region" ? "Visual region" : "Selected passage"} · {date.format(fragment.savedAt)}</span>
            </div>
          ))}</div>
        </section>}
        <section className="detail-section">
          <label htmlFor={`note-${card.id}`}>Your note <span>Only you see this</span></label>
          <Textarea id={`note-${card.id}`} value={note} onChange={event => { setNote(event.target.value); setNoteEdited(true); setStatus(""); }} placeholder="What caught your eye?" rows={3} />
        </section>
        {(card.guess || provider.name !== "none") && <section className="detail-section">
          <label htmlFor={`guess-${card.id}`}>Why you might have saved this <span>{card.guessSource === "user" ? "Edited by you" : "On-device guess · editable"}</span></label>
          <Textarea id={`guess-${card.id}`} value={interpretation} onChange={event => { setInterpretation(event.target.value); setGuessEdited(true); setStatus(""); }} placeholder="Your interpretation" rows={2} />
        </section>}
        {error && <p className="detail-error" role="alert">{error}</p>}
        {closeRequested && dirty && <p className="detail-error" role="alert">Save your changes or explicitly discard them before closing.</p>}
        {status && <p className="detail-status" role="status">{status}</p>}
        <div className="detail-actions">
          <Button disabled={busy || !dirty} onClick={() => void save().then(success => { if (success && closeRequested) onClose(); })}>{busy ? "Saving…" : closeRequested ? "Save and close" : "Save changes"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => {
            if (dirty) void save().then(success => { if (success) onClose(); });
            else onClose();
          }}>Done</Button>
          {closeRequested && dirty && <Button variant="outline" disabled={busy} onClick={onDiscard}>Discard edits</Button>}
        </div>
      </div>
    </DialogContent>
  );
}

export function ReferenceCard({ card, group, fragments, provider, archived, selectionMode, selected, onToggleSelect, onDelete, onRestore }: {
  card: SavedCard;
  group?: SavedGroup;
  fragments?: FragmentRecord;
  provider: GuessProvider;
  archived: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (card: SavedCard) => void;
  onRestore: (card: SavedCard) => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const cardNode = useRef<HTMLElement>(null);
  const latest = fragments?.items.at(-1);
  const favicon = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(card.url)}&size=32`);

  useEffect(() => {
    if (archived || provider.name === "none" || card.guess || card.guessSource === "user") return;
    const element = cardNode.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        enqueueGuess(card, latest, provider);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [archived, card, latest, provider]);

  return (
    <Dialog open={open} onOpenChange={next => {
      if (!next && dirty) setCloseRequested(true);
      else { setOpen(next); setCloseRequested(false); }
    }}>
      <article ref={cardNode} className="reference-card" data-testid="reference-card">
        {selectionMode && <label className="card-select">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(card.id)} aria-label={`Select ${card.title}`} />
        </label>}
        <DialogTrigger asChild>
          <Button variant="ghost" className="card-preview-button" aria-label={`View details for ${card.title}`}><Preview card={card} fragment={latest} /></Button>
        </DialogTrigger>
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
          {latest?.kind === "text" && latest.text && <blockquote>“{latest.text}”</blockquote>}
          {card.note && <p className="card-note">{card.note}</p>}
          {card.guess && <p className="card-guess"><span>Why this might matter</span>{card.guess}</p>}
          <div className="card-footer">
            <Badge variant="secondary" className="group-badge">
              <span className="group-marker" data-color={group?.color ?? "grey"} />
              {group?.kind === "single" ? "Single tab" : group?.name ?? "Recovered"}
            </Badge>
            <div className="card-actions">
              <DialogTrigger asChild><Button variant="ghost" size="sm" aria-label={`Edit ${card.title}`}><PencilLine size={15} /> Details</Button></DialogTrigger>
              {archived && <Button variant="ghost" size="icon" title="Restore reference" aria-label={`Restore ${card.title}`}
                onClick={() => onRestore(card)}><ArchiveRestore size={17} /></Button>}
              <Button variant="ghost" size="icon" title="Delete permanently" aria-label={`Delete ${card.title}`}
                onClick={() => onDelete(card)}><Trash2 size={17} /></Button>
              <Button variant="ghost" size="icon" aria-label={`Open ${card.title}`} title="Open source" onClick={() => chrome.tabs.create({ url: card.url })}>
                <ArrowUpRight size={17} />
              </Button>
            </div>
          </div>
        </div>
      </article>
      {open && <Details card={card} fragments={fragments?.items ?? []} provider={provider}
        onDirtyChange={setDirty} closeRequested={closeRequested}
        onClose={() => { setDirty(false); setCloseRequested(false); setOpen(false); }}
        onDiscard={() => { setDirty(false); setCloseRequested(false); setOpen(false); }} />}
    </Dialog>
  );
}
