export interface RelevantChunk {
  text: string;
  similarity: number;
}

export interface SearchResult {
  url: string;
  content: string;
  title?: string;
  excerpt?: string;
  error?: string;
  relevantChunks?: RelevantChunk[];
  // Support both camelCase and PascalCase for API response fields
  verdict?: "Support" | "Partially Support" | "Unclear" | "Contradict" | "Refute";
  Verdict?: "Support" | "Partially Support" | "Unclear" | "Contradict" | "Refute";
  reference?: string;
  Reference?: string | string[];
  trustScore?: number;
  Trust_Score?: number;
  trust_score?: number;
  aggregateTrustScore?: number;
}

export interface ClaimsResponse {
  claims: Array<{
    claim: string;
    search_date: string;
  }>;
  search_date: string;
  searchResults?: SearchResult[];
  factCheckResults?: Array<{
    claim: string;
    relevantChunks: RelevantChunk[];
  }>;
  aggregateTrustScore?: number;
  analysis?: unknown;
  factChecks?: FactCheckResult[];
}

export interface ClaimsListProps {
  claims: ClaimsResponse | null;
  searchResults?: SearchResult[];
}

// Reclaimify and Fact Check shared types
export interface DisambiguationResult {
  sentence: string;
  isAmbiguous: boolean;
  reasoning: string;
  ambiguityType?: 'referential' | 'structural';
  ambiguityReasoning?: string;
  canBeDisambiguated?: boolean;
  disambiguationReasoning?: string;
  disambiguatedSentence?: string;
  clarityReasoning?: string;
}

export interface CategorizedSentence {
  sentence: string;
  category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable';
  reasoning: string;
}

export interface RewrittenPartial {
  originalSentence: string;
  reasoning: string;
  rewrittenSentence: string;
}

export interface ReclaimifyApiResponse {
  url: string;
  title?: string;
  excerpt?: string;
  content: string;
  sentences: string[];
  timestamp: string;
  categorizedSentences?: CategorizedSentence[];
  rewrittenPartials?: RewrittenPartial[];
  disambiguatedSentences?: DisambiguationResult[];
}

export interface FactCheckResult {
  claim: string;
  verdict?: "Support" | "Partially Support" | "Unclear" | "Contradict" | "Refute";
  Verdict?: "Support" | "Partially Support" | "Unclear" | "Contradict" | "Refute";
  reference?: string | string[];
  Reference?: string | string[];
  trustScore?: number;
  Trust_Score?: number;
  trust_score?: number;
  url?: string;
}
