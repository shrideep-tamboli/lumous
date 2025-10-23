import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  vertexai: false,
});

interface EmbeddingValue { values: number[]; }
interface EmbeddingResponse { embeddings: EmbeddingValue[]; }

const RATE_LIMIT_DELAY = 100;
let lastRequestTime = 0;
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
    await rateLimit();
    const resp = await ai.models.embedContent({ model: "text-embedding-004", contents: text }) as EmbeddingResponse;
    const vals = resp.embeddings?.[0]?.values;
    if (!Array.isArray(vals)) throw new Error("Invalid embedding response");
    return vals;
  } catch {
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

interface FactCheckRequest {
  claims: Array<{
    claim: string;
    content: string | string[];
  }>;
}

export async function POST(request: Request) {
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

    // perClaimChunks will hold up to 3 best chunks per claim, selecting at most one chunk per source/url
    const perClaimChunks: Array<{ claim: string; chunks: string[] }> = [];

    for (const { claim, content } of claimContents) {
      if (!content) {
        perClaimChunks.push({ claim, chunks: [] });
        continue;
      }

      // content may be a single string (joined html) or an array of strings (one per source url)
      const sources: string[] = Array.isArray(content) ? content : String(content).split('\n---SOURCE---\n');

      const bestChunksPerSource: string[] = [];

      // compute claim embedding once
      const claimEmbedding = await generateEmbedding(claim);

      for (const src of sources) {
        const chunks = String(src)
          .split(/<p[^>]*>|\n/)
          .map(c => c.replace(/<\/p>|<[^>]*>/g, '').trim())
          .filter(c => c.length > 20);

        if (chunks.length === 0) continue;

        // compute embeddings for the chunks in parallel (rate-limited inside function)
        const chunkEmbeddings = await Promise.all(chunks.map(chunk => generateEmbedding(chunk)));

        // find the best chunk for this source by cosine similarity
        let best = { text: '', sim: -1 };
        for (let i = 0; i < chunks.length; i++) {
          const sim = cosineSimilarity(claimEmbedding, chunkEmbeddings[i] || []);
          if (sim > best.sim) best = { text: chunks[i], sim };
        }

        if (best.sim > 0 && best.text) {
          bestChunksPerSource.push(best.text);
        }

        // stop if we've already got 3 sources
        if (bestChunksPerSource.length >= 3) break;
      }

      perClaimChunks.push({ claim, chunks: bestChunksPerSource.slice(0, 3) });
    }

    const prompt = `You are an expert fact-checking assistant. For each item, compare the claim with the provided chunk texts. Decide a verdict and cite up to three exact, word-for-word quotes from the chunks that justify it.

Strictly output a JSON array where each element has exactly these keys:
- claim: string
- Verdict: one of ["Support","Partially Support","Unclear","Contradict","Refute"]
- Reference: array of up to 3 strings (each must be an exact quote from one of the chunks)
- Trust_Score: number (100 for Support, 65 for Partially Support, 50 for Unclear, 0 for Contradict or Refute)

Do not add extra keys or text.`;

    const gen = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `${prompt}\n\nINPUT:\n${JSON.stringify(perClaimChunks, null, 2)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              claim: { type: Type.STRING },
              Verdict: { type: Type.STRING },
              Reference: { type: Type.ARRAY, items: { type: Type.STRING } }, // now array
              Trust_Score: { type: Type.NUMBER },
            },
            required: ["claim","Verdict","Reference","Trust_Score"]
          }
        }
      }
    });

    const text = gen.text;
    if (!text) return NextResponse.json({ error: 'No response from model' }, { status: 502 });

    let parsed: Array<{ claim: string; Verdict: string; Reference: string[]; Trust_Score: number }> = [];
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from model' }, { status: 502 });
    }

    const normalize = (v: string) => v.trim().toLowerCase();
    const scoreFor = (v: string) => {
      const n = normalize(v);
      if (n === 'support' || n === 'supports') return 100;
      if (n === 'partially support' || n === 'partially_supports' || n === 'partially-supports') return 65;
      if (n === 'unclear' || n === 'neutral') return 50;
      if (n === 'contradict' || n === 'refute' || n === 'contradicts' || n === 'refutes') return 0;
      return 50;
    };

    const results = parsed.map(item => ({
      claim: item.claim,
      Verdict: ['Support','Partially Support','Unclear','Contradict','Refute'].includes(item.Verdict) ? item.Verdict : 'Unclear',
      Reference: Array.isArray(item.Reference) ? item.Reference : (item.Reference ? [String(item.Reference)] : []),
      Trust_Score: typeof item.Trust_Score === 'number' ? item.Trust_Score : scoreFor(item.Verdict),
    }));

    // Calculate average trust score
    const validScores = results.filter(r => typeof r.Trust_Score === 'number' && !isNaN(r.Trust_Score));
    const averageTrustScore = validScores.length > 0 
      ? Math.round(validScores.reduce((sum, r) => sum + r.Trust_Score, 0) / validScores.length)
      : 0;

    return NextResponse.json({ 
      results,
      averageTrustScore
    });
  } catch (error) {
    console.error('Error in /api/factCheck:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return NextResponse.json({ 
      error: 'Failed to process fact-check request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
