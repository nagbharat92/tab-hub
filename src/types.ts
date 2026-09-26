export type GroupColor = chrome.tabGroups.ColorEnum | "grey";

export interface SavedGroup {
  id: string;
  name: string;
  color: GroupColor;
  kind: "group" | "single";
  savedAt: number;
  cardIds: string[];
}

export interface SavedCard {
  id: string;
  groupId: string;
  url: string;
  title: string;
  site: string;
  savedAt: number;
  order: number;
  note: string;
  description?: string;
  previewUrl?: string;
  guess?: string;
  guessSource?: "model" | "user";
}

export interface Library {
  groups: SavedGroup[];
  cards: SavedCard[];
}

export interface CaptureResult {
  saved: number;
  closed: number;
  skipped: number;
  groupId: string;
  warnings: string[];
}

export type WorkerRequest =
  | { type: "capture-tab"; tabId: number }
  | { type: "capture-group"; groupId: number }
  | { type: "open-hub" };

export type WorkerResponse =
  | { ok: true; result: CaptureResult | null }
  | { ok: false; error: string };
