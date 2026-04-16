"use client";

import { ChevronDown, Zap, Brain, Code, Scale } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODEL_REGISTRY } from "@/lib/engine/config";
import type { ResolvedModel } from "@/lib/engine/types";

const getTypeIcon = (type: string) => {
  switch (type) {
    case "fast":
      return <Zap className="h-3 w-3 mr-1" />;
    case "reasoning":
      return <Brain className="h-3 w-3 mr-1" />;
    case "coding":
      return <Code className="h-3 w-3 mr-1" />;
    case "balanced":
      return <Scale className="h-3 w-3 mr-1" />;
    default:
      return null;
  }
};

interface ModelSelectorProps {
  selected: string;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({ selected, onSelect }: ModelSelectorProps) {
  const allModels = [...MODEL_REGISTRY.nvidia, ...MODEL_REGISTRY.openrouter];
  const selectedModel = allModels.find((m) => m.id === selected);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground">
        {selectedModel?.displayName ?? "Auto"}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 border-glass-border bg-card/95 backdrop-blur-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
            🟢 NVIDIA Models
          </DropdownMenuLabel>
          {MODEL_REGISTRY.nvidia.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={selected === model.id ? "bg-accent text-foreground" : ""}
            >
              <div>
                <p className="text-sm font-medium">{model.displayName}</p>
                <div className="flex items-center text-xs text-muted-foreground capitalize mt-0.5">
                  {getTypeIcon(model.type)}
                  {model.type}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
            🟡 OpenRouter Models
          </DropdownMenuLabel>
          {MODEL_REGISTRY.openrouter.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={selected === model.id ? "bg-accent text-foreground" : ""}
            >
              <div>
                <p className="text-sm font-medium">{model.displayName}</p>
                <div className="flex items-center text-xs text-muted-foreground capitalize mt-0.5">
                  {getTypeIcon(model.type)}
                  {model.type}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
