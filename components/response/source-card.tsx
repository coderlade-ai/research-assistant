"use client";

import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export interface Source {
  id: string;
  title: string;
  snippet: string;
  url: string;
  domain: string;
}

interface SourceCardProps {
  source: Source;
  index: number;
  onClick: () => void;
}

export function SourceCard({ source, index, onClick }: SourceCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-xl border border-border/40 bg-accent/40 p-3 text-left transition-all hover:bg-accent/70 hover:border-border/60"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 border border-primary/15 text-[11px] font-bold text-primary">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground/85 group-hover:text-primary transition-colors">
          {source.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground/60">
          {source.snippet}
        </p>
      </div>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all group-hover:text-primary/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </motion.button>
  );
}
