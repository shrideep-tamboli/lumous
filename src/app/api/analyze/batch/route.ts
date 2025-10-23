import { NextResponse } from 'next/server';
import { extract } from '@extractus/article-extractor';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ClaimObject {
  claim: string;
  url?: string;
  content?: string;
  title?: string;
  search_date?: string;
  // Add other known properties here if needed
}

type ClaimType = string | ClaimObject | undefined;

interface BatchAnalyzeRequest {
  urls: string[];
  claims?: ClaimType[];
}
interface ExtractContentResult {
  url: string;
  content: string;
  title?: string;
  excerpt?: string;
  error?: string;
  claim?: string;
  originalUrl?: string; // Changed from 'any' to 'string'
  [key: string]: string | undefined; // Added index signature
}

// Update the function signature to accept string or object with url property
interface UrlObject {
  url: string;
  [key: string]: unknown;
}

async function extractContent(url: string | UrlObject): Promise<ExtractContentResult> {
  // Handle case where url is not a string
  const urlString = typeof url === 'string' ? url :
                   (url && typeof url === 'object' && 'url' in url ? String((url as UrlObject).url) : String(url));

  if (typeof urlString !== 'string' || !urlString.startsWith('http')) {
    return {
      url: urlString,
      content: '',
      error: 'Invalid URL format'
    };
  }

  try {
    // 1. Try lightweight HTML fetch + cheerio first (strip scripts/styles and extract <p> tags)
    const res = await axios.get(urlString, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(res.data);
    // remove noisy elements
    $('script, style, noscript, iframe, svg, meta, link').remove();

    // Collect paragraph texts, prefer longer paragraphs
    let pTexts = $('p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(t => t.length > 20);

    // If not enough paragraph content, try article/main/body
    if (!pTexts || pTexts.length === 0) {
      const articleText = ($('article').text() || $('main').text() || $('body').text() || '').replace(/\s+/g, ' ').trim();
      if (articleText && articleText.length > 100) {
        // split into pseudo-paragraphs to keep chunks manageable
        pTexts = articleText.match(/(.{80,1000}?(?:\.|\n|$))/g)?.map(s => s.trim()) || [articleText];
      }
    }

    if (pTexts && pTexts.length > 0) {
      const joined = pTexts.slice(0, 20).join('\n\n');
      return {
        url: urlString,
        content: cleanText(joined),
        title: $('title').text() || undefined,
        excerpt: $('meta[property="og:description"]').attr('content') || undefined,
      };
    }

    // 2. Fallback: use article extractor if cheerio didn't yield useful paragraphs
    try {
      const article = await extract(urlString);
      if (article?.content && article.content.trim().length > 50) {
        return {
          url: urlString,
          content: cleanText(String(article.content)),
          title: article.title,
          excerpt: article.description,
        };
      }
    } catch (e) {
      // swallow and continue to final fallback
      console.warn(`Article extractor failed for ${urlString}:`, e instanceof Error ? e.message : e);
    }

    // 3. Last-resort: attempt simple fallback selectors and text cleaning
    const fallbackText = ($('article').text() || $('main').text() || $('body').text() || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (fallbackText.length > 20) {
      return {
        url: urlString,
        content: cleanText(fallbackText),
        title: $('title').text(),
        excerpt: $('meta[property="og:description"]').attr('content'),
      };
    }

    return {
      url: urlString,
      content: '',
      error: 'No extractable content found'
    };
  } catch (error) {
    console.error(`Error extracting content from ${urlString}:`, error);
    // try extractor as last-ditch effort on network/parsing errors
    try {
      const article = await extract(urlString);
      if (article?.content) {
        return {
          url: urlString,
          content: cleanText(String(article.content)),
          title: article.title,
          excerpt: article.description,
        };
      }
    } catch (e) {
      // noop
    }

    return {
      url: urlString,
      content: '',
      error: error instanceof Error ? error.message : 'Failed to extract content',
    };
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

export async function POST(request: Request) {
  try {
    const { urls, claims } = (await request.json()) as BatchAnalyzeRequest & { claims?: string[] };
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'No URLs provided' },
        { status: 400 }
      );
    }

    // Normalize incoming URL entries: some entries may contain multiple URLs joined by commas/newlines
    const processedUrls = urls.flatMap(u => {
      if (!u) return [] as string[];
      // split on commas, semicolons or newlines (some providers return CSV-like strings)
      return String(u)
        .split(/[,;\n\r]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    });

    // Deduplicate and keep only http/https urls
    const uniqueProcessedUrls = Array.from(new Set(processedUrls)).filter(s => /^https?:\/\//i.test(s));

    if (uniqueProcessedUrls.length === 0) {
      return NextResponse.json(
        { error: 'No valid URLs after normalization' },
        { status: 400 }
      );
    }

    // Process all URLs in parallel with a concurrency limit
    const BATCH_SIZE = 3; // Process 3 URLs at a time
    const results: ExtractContentResult[] = [];
    
    for (let i = 0; i < uniqueProcessedUrls.length; i += BATCH_SIZE) {
      const batch = uniqueProcessedUrls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((url, index) => {
        // attempt to associate a claim if caller provided `claims` with a 1:1 mapping
        const claimIndex = i + index;
        let claimText = `Claim ${claimIndex + 1}`;
        try {
          const claim: ClaimType = claims?.[claimIndex];
          if (typeof claim === 'string') claimText = claim;
          else if (claim && typeof claim === 'object' && 'claim' in claim) claimText = (claim as ClaimObject).claim;
        } catch (e) {
          // ignore and use default claimText
        }

        return extractContent(url).then(result => ({
          ...result,
          claim: claimText
        }));
      }));
      
      results.push(...batchResults);
    }

    // Calculate metrics
    const successfulExtractions = results.filter(r => r.content).length;
    const failedExtractions = results.length - successfulExtractions;
    
    return NextResponse.json({ 
      results,
      metrics: {
        totalExtractions: results.length,
        successfulExtractions,
        failedExtractions,
        errors: results
          .filter(r => r.error)
          .map(r => ({
            claim: r.claim || 'Unknown claim',
            stage: 'extraction' as const,
            error: r.error || 'Unknown error'
          }))
      }
    });
  } catch (error) {
    console.error('Error in batch processing:', error);
    return NextResponse.json(
      { error: 'Failed to process batch request' },
      { status: 500 }
    );
  }
}
