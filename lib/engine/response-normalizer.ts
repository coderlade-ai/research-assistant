import type { ResearchResult, ResearchSource, SearchResult, ResponseSection } from "./types";

// ── JSON Extraction ────────────────────────────────────────────

function tryExtractJson(raw: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // noop
  }

  // Try extracting from markdown code fence
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // noop
    }
  }

  // Try extracting first { ... } block
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // noop
    }
  }

  return null;
}

// ── Ensure String Array ────────────────────────────────────────

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" && v.trim());
  return [];
}

// ── Section-Based Parsing (fallback for non-JSON) ──────────────

function parseStructuredText(raw: string): Partial<ResearchResult> {
  const lines = raw.split("\n");
  let overview = "";
  const keyInsights: string[] = [];
  const expertInsights: string[] = [];
  let details = "";
  let comparison = "";
  let conclusion = "";

  let currentSection = "overview";

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    const headerMatch = trimmed.match(/^#+\s*(.+)/);
    if (headerMatch) {
      const heading = headerMatch[1].toLowerCase();
      if (heading.includes("overview") || heading.includes("summary") || heading.includes("introduction")) {
        currentSection = "overview";
      } else if (heading.includes("key") && (heading.includes("insight") || heading.includes("finding"))) {
        currentSection = "insights";
      } else if (heading.includes("expert") || heading.includes("advanced") || heading.includes("notable")) {
        currentSection = "expert";
      } else if (heading.includes("detail") || heading.includes("analysis") || heading.includes("discussion")) {
        currentSection = "details";
      } else if (heading.includes("compar") || heading.includes("vs") || heading.includes("versus")) {
        currentSection = "comparison";
      } else if (heading.includes("conclusion") || heading.includes("takeaway") || heading.includes("result")) {
        currentSection = "conclusion";
      }
      continue;
    }

    // Detect bullet points
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      if (currentSection === "insights" || currentSection === "overview") {
        keyInsights.push(bulletMatch[1]);
      } else if (currentSection === "expert") {
        expertInsights.push(bulletMatch[1]);
      }
      continue;
    }

    // Accumulate text
    if (!trimmed) continue;
    switch (currentSection) {
      case "overview":
        overview += (overview ? " " : "") + trimmed;
        break;
      case "details":
        details += (details ? " " : "") + trimmed;
        break;
      case "comparison":
        comparison += (comparison ? " " : "") + trimmed;
        break;
      case "conclusion":
        conclusion += (conclusion ? " " : "") + trimmed;
        break;
    }
  }

  return { overview, keyInsights, expertInsights, details, comparison, conclusion };
}

// ── Source Conversion ──────────────────────────────────────────

function convertSources(searchResults: SearchResult[]): ResearchSource[] {
  return searchResults.map((r, i) => ({
    id: String(i + 1),
    title: r.title,
    snippet: r.snippet,
    url: r.url,
    domain: r.domain,
  }));
}

// ── Public: Normalize Raw LLM Output → ResearchResult ──────────

export function normalizeResponse(
  rawText: string,
  searchResults: SearchResult[],
  metadata: ResearchResult["metadata"]
): ResearchResult {
  const sources = convertSources(searchResults);

  // Try JSON parsing first
  const json = tryExtractJson(rawText);
  if (json) {
    return {
      overview: String(json.overview ?? json.summary ?? ""),
      keyInsights: toStringArray(json.key_insights ?? json.keyInsights),
      details: String(json.details ?? json.analysis ?? ""),
      comparison: String(json.comparison ?? ""),
      expertInsights: toStringArray(json.expert_insights ?? json.expertInsights),
      conclusion: String(json.conclusion ?? json.takeaway ?? ""),
      sources,
      references: sources,
      metadata,
    };
  }

  // Fall back to structured text parsing
  const parsed = parseStructuredText(rawText);

  // If parsing produced nothing, wrap raw text
  if (!parsed.overview && !parsed.details) {
    return {
      overview: rawText.slice(0, 500),
      keyInsights: [],
      details: rawText.length > 500 ? rawText.slice(500) : "",
      comparison: "",
      expertInsights: [],
      conclusion: "",
      sources,
      references: sources,
      metadata,
    };
  }

  return {
    overview: parsed.overview ?? "",
    keyInsights: parsed.keyInsights ?? [],
    details: parsed.details ?? "",
    comparison: parsed.comparison ?? "",
    expertInsights: parsed.expertInsights ?? [],
    conclusion: parsed.conclusion ?? "",
    sources,
    references: sources,
    metadata,
  };
}

