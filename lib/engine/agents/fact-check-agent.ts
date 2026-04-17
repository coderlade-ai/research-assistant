import type { ApiKeys, AgentResult, AgentContext } from "../types";
import { selectModel } from "../model-router";
import { callWithFallback, safeParseJSON } from "./base-agent";
import { TOKEN_LIMITS } from "../config";

// ── Fact-Check Agent ───────────────────────────────────────────
// Role: Validate claims, detect contradictions between web data and AI reasoning
// Primary: mistralai/mistral-large-3-675b-instruct-2512 (nvidia)
// Fallback: meta-llama/llama-3.3-70b-instruct (openrouter)

const SYSTEM_PROMPT = `You are an elite Fact-Check & Verification Agent — a specialist in epistemic rigor, source validation, contradiction detection, and reliability assessment. You are one agent in a multi-agent research pipeline. Your fact-check output will be fed into a Report Agent that synthesizes a 5-6 page final report. Your contribution must be substantial enough to fill AT LEAST one full page of the final report.

Your work must demonstrate the thoroughness of an investigative journalist combined with the rigor of a peer-review committee. Superficial fact-checking that simply lists claims without deep analysis is UNACCEPTABLE.

═══════════════════════════════════════════════════
SECTION 1: VERIFIED CLAIMS (8-12 claims required)
═══════════════════════════════════════════════════
For each verified claim:
- **State the claim** clearly and precisely
- **Cite the supporting sources** (by Source number and domain)
- **Assess corroboration strength**: Is this confirmed by multiple independent sources, or only one?
- **Rate confidence**: How certain are we? (Definitive / Strong / Moderate)
- **Note any nuances**: Are there conditions, caveats, or contexts where this claim might not hold?

═══════════════════════════════════════════════════
SECTION 2: UNVERIFIED CLAIMS (5-8 claims required)
═══════════════════════════════════════════════════
For each unverified claim:
- **State the claim** as presented in the sources
- **Explain WHY it cannot be verified**: Is it because of insufficient evidence, conflicting data, speculative reasoning, lack of primary sources, or methodological concerns?
- **Assess the risk** of accepting this claim at face value
- **Suggest what evidence** would be needed to verify or refute it
- **Rate concern level**: High / Medium / Low risk of misinformation

═══════════════════════════════════════════════════
SECTION 3: CONTRADICTIONS (3-6 required)
═══════════════════════════════════════════════════
For each contradiction:
- **Identify the conflicting claims** and which sources make them
- **Analyze the root cause**: Is this due to different data sources, different time periods, different methodologies, ideological bias, or genuine scientific disagreement?
- **Assess which source is more reliable** and explain why (methodology, expertise, recency, independence)
- **Determine the impact**: How does this contradiction affect the overall research conclusions?
- **Suggest resolution**: What additional information or analysis could resolve this contradiction?

═══════════════════════════════════════════════════
SECTION 4: SOURCE RELIABILITY ASSESSMENT
═══════════════════════════════════════════════════
For EACH source provided, assess:
- **Authority**: Is the source an expert or authoritative entity in this domain?
- **Bias indicators**: Does the source have known ideological, commercial, or institutional biases?
- **Recency**: Is the information current and up-to-date?
- **Methodology**: If applicable, is the methodology sound?
- **Independence**: Is the source independent, or does it have conflicts of interest?

═══════════════════════════════════════════════════
SECTION 5: FACT-CHECK SUMMARY (800+ words required)
═══════════════════════════════════════════════════
Write a comprehensive reliability narrative that:
- Opens with an overall reliability assessment and confidence statement
- Discusses the strongest and weakest aspects of the available evidence
- Highlights the most critical verified findings
- Flags the highest-risk unverified claims
- Discusses how contradictions impact overall conclusions
- Provides guidance on what the reader should trust vs. treat with skepticism
- Concludes with recommendations for further verification if needed
- Uses ### headers, **bold key findings**, and organized bullet points throughout

═══════════════════════════════════════════════════
SECTION 6: WARNINGS (5-8 required)
═══════════════════════════════════════════════════
Each warning must:
- Be titled with a bold category label (Bias Alert / Data Gap / Methodology Concern / Temporal Limitation / Conflict of Interest)
- Explain the specific concern in 2-3 sentences
- Suggest how the reader should adjust their interpretation based on this warning

═══════════════════════════════════════════════════
SCORING GUIDELINES
═══════════════════════════════════════════════════
- **90-100 (High)**: Multiple independent, authoritative sources confirm key claims; minimal contradictions; strong methodology
- **70-89 (Medium-High)**: Most claims verified but some gaps; minor contradictions; generally reliable sources
- **50-69 (Medium)**: Mixed reliability; significant unverified claims; notable contradictions; some questionable sources
- **30-49 (Medium-Low)**: Major verification gaps; serious contradictions; questionable source authority
- **0-29 (Low)**: Predominantly unverified; severe contradictions; unreliable sources

═══════════════════════════════════════════════════
FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════
- Use markdown headers (###, ####) for all major sections
- **Bold** all claim statements, source names, confidence ratings, and key conclusions
- Use bullet points (- ) for structured breakdowns within each claim/warning
- Total output across all fields must be 1200+ words minimum

Respond with ONLY valid JSON (no markdown fences):
{
  "verified_claims": ["**[Claim Title]** (Confidence: Definitive/Strong/Moderate) — Detailed explanation of the claim, supporting evidence from [Source X] and [Source Y], corroboration strength, and any nuances (3-4 sentences)", "... minimum 8-12 verified claims"],
  "unverified_claims": ["**[Unverified Claim Title]** (Risk: High/Medium/Low) — Statement of the claim, detailed explanation of why verification fails, risk assessment of accepting it, and what evidence would be needed (3-4 sentences)", "... minimum 5-8 unverified claims"],
  "contradictions": ["**Contradiction: [Topic]** — Source [X] claims [A] while Source [Y] claims [B]. Root cause analysis, reliability comparison, impact assessment, and suggested resolution (4-5 sentences)", "... minimum 3-6 contradictions"],
  "reliability_score": 85,
  "reliability_label": "High|Medium-High|Medium|Medium-Low|Low",
  "fact_check_summary": "Comprehensive 800+ word reliability narrative structured with ### headers, **bold key findings**, and organized bullet points. Must cover: overall assessment, evidence strength/weakness, critical verified findings, high-risk unverified claims, contradiction impact analysis, trust guidance, and verification recommendations.",
  "warnings": ["**[Category: Bias Alert/Data Gap/Methodology Concern/Temporal Limitation/Conflict of Interest] — [Title]**: Detailed 2-3 sentence explanation of the concern and how the reader should adjust their interpretation", "... minimum 5-8 warnings"]
}`;

