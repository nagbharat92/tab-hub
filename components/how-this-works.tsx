import React, { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, CircleHelp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import guideMarkdown from "@/HOW_IT_WORKS.md?raw";

const [heading, ...bodyLines] = guideMarkdown.trim().split("\n");
const title = heading?.replace(/^#\s+/, "") || "How Tab Hub works";
const body = bodyLines.join("\n").trim();

export function HowThisWorks() {
  const article = useRef<HTMLElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [copyError, setCopyError] = useState("");

  async function copyGuide() {
    if (!article.current) {
      setCopyError("The guide is not ready to copy.");
      return;
    }
    setCopyStatus("");
    setCopyError("");
    const plainText = `${title}\n\n${article.current.innerText.trim()}`;
    const richText = `<h1>${title}</h1>${article.current.innerHTML}`;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([richText], { type: "text/html" }),
            "text/plain": new Blob([plainText], { type: "text/plain" })
          })
        ]);
        setCopyStatus("Copied with formatting.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
        setCopyStatus("Formatted clipboard is unavailable, so the guide was copied as plain text.");
      } else {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
    } catch (error) {
      setCopyError(`Could not copy the guide: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="guide-trigger" size="sm" variant="ghost">
          <CircleHelp size={16} />
          How this works
        </Button>
      </DialogTrigger>
      <DialogContent className="guide-dialog">
        <DialogHeader className="guide-header">
          <p className="eyebrow">A short guide</p>
          <div className="guide-heading-row">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="guide-description">
                Save deliberately, find visually, and keep every reference on this device.
              </DialogDescription>
            </div>
            <div className="guide-copy-area">
              <Button size="sm" variant="outline" onClick={() => void copyGuide()}>
                {copyStatus ? <Check size={15} /> : <Copy size={15} />}
                Copy formatted text
              </Button>
              <span className={copyError ? "guide-copy-error" : "guide-copy-status"} role={copyError ? "alert" : "status"} aria-live="polite">
                {copyError || copyStatus}
              </span>
            </div>
          </div>
        </DialogHeader>
        <div className="guide-scroll">
          <article ref={article} className="guide-markdown">
            <ReactMarkdown>{body}</ReactMarkdown>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
