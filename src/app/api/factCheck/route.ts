import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  vertexai: false,
});

interface EmbeddingValue { values: number[]; }
interface EmbeddingResponse { embeddings: EmbeddingValue[]; }

const RATE_LIMIT_DELAY = 100;
const MAX_REQUEST_DURATION = 300000; // 5 minutes max request duration
let lastRequestTime = 0;

// Helper function to create a promise that rejects after a timeout
function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) return [];
  try {
    console.log(`Generating embedding for text (${text.length} chars)`);
    await rateLimit();
    const resp = await timeout(ai.models.embedContent({ 
      model: "text-embedding-004", 
      contents: text 
    }), 30000) as EmbeddingResponse; // 30s timeout for embedding
    
    const vals = resp.embeddings?.[0]?.values;
    if (!Array.isArray(vals)) {
      console.error('Invalid embedding response:', { response: resp });
      return [];
    }
    return vals;
  } catch (error) {
    console.error('Error generating embedding:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// Simple sentence splitter that handles common cases
function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  // Split on sentence terminators followed by whitespace or end of string
  return text
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Get top N most relevant sentences to a claim
async function getTopSentences(claim: string, text: string, maxSentences: number = 3): Promise<string[]> {
  if (!text?.trim()) return [];
  
  const sentences = splitIntoSentences(text);
  if (sentences.length <= maxSentences) return sentences;
  
  try {
    // Get embeddings for claim and all sentences in a single batch
    const textsToEmbed = [claim, ...sentences];
    const embeddings = await Promise.all(
      textsToEmbed.map(text => generateEmbedding(text))
    );
    
    const claimEmbedding = embeddings[0];
    if (!claimEmbedding?.length) return sentences.slice(0, maxSentences);
    
    // Calculate similarities and get top N sentences
    const sentenceScores = sentences.map((sentence, i) => ({
      text: sentence,
      score: cosineSimilarity(claimEmbedding, embeddings[i + 1] || [])
    }));
    
    return sentenceScores
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .sort((a, b) => 
        sentences.indexOf(a.text) - sentences.indexOf(b.text)
      )
      .map(item => item.text);
  } catch (error) {
    console.error('Error in getTopSentences:', error);
    return sentences.slice(0, maxSentences);
  }
}

interface FactCheckRequest {
  claims: Array<{
    claim: string;
    content: string | string[];
  }>;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 9);
  
  console.log(`[${requestId}] Starting fact-check request`);
  
  // Set up a timeout for the entire request
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timed out')), MAX_REQUEST_DURATION)
  );

  try {
    const requestBody = await request.json();
    console.log('Received fact-check request:', JSON.stringify({
      claimsCount: requestBody?.claims?.length || 0,
      sampleClaim: requestBody?.claims?.[0]
    }, null, 2));
    
    const { claims: claimContents } = requestBody as FactCheckRequest;

    if (!claimContents?.length) {
      return NextResponse.json({ error: 'No claims provided' }, { status: 400 });
    }

    // Process claims with sentence-level augmentation
    const processedClaims = [];
    const MAX_SOURCES_PER_CLAIM = 3;
    const MAX_SENTENCES_PER_SOURCE = 3;

    for (const { claim, content } of claimContents) {
      if (!content) {
        processedClaims.push({ claim, chunks: [] });
        continue;
      }

      // Process each source (either from array or split by SOURCE delimiter)
      const sources: string[] = Array.isArray(content) 
        ? content 
        : String(content).split('\n---SOURCE---\n');

      // Get top sentences from each source in parallel
      const sourcePromises = sources
        .slice(0, MAX_SOURCES_PER_CLAIM)
        .map(source => 
          getTopSentences(claim, source, MAX_SENTENCES_PER_SOURCE)
            .then(sentences => ({
              source: source.split('\n')[0] || 'Source', // Use first line as source identifier
              sentences: sentences.filter(Boolean)
            }))
        );

      // Wait for all sources to be processed
      const sourceResults = await Promise.allSettled(sourcePromises);
      
      // Combine results, filtering out any failed sources
      const validSources = sourceResults
        .filter((result): result is PromiseFulfilledResult<{source: string, sentences: string[]}> => 
          result.status === 'fulfilled' && 
          result.value.sentences.length > 0
        )
        .map(result => result.value);

      // Format the chunks with source information
      const chunks = validSources.map(({ source, sentences }) => 
        `[${source}] ${sentences.join(' ')}`
      );

      processedClaims.push({ 
        claim, 
        chunks: chunks.slice(0, MAX_SOURCES_PER_CLAIM) 
      });
    }

    // Filter out any claims without valid chunks
    const perClaimChunks = processedClaims.filter(item => item.chunks.length > 0);

    const prompt = `You are an expert fact-checking assistant. For each claim, analyze the provided evidence snippets from up to 3 sources. Each snippet is prefixed with [Source N] to indicate its origin.

For each claim, provide:
1. A verdict based on the evidence
2. The most relevant quotes supporting your verdict
3. A trust score based on the strength of evidence

Strictly output a JSON array where each element has these keys:
- claim: The original claim text
- Verdict: One of ["Support","Partially Support","Unclear","Contradict","Refute"]
- Reference: Array of 1-3 exact quotes from the evidence (include source numbers like [Source 1])
- Trust_Score: Number from 0-100 based on evidence strength
  - 100: Strong support with multiple reliable sources
  - 65-99: Partial support or single source
  - 50: Unclear or conflicting evidence
  - 0-49: Evidence contradicts the claim

Format example:
[
  {
    "claim": "Example claim",
    "Verdict": "Support",
    "Reference": ["[Source 1] Supporting evidence quote."],
    "Trust_Score": 85
  }
]`;
  
    // Helper function to normalize and validate results
    interface ParsedItem {
      claim?: string;
      Verdict?: string;
      Reference?: string | string[] | null;
      Trust_Score?: number;
      [key: string]: unknown;
    }

    function normalizeResults(parsed: ParsedItem[]): Array<{claim: string; Verdict: string; Reference: string[]; Trust_Score: number}> {
      const normalize = (v: string) => (v || '').trim().toLowerCase();
      
      const scoreFor = (v: string): number => {
        const n = normalize(v);
        if (n === 'support' || n === 'supports') return 100;
        if (n === 'partially support' || n === 'partially_supports' || n === 'partially-supports') return 65;
        if (n === 'unclear' || n === 'neutral') return 50;
        if (n === 'contradict' || n === 'refute' || n === 'contradicts' || n === 'refutes') return 0;
        return 50;
      };

      return (parsed || []).map(item => {
        const verdicts = ['Support', 'Partially Support', 'Unclear', 'Contradict', 'Refute'] as const;
        const verdict = item.Verdict ?? '';
        const isValidVerdict = verdicts.includes(verdict as typeof verdicts[number]);
        
        return {
          claim: item.claim || 'Unknown claim',
          Verdict: isValidVerdict ? verdict : 'Unclear',
          Reference: Array.isArray(item.Reference) 
            ? (item.Reference as string[]).filter((ref): ref is string => ref != null).map(String) 
            : item.Reference 
              ? [String(item.Reference)] 
              : [],
          Trust_Score: typeof item.Trust_Score === 'number' 
            ? Math.max(0, Math.min(100, item.Trust_Score))
            : scoreFor(verdict)
        };
      });
    };

    // Process claims in batches to avoid token limits
    const BATCH_SIZE = 5; // Adjust based on average claim complexity
    const batchResults = [];

    for (let i = 0; i < perClaimChunks.length; i += BATCH_SIZE) {
      const batch = perClaimChunks.slice(i, i + BATCH_SIZE);
      const batchPrompt = `${prompt}\n\nANALYZE THESE CLAIMS:\n${JSON.stringify(batch, null, 2)}`;

      try {
        console.log(`[${requestId}] Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(perClaimChunks.length / BATCH_SIZE)}`);
        
        const gen = await timeout(ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: batchPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  claim: { type: Type.STRING },
                  Verdict: { 
                    type: Type.STRING,
                    enum: ["Support", "Partially Support", "Unclear", "Contradict", "Refute"]
                  },
                  Reference: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    minItems: 1,
                    maxItems: 3
                  },
                  Trust_Score: { 
                    type: Type.NUMBER,
                    minimum: 0,
                    maximum: 100
                  },
                },
                required: ["claim", "Verdict", "Reference", "Trust_Score"],
                additionalProperties: false
              }
            }
          }
        }), 120000); // 2 minute timeout per batch

        if (gen?.text) {
          try {
            const parsedBatch = JSON.parse(gen.text);
            const normalized = normalizeResults(parsedBatch);
            console.log(`[${requestId}] Batch ${i / BATCH_SIZE + 1} completed with ${normalized.length} results`);
            batchResults.push(...normalized);
          } catch (parseError) {
            console.error(`[${requestId}] Error parsing batch response:`, parseError);
            throw new Error('Failed to parse model response');
          }
        } else {
          throw new Error('Empty or invalid response from model');
        }
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
        // Add error placeholders for failed claims
        batch.forEach(({ claim }) => {
          batchResults.push({
            claim: claim || 'Unknown claim',
            Verdict: "Unclear",
            Reference: ["Error processing claim"],
            Trust_Score: 0
          });
        });
      }
    }

    // Calculate average trust score
    const validScores = batchResults.filter(r => typeof r.Trust_Score === 'number' && !isNaN(r.Trust_Score));
    const averageTrustScore = validScores.length > 0 
      ? Math.round(validScores.reduce((sum, r) => sum + r.Trust_Score, 0) / validScores.length)
      : 0;

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed fact-check in ${duration}ms`);
    
    return NextResponse.json({ 
      results: batchResults,
      averageTrustScore,
      requestId,
      durationMs: duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[${requestId}] Error in /api/factCheck after ${duration}ms:`, errorMessage);
    
    if (error instanceof Error) {
      console.error(`[${requestId}] Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    return NextResponse.json({ 
      error: 'Failed to process fact-check request',
      details: errorMessage,
      requestId,
      durationMs: duration
    }, { 
      status: errorMessage.includes('time') ? 504 : 500 
    });
  }
}
