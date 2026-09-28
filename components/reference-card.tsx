import React, { useEffect, useRef, useState } from "react";
import { getImage } from "@/src/media";
import { relativeTime, saveDomain } from "@/src/meta";
import type { SavedThread, ThreadSave } from "@/src/threads";
import { getOrCacheVisual } from "@/src/visuals";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function useSaveImage(save: ThreadSave, visible: boolean): { src?: string; pending: boolean } {
  const key = `${save.id}:${save.imageId ?? save.previewUrl ?? ""}`;
  const hasVisual = save.kind !== "passage" && Boolean(save.imageId || save.kind === "page" && save.previewUrl);
  const [image, setImage] = useState<{ key: string; src?: string; pending: boolean }>({ key, pending: hasVisual });
  useEffect(() => {
    if (!visible || !hasVisual) return;
    let live = true;
    let objectUrl: string | undefined;
    setImage({ key, pending: true });
    const image = save.imageId ? getImage(save.imageId) :
      save.kind === "page" ? getOrCacheVisual(save.cardId, save.previewUrl) : Promise.resolve(undefined);
    void image.then(blob => {
      if (!live) return;
      if (blob) objectUrl = URL.createObjectURL(blob);
      setImage({ key, src: objectUrl, pending: false });
    }).catch(error => {
      console.info("Tab Hub: locally saved visual unavailable; keeping the reference.", error);
      if (live) setImage({ key, pending: false });
    });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [hasVisual, key, save.cardId, save.imageId, save.kind, save.previewUrl, visible]);
  return image.key === key ? image : { pending: hasVisual };
}

export function ThreadFace({ save, panel = false, onVisible }: {
  save: ThreadSave;
  panel?: boolean;
  onVisible?: (save: ThreadSave) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(panel);
  const [inViewport, setInViewport] = useState(panel);
  const notified = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (panel) { setVisible(true); setInViewport(true); return; }
    const element = node.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      const inside = entries.some(entry => entry.isIntersecting);
      setInViewport(inside);
      if (inside) {
        setVisible(true);
        if (notified.current !== save.id) {
          notified.current = save.id;
          onVisible?.(save);
        }
      }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible, panel, save]);
  const [ratio, setRatio] = useState<number>();
  useEffect(() => { setFailed(false); setRatio(undefined); }, [save.imageId, save.id]);
  const image = useSaveImage(save, visible);
  const meta = `${panel ? "" : `${saveDomain(save)} · `}${relativeTime(save.savedAt)}`;
  const measure = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
  };
  const regionStyle = save.kind === "region" && ratio ? { aspectRatio: String(clamp(ratio, 0.7, 1.5)) } : undefined;
  const pageImageStyle = ratio ? { aspectRatio: String(clamp(ratio, 1.1, 2.2)) } : undefined;
  return (
    <div ref={node} className={`thread-face face-${save.kind} ${image.src && !failed ? "has-image" : ""} ${image.pending && !failed ? "is-loading-image" : ""}`}
      style={regionStyle} data-kind={save.kind} data-in-viewport={inViewport ? "true" : "false"}>
      {save.kind === "region" && image.src && !failed && <img className="region-image" src={image.src} alt={`Marked region from ${save.title}`} onLoad={measure} onError={() => setFailed(true)} />}
      <span className="face-meta">{meta}</span>
      {save.kind === "page" && <>
        <span className="face-title">{save.title}</span>
        {image.src && !failed && <img className="page-image" style={pageImageStyle} src={image.src} alt={`Preview of ${save.title}`} onLoad={measure} onError={() => setFailed(true)} />}
      </>}
      {save.kind === "passage" && <span className="face-passage">{save.text}</span>}
    </div>
  );
}

export function ThreadCard({ thread, index, selected, onSelect, onVisible }: {
  thread: SavedThread;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onVisible?: (save: ThreadSave) => void;
}) {
  const stacked = thread.visibleSaves.length > 1;
  return (
    <div className={`thread-stack ${stacked ? "is-stack" : ""}`}
      style={{ "--stack-rotation": index % 2 ? "-2.5deg" : "2.5deg" } as React.CSSProperties}>
      <article role="button" tabIndex={0} aria-label={`View ${thread.face.title}`}
        aria-pressed={selected} data-testid="reference-card" data-thread-id={thread.id}
        className={`reference-card ${selected ? "is-selected" : ""}`}
        onClick={() => onSelect(thread.id)}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(thread.id); }
        }}>
        <ThreadFace save={thread.face} onVisible={onVisible} />
      </article>
    </div>
  );
}
