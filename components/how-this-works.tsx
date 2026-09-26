import React from "react";
import ReactMarkdown from "react-markdown";
import { CircleHelp } from "lucide-react";
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Save deliberately, find visually, and keep every reference on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="guide-scroll">
          <article className="guide-markdown">
            <ReactMarkdown>{body}</ReactMarkdown>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
