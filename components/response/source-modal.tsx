"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import type { Source } from "./source-card";

interface SourceModalProps {
  source: Source | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceModal({ source, open, onOpenChange }: SourceModalProps) {
  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card/95 backdrop-blur-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug text-foreground/90">
            {source.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-[1.75] text-muted-foreground/80">
            {source.snippet}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <span className="rounded-md bg-accent border border-border/50 px-2 py-0.5 font-mono text-[11px]">
              {source.domain}
            </span>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/85 hover:glow-sm"
          >
            Visit Source
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
