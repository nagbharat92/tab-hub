import type { SavedCard } from "./types";
import type { FragmentRecord } from "./media";
import type { SavedThread } from "./threads";

export function searchCards(cards: SavedCard[], query: string, fragments: Map<string, FragmentRecord>): SavedCard[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return cards;
  return cards.filter(card => {
    const text = [card.title, card.site, card.url, card.note, card.guess, ...(fragments.get(card.id)?.items.map(item => item.text) ?? [])].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export function searchThreads(threads: SavedThread[], query: string, includeArchived = false): SavedThread[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return threads;
  return threads.filter(thread => {
    const text = (includeArchived ? thread.saves : thread.visibleSaves).flatMap(save =>
      [save.title, save.site, save.url, save.note, save.guess, save.text]
    ).join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
