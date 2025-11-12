import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { extract } from '@extractus/article-extractor';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Types for disambiguation results
interface DisambiguationResult {
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

// Types for rewritten partially verifiable sentences
interface RewrittenPartial {
  originalSentence: string;
  reasoning: string;
  rewrittenSentence: string;
}

// --- Helper: Clean extracted text ---
function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

// --- Helper: Extract article text ---
async function extractArticleText(url: string): Promise<{
  content: string;
  title?: string;
  excerpt?: string;
  source: 'article-extractor' | 'fallback';
}> {
  try {
    // First try with article-extractor
    const article = await extract(url);
    if (article?.content) {
      return {
        content: cleanText(article.content),
        title: article.title,
        excerpt: article.description,
        source: 'article-extractor',
      };
    }
  } catch (error) {
    console.error('Error with article-extractor:', error);
  }

  // Fallback to cheerio for basic extraction
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    
    // Try to get main content
    let content = '';
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      'body',
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        content = element.text();
        if (content.length > 100) break; // Found substantial content
      }
    }

    return {
      content: cleanText(content || response.data),
      title: $('title').first().text().trim(),
      excerpt: $('meta[property="og:description"]').attr('content') || 
               $('meta[name="description"]').attr('content') ||
               $('p').first().text().substring(0, 200) + '...',
      source: 'fallback',
    };
  } catch (error) {
    console.error('Error with fallback extraction:', error);
    throw new Error('Failed to extract content from the provided URL');
  }
}

// --- Helper: Split text into sentences ---
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting that handles common cases
  return text
    .split(/(?<=\S[\.!?]\s+)(?=[A-Z])/g) // Split at sentence boundaries (., !, ?)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 500) // Filter out very long or empty sentences
    .filter(s => !/^[\s\d\W]+$/.test(s)); // Filter out sentences with only numbers/symbols
}

// --- Helper: Disambiguate sentences ---
async function disambiguateSentences(sentences: string[]): Promise<DisambiguationResult[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are an assistant to a fact-checker. Your task is to analyze sentences for ambiguity and provide detailed reasoning.
    
For each sentence, provide:
1. isAmbiguous: Boolean indicating if the sentence is ambiguous
2. If ambiguous:
   - ambiguityType: 'referential' (pronouns, vague references) or 'structural' (grammar/syntax)
   - ambiguityReasoning: Detailed explanation of why it's ambiguous
   - canBeDisambiguated: Boolean indicating if additional context could resolve the ambiguity
   - disambiguationReasoning: Explanation of why it can/cannot be disambiguated
   - disambiguatedSentence: If possible, a clearer version of the sentence
3. If not ambiguous:
   - clarityReasoning: Explanation of why the sentence is clear

Return your response as a JSON array of objects with these fields:
- sentence: The original sentence
- isAmbiguous: boolean
- reasoning: string (general reasoning about the analysis)
- ambiguityType?: 'referential' | 'structural' (only if isAmbiguous is true)
- ambiguityReasoning?: string (only if isAmbiguous is true)
- canBeDisambiguated?: boolean (only if isAmbiguous is true)
- disambiguationReasoning?: string (only if isAmbiguous is true)
- disambiguatedSentence?: string (only if canBeDisambiguated is true)

Examples:
[{
  "sentence": "He said it was important",
  "isAmbiguous": true,
  "reasoning": "This sentence contains ambiguous references that make it unclear.",
  "ambiguityType": "referential",
  "ambiguityReasoning": "The pronouns 'He' and 'it' have unclear referents. It's not specified who 'he' is or what 'it' refers to.",
  "canBeDisambiguated": true,
  "disambiguationReasoning": "The sentence could be disambiguated by providing context about who 'he' is and what 'it' refers to.",
  "disambiguatedSentence": "John said the meeting was important."
},
{
  "sentence": "The chicken is ready to eat",
  "isAmbiguous": true,
  "reasoning": "This sentence has a structural ambiguity in its interpretation.",
  "ambiguityType": "structural",
  "ambiguityReasoning": "The phrase 'ready to eat' could modify either 'chicken' (implying the chicken is prepared to be eaten) or be interpreted as the chicken being ready to eat something else.",
  "canBeDisambiguated": true,
  "disambiguationReasoning": "The ambiguity can be resolved by restructuring the sentence to clarify the intended meaning.",
  "disambiguatedSentence": "The cooked chicken is ready to be eaten."
},
{
  "sentence": "The meeting will be at 3 PM in the conference room.",
  "isAmbiguous": false,
  "reasoning": "This sentence is clear and specific with no ambiguous elements.",
  "clarityReasoning": "The sentence specifies a clear time (3 PM) and location (conference room) for the meeting, with no ambiguous references or structural issues."
}]

Analyze these sentences:\n${JSON.stringify(sentences, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const response = await result.response;
    const text = response.text();
    
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('Error parsing disambiguation response:', error);
      return sentences.map(sentence => ({
        sentence,
        isAmbiguous: false,
        reasoning: 'Error processing disambiguation',
        clarityReasoning: 'An error occurred while analyzing this sentence.'
      }));
    }
  } catch (error) {
    console.error('Error in disambiguateSentences:', error);
    return sentences.map(sentence => ({
      sentence,
      isAmbiguous: false,
      reasoning: 'Error in disambiguation service',
      clarityReasoning: 'The disambiguation service encountered an error.'
    }));
  }
}

