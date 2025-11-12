import { NextResponse } from 'next/server';
import { extract } from '@extractus/article-extractor';

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

// Configure article extractor with custom options
const extractorOptions = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.google.com/'
  },
  // Add any additional extractor options here
  // For example: forceExtractor: 'default',
};

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

// Convert HTML to plain text (lightweight)
function stripHtml(html: string): string {
  if (!html) return '';
  return cleanText(String(html).replace(/<[^>]*>/g, ' '));
}

async function extractContent(url: string | UrlObject, claim?: string): Promise<ExtractContentResult> {
  // Handle case where url is not a string
  const urlString = typeof url === 'string' 
    ? url 
    : (url && typeof url === 'object' && 'url' in url) 
      ? String((url as UrlObject).url) 
      : String(url);

  if (typeof urlString !== 'string' || !urlString.startsWith('http')) {
    return {
      url: urlString,
      content: '',
      error: 'Invalid URL format',
      claim
    };
  }

  try {
    // Use article-extractor's built-in fetching
    const article = await extract(urlString, {
      // Add any necessary options here
      // The extractor will handle the fetching with sensible defaults
    });
    
    if (article?.content && article.content.trim().length > 50) {
      return {
        url: urlString,
        content: stripHtml(String(article.content)),
        title: article.title || undefined,
        excerpt: article.description || undefined,
        claim
      };
    }

    // If no content was extracted, return an error
    return {
      url: urlString,
      content: '',
      error: 'No extractable content found using article extractor',
      claim
    };
    
  } catch (error) {
    console.error(`Error extracting content from ${urlString}:`, error);
    return {
      url: urlString,
      content: '',
      error: error instanceof Error ? error.message : 'Failed to extract content',
      claim
    };
  }
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

    // When claims are provided and lengths match, preserve 1:1 URL-to-claim alignment
    type UrlItem = { url: string; claim?: string };
    let items: UrlItem[] = [];
    const hasAlignedClaims = Array.isArray(claims) && claims.length === urls.length;

    if (hasAlignedClaims) {
      items = urls.map((u, i) => ({
        url: String(u || '').trim(),
        claim: typeof claims![i] === 'string' ? String(claims![i]) : undefined,
      })).filter(it => /^https?:\/\//i.test(it.url));
    } else {
      // Fallback normalization for generic inputs (may contain comma/newline-separated URLs)
      const processedUrls = urls.flatMap(u => {
        if (!u) return [];
        return String(u)
          .split(/[,;\n\r]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
      });
      const uniqueProcessedUrls = Array.from(new Set(processedUrls))
        .filter((s): s is string => typeof s === 'string' && /^https?:\/\//i.test(s));
      items = uniqueProcessedUrls.map(u => ({ url: u }));
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No valid URLs after normalization' },
        { status: 400 }
      );
    }

    // Process all URLs in parallel with concurrency control
    const CONCURRENCY_LIMIT = 10; // Number of concurrent requests
    const REQUEST_TIMEOUT = 30000; // 30 seconds timeout per request
    
    // Process URLs in parallel with concurrency control
    const processUrl = async (item: { url: string; claim?: string }): Promise<ExtractContentResult> => {
      try {
        // Add a timeout to prevent hanging requests
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT)
        );
        
        // Race between the extraction and the timeout
        const result = await Promise.race([
          extractContent(item.url, item.claim),
          timeoutPromise
        ]);
        
        return result;
      } catch (error) {
        console.error(`Error processing ${item.url}:`, error);
        return {
          url: item.url,
          content: '',
          error: error instanceof Error ? error.message : 'Unknown error during processing',
          claim: item.claim || ''
        };
      }
    };
    
    // Process all URLs with controlled concurrency
    const CONCURRENCY = 10; // Number of concurrent requests
    const results: ExtractContentResult[] = [];
    
    // Process URLs in chunks with controlled concurrency
    const processInBatches = async (work: UrlItem[], batchSize: number) => {
      for (let i = 0; i < work.length; i += batchSize) {
        const batch = work.slice(i, i + batchSize);
        const batchPromises = batch.map(item => processUrl(item));
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process batch results
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              url: '',
              content: '',
              error: result.reason?.message || 'Unknown error',
              claim: ''
            });
          }
        });
        
        console.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(work.length / batchSize)}`);
      }
    };
    
    try {
      const MAX_CONTENT_CHARS = 4000;
      await processInBatches(items, CONCURRENCY);
      
      // Filter out any undefined results and ensure all required fields are present
      const validResults = results
        .filter(Boolean)
        .map(result => ({
          url: result.url || '',
          content: (result.content || '').slice(0, MAX_CONTENT_CHARS),
          title: result.title,
          excerpt: result.excerpt,
          error: result.error,
          claim: result.claim || ''
        }));
      
      // Calculate metrics
      const successfulExtractions = validResults.filter(r => r.content && !r.error).length;
      const failedExtractions = validResults.length - successfulExtractions;
      
      console.log(`Batch processing complete. Success: ${successfulExtractions}, Failed: ${failedExtractions}`);
      
      return NextResponse.json({ 
        results: validResults,
        metrics: {
          totalExtractions: validResults.length,
          successfulExtractions,
          failedExtractions,
          errors: validResults
            .filter(r => r.error)
            .map(r => ({
              url: r.url || 'Unknown URL',
              claim: r.claim || 'Unknown claim',
              stage: 'extraction' as const,
              error: r.error || 'Unknown error'
            }))
        }
      }, { status: 200 });
      
    } catch (error) {
      console.error('Error in batch processing:', error);
      return NextResponse.json(
        { 
          error: 'Failed to process batch',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error in batch processing:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process batch request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
