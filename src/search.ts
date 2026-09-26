import type { SavedCard } from "./types";
import type { FragmentRecord } from "./media";

export function searchCards(cards: SavedCard[], query: string, fragments: Map<string, FragmentRecord>): SavedCard[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return cards;
  return cards.filter(card => {
    const text = [card.title, card.site, card.url, card.note, ...(fragments.get(card.id)?.items.map(item => item.text) ?? [])].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