// ── Public: ResearchResult → UI ResponseSection[] ──────────────

export function toResponseSections(result: ResearchResult): ResponseSection[] {
  const sections: ResponseSection[] = [];

  if (result.overview) {
    sections.push({ type: "heading", content: "🔍 Overview" });
    sections.push({ type: "paragraph", content: result.overview });
  }

  if (result.keyInsights.length > 0) {
    sections.push({ type: "heading", content: "⚡ Key Insights" });
    sections.push({ type: "bullets", content: "", items: result.keyInsights });
  }

  if (result.details) {
    sections.push({ type: "heading", content: "📊 Analysis" });
    sections.push({ type: "paragraph", content: result.details });
  }

  if (result.comparison) {
    sections.push({ type: "heading", content: "⚖️ Comparison" });
    sections.push({ type: "paragraph", content: result.comparison });
  }

  // Code section (from Coding Agent)
  if (result.code) {
    sections.push({ type: "heading", content: "💻 Code" });
    sections.push({ type: "code", content: result.code });
  }

  if (result.expertInsights.length > 0) {
    sections.push({ type: "heading", content: "🧠 Expert Insights" });
    sections.push({ type: "bullets", content: "", items: result.expertInsights });
  }

  if (result.conclusion) {
    sections.push({ type: "heading", content: "🚀 Conclusion" });
    sections.push({ type: "paragraph", content: result.conclusion });
  }

  // Fact-Check section (from Fact-Check Agent)
  if (result.factCheck) {
    sections.push({ type: "heading", content: "🔍 Fact Check" });
    sections.push({ type: "fact_check", content: result.factCheck });
  }

  // References section
  if (result.references.length > 0) {
    sections.push({ type: "heading", content: "📚 Sources" });
    sections.push({
      type: "bullets",
      content: "",
      items: result.references.map(
        (ref) => `[${ref.id}] ${ref.title} — ${ref.domain} (${ref.url})`
      ),
    });
  }

  return sections;
}

// ── Public: ResearchResult → Export-Ready Markdown ──────────────

export function toExportMarkdown(result: ResearchResult): string {
  const lines: string[] = [];

  if (result.overview) {
    lines.push("## 🔍 Overview", "", result.overview, "");
  }

  if (result.keyInsights.length > 0) {
    lines.push("## ⚡ Key Insights", "");
    result.keyInsights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (result.details) {
    lines.push("## 📊 Analysis", "", result.details, "");
  }

  if (result.comparison) {
    lines.push("## ⚖️ Comparison", "", result.comparison, "");
  }

  if (result.code) {
    lines.push("## 💻 Code", "", result.code, "");
  }

  if (result.expertInsights.length > 0) {
    lines.push("## 🧠 Expert Insights", "");
    result.expertInsights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (result.conclusion) {
    lines.push("## 🚀 Conclusion", "", result.conclusion, "");
  }

  if (result.factCheck) {
    lines.push("## 🔍 Fact Check", "", result.factCheck, "");
  }

  if (result.references.length > 0) {
    lines.push("## 📚 Sources", "");
    result.references.forEach((ref) => {
      lines.push(`${ref.id}. [${ref.title}](${ref.url}) — ${ref.domain}`);
    });
    lines.push("");
  }

  // Agent trace footer
  if (result.metadata.agentTrace) {
    lines.push("---", "### Agent Trace", "");
    result.metadata.agentTrace.forEach((t) => {
      const icon = t.status === "done" ? "✓" : t.status === "failed" ? "✗" : t.status === "skipped" ? "⟳" : "…";
      lines.push(`${icon} **${t.agent}** → ${t.model ?? "—"}${t.isFallback ? " *(fallback)*" : ""} ${t.durationMs ? `[${(t.durationMs / 1000).toFixed(1)}s]` : ""}`);
    });
    lines.push("");
  }

  lines.push("---", `*Generated by ResAgent | Model: ${result.metadata.model} | ${result.metadata.durationMs}ms*`);

  return lines.join("\n");
}
