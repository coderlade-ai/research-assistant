"use client";

import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SourceCard, type Source } from "./source-card";
import { SourceModal } from "./source-modal";

interface SourcesSectionProps {
  sources: Source[];
}

export function SourcesSection({ sources }: SourcesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-xl border border-border/40 bg-accent/40 px-4 py-3 transition-all hover:bg-accent/70 hover:border-border/60"
      >
        <BookOpen className="h-4 w-4 text-primary/80" />
        <span className="text-sm font-medium text-foreground/80">Sources</span>
        <span className="ml-1 rounded-md bg-primary/10 border border-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">
          {sources.length}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              {sources.map((source, i) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  index={i}
                  onClick={() => {
                    setSelectedSource(source);
                    setModalOpen(true);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SourceModal
        source={selectedSource}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