// --- Helper: Rewrite partially verifiable sentences to only keep verifiable part ---
async function rewritePartiallyVerifiable(
  items: Array<{ sentence: string; reasoning: string }>
): Promise<RewrittenPartial[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are assisting a fact-checker. You will receive a list of items, where each item contains:
- sentence: a partially verifiable sentence
- reasoning: why it was categorized as partially verifiable (i.e., which parts are verifiable vs subjective/vague)

Your task is to rewrite each sentence to keep ONLY the verifiable part(s), removing subjective, vague, or opinionated content. If nothing verifiable remains, return an empty string for rewrittenSentence.

Return JSON as an array of objects with fields:
- originalSentence: string (the input sentence)
- reasoning: string (copy of provided reasoning to keep context)
- rewrittenSentence: string (only the verifiable portion, possibly empty string if none)

Examples:
[
  {
    "originalSentence": "The company, known for its innovative products, was founded in 2010",
    "reasoning": "Founding year is verifiable; 'innovative products' is subjective.",
    "rewrittenSentence": "The company was founded in 2010."
  },
  {
    "originalSentence": "Experts say the policy is terrible, passed in 2021",
    "reasoning": "'Terrible' is opinion; 'passed in 2021' is verifiable.",
    "rewrittenSentence": "The policy was passed in 2021."
  }
]

Rewrite these items:\n${JSON.stringify(items, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const response = await result.response;
    const text = response.text();
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed as RewrittenPartial[];
      throw new Error('Invalid response format');
    } catch (e) {
      console.error('Error parsing rewrite response:', e);
      // Fallback: return inputs with empty rewritten to avoid breaking the flow
      return items.map(i => ({
        originalSentence: i.sentence,
        reasoning: i.reasoning,
        rewrittenSentence: ''
      }));
    }
  } catch (error) {
    console.error('Error in rewritePartiallyVerifiable:', error);
    return items.map(i => ({
      originalSentence: i.sentence,
      reasoning: i.reasoning,
      rewrittenSentence: ''
    }));
  }
}

// --- Helper: Categorize sentences by verifiability ---
async function categorizeSentences(sentences: string[]): Promise<Array<{
  sentence: string;
  category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable';
  reasoning: string;
}>> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are an AI assistant that categorizes sentences based on their verifiability. For each sentence, analyze it and provide:

1. Category (one of):
   - 'Verifiable': Makes a specific, factual claim that can be objectively verified
   - 'Partially Verifiable': Contains some verifiable elements but includes subjective or vague language
   - 'Not Verifiable': Purely opinion, speculation, or too vague to verify

2. Reasoning: A brief explanation of why the sentence was categorized that way

Return your response as a JSON array of objects with 'sentence', 'category', and 'reasoning' fields. For example:

[
  {
    "sentence": "The company was founded in 2010",
    "category": "Verifiable",
    "reasoning": "This is a specific factual claim that can be verified through company records."
  },
  {
    "sentence": "The company, known for its innovative products, was founded in 2010",
    "category": "Partially Verifiable",
    "reasoning": "While the founding year is verifiable, 'innovative products' is subjective."
  },
  {
    "sentence": "This is the best product on the market",
    "category": "Not Verifiable",
    "reasoning": "This is a subjective opinion that cannot be objectively verified."
  }
]

