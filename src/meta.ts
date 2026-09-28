import type { ThreadSave } from "./threads";

const day = 86_400_000;

export function relativeTime(savedAt: number, now = Date.now()): string {
  const start = new Date(now);
  const date = new Date(savedAt);
  const midnight = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = (midnight(start) - midnight(date)) / day;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", ...(date.getFullYear() !== start.getFullYear() ? { year: "numeric" } : {})
  }).format(date);
}

export function saveDomain(save: Pick<ThreadSave, "url" | "site">): string {
  try {
    const url = new URL(save.url);
    if (/^(?:www\.)?(?:x|twitter)\.com$/i.test(url.hostname)) {
      const handle = url.pathname.split("/")[1];
      if (handle && !["i", "search", "home", "intent", "share", "hashtag", "explore", "settings", "messages", "notifications"].includes(handle.toLowerCase())) return `@${handle}`;
    }
    return url.hostname.replace(/^www\./i, "") || save.site;
  } catch {
    return save.site;
  }
}
