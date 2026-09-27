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
  archives: ArchiveStates;
}

export interface CardArchiveState {
  archivedAt: number | null;
  restoredFromEpoch?: string;
}

export interface GroupArchiveState {
  archivedAt: number | null;
  epoch: string;
}

export interface ArchiveStates {
  cards: Record<string, CardArchiveState>;
  groups: Record<string, GroupArchiveState>;
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
  | { type: "mark-text"; tabId: number; selectedText?: string }
  | { type: "start-region"; tabId: number }
  | { type: "mark-region"; pageUrl: string; rect: import("./region-overlay").PageRectangle }
  | { type: "open-hub" };

export type WorkerResponse =
  | { ok: true; result: CaptureResult | import("./fragments").MarkResult | null }
  | { ok: false; error: string };
