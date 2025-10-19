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
  verdict?: "Support" | "Partially Support" | "Unclear" | "Contradict" | "Refute";
  reference?: string;
  trustScore?: number;
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
}

export interface ClaimsListProps {
  claims: ClaimsResponse | null;
  searchResults?: SearchResult[];
}