Now, analyze and categorize these sentences:\n${JSON.stringify(sentences, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const response = await result.response;
    const text = response.text();
    
    try {
      // Try to parse the response as JSON
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error('Invalid response format: expected array');
    } catch (error) {
      console.error('Error parsing AI response:', error);
      // If parsing fails, return a default categorization
      return sentences.map(sentence => ({
        sentence,
        category: 'Not Verifiable' as const,
        reasoning: 'Failed to categorize this sentence',
      }));
    }
  } catch (error) {
    console.error('Error categorizing sentences:', error);
    // Return default categorization in case of any error
    return sentences.map(sentence => ({
      sentence,
      category: 'Not Verifiable' as const,
      reasoning: 'Error occurred during categorization',
    }));
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const categorize = searchParams.get('categorize') === 'true';
  const disambiguate = searchParams.get('disambiguate') === 'true';

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    );
  }

  try {
    const { content, title, excerpt } = await extractArticleText(url);
    
    // Split content into sentences
    const sentences = splitIntoSentences(content);
    
    // Prepare response data
    const responseData: {
      url: string;
      title?: string;
      excerpt?: string;
      content: string;
      sentences: string[];
      timestamp: string;
      categorizedSentences?: Array<{ sentence: string; category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable'; reasoning: string }>;
      rewrittenPartials?: Array<{ originalSentence: string; reasoning: string; rewrittenSentence: string }>;
      disambiguatedSentences?: DisambiguationResult[];
    } = {
      url,
      title,
      excerpt,
      content,
      sentences,
      timestamp: new Date().toISOString(),
    };

    // Only categorize if explicitly requested
    if (categorize && process.env.GEMINI_API_KEY) {
      // Categorize all sentences at once
      const categorized = await categorizeSentences(sentences);
      responseData.categorizedSentences = categorized;

      // Prepare lists for downstream steps
      const verifiableOnly = categorized
        .filter(s => s.category === 'Verifiable')
        .map(s => s.sentence);
      const partials = categorized
        .filter(s => s.category === 'Partially Verifiable')
        .map(s => ({ sentence: s.sentence, reasoning: s.reasoning }));

      // If disambiguation is requested, first rewrite partials to only keep verifiable content
      if (disambiguate) {
        let rewrittenPartials: RewrittenPartial[] = [];
        if (partials.length > 0) {
          rewrittenPartials = await rewritePartiallyVerifiable(partials);
          responseData.rewrittenPartials = rewrittenPartials;
        }

        const rewrittenVerifiable = rewrittenPartials
          .map(p => p.rewrittenSentence)
          .filter(s => !!s && s.trim().length > 0);

        const disambiguationInput = [...verifiableOnly, ...rewrittenVerifiable];

        if (disambiguationInput.length > 0) {
          const disambiguated = await disambiguateSentences(disambiguationInput);
          responseData.disambiguatedSentences = disambiguated;
        }
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error processing URL:', error);
    return NextResponse.json(
      { error: 'Failed to process the URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { url, categorize = false, disambiguate = false } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required in the request body' },
        { status: 400 }
      );
    }

    const { content, title, excerpt } = await extractArticleText(url);
    const sentences = splitIntoSentences(content);
    
    // Prepare response data
    const responseData: {
      url: string;
      title?: string;
      excerpt?: string;
      content: string;
      sentences: string[];
      timestamp: string;
      categorizedSentences?: Array<{ sentence: string; category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable'; reasoning: string }>;
      rewrittenPartials?: Array<{ originalSentence: string; reasoning: string; rewrittenSentence: string }>;
      disambiguatedSentences?: DisambiguationResult[];
    } = {
      url,
      title,
      excerpt,
      content,
      sentences,
      timestamp: new Date().toISOString(),
    };

    // Only categorize if explicitly requested
    if (categorize && process.env.GEMINI_API_KEY) {
      // Categorize all sentences at once
      const categorized = await categorizeSentences(sentences);
      responseData.categorizedSentences = categorized;

      // Prepare lists for downstream steps
      const verifiableOnly = categorized
        .filter(s => s.category === 'Verifiable')
        .map(s => s.sentence);
      const partials = categorized
        .filter(s => s.category === 'Partially Verifiable')
        .map(s => ({ sentence: s.sentence, reasoning: s.reasoning }));

      // If disambiguation is requested, first rewrite partials to only keep verifiable content
      if (disambiguate) {
        let rewrittenPartials: RewrittenPartial[] = [];
        if (partials.length > 0) {
          rewrittenPartials = await rewritePartiallyVerifiable(partials);
          responseData.rewrittenPartials = rewrittenPartials;
        }

        const rewrittenVerifiable = rewrittenPartials
          .map(p => p.rewrittenSentence)
          .filter(s => !!s && s.trim().length > 0);

        const disambiguationInput = [...verifiableOnly, ...rewrittenVerifiable];

        if (disambiguationInput.length > 0) {
          const disambiguated = await disambiguateSentences(disambiguationInput);
          responseData.disambiguatedSentences = disambiguated;
        }
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in POST /api/reclaimify:', error);
    return NextResponse.json(
      { error: 'Failed to process the request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