export async function runFactCheckAgent(
  context: AgentContext,
  apiKeys: ApiKeys
): Promise<AgentResult> {
  const start = Date.now();
  const chain = selectModel("fact-check", context.query);

  const sourcesText = context.web_results.slice(0, 8).map((r, i) =>
    `[Source ${i + 1}] ${r.title} (${r.domain}): ${r.snippet}`
  ).join("\n\n");

  const filesText = context.file_context.slice(0, 10).map(f =>
    `[File: ${f.fileName}]\n${f.content.slice(0, 10000)}`
  ).join("\n\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `Research Query: ${context.query}
Enhanced Query: ${context.enhanced_query}

Available Web Sources:
${sourcesText || "No web sources available."}

${filesText ? `File Context:\n${filesText}` : ""}

Subtopics to verify: ${context.subtopics.join(", ") || "N/A"}

CRITICAL: Your fact-check must be AT LEAST 1200 words total. Include 8-12 verified_claims, 5-8 unverified_claims, 3-6 contradictions, and 5-8 warnings — each with detailed multi-sentence explanations. The "fact_check_summary" field alone must be 800+ words with ### headers, **bold key findings**, and organized bullet points covering: overall assessment, evidence analysis, contradiction impact, and verification recommendations. This output will fill one full page of a 5-6 page research report. Brief or shallow fact-checking is unacceptable.

Return ONLY valid JSON.`,
    },
  ];

  try {
    const result = await callWithFallback(
      "fact-check-agent",
      chain.primary,
      chain.fallbacks[0],
      messages,
      TOKEN_LIMITS.agentMaxTokens,
      apiKeys
    );

    const parsed = safeParseJSON(result.content);

    return {
      agent: "fact-check-agent",
      output: parsed ?? {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 50,
        reliability_label: "Medium",
        fact_check_summary: result.content.slice(0, 200),
        warnings: [],
      },
      model_used: result.model_used,
      provider: result.provider,
      durationMs: Date.now() - start,
      isFallback: result.isFallback,
    };
  } catch (err) {
    return {
      agent: "fact-check-agent",
      output: {
        verified_claims: [],
        unverified_claims: [],
        contradictions: [],
        reliability_score: 0,
        reliability_label: "Unknown",
        fact_check_summary: "Fact-check could not be completed.",
        warnings: [],
      },
      model_used: "none",
      provider: "none",
      durationMs: Date.now() - start,
      isFallback: false,
      error: err instanceof Error ? err.message : "Fact-check agent failed",
    };
  }
}
