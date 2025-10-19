import { NextResponse } from 'next/server';
import { extract } from '@extractus/article-extractor';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ClaimObject {
  claim: string;
  [key: string]: any;
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
  originalUrl?: any; // Store the original URL for debugging
}

async function extractContent(url: any): Promise<ExtractContentResult> {
  // Handle case where url is not a string
  const urlString = typeof url === 'string' ? url : 
                   (url && typeof url === 'object' && 'url' in url ? url.url : String(url));
  
  if (typeof urlString !== 'string' || !urlString.startsWith('http')) {
    return {
      url: urlString,
      content: '',
      error: 'Invalid URL format',
      originalUrl: url
    };
  }
  try {
    // 1. Try article extractor first
    const article = await extract(urlString);
    if (article?.content) {
      return {
        url,
        content: cleanText(article.content),
        title: article.title,
        excerpt: article.description,
      };
    }

    // 2. Fallback to cheerio
    const res = await axios.get(urlString, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(res.data);
    let content = $('article').text() || $('main').text() || $('body').text();
    
    if (content.length < 500) {
      content = $('p').map((_, el) => $(el).text()).get().join('\n');
    }

    return {
      url,
      content: cleanText(content),
      title: $('title').text(),
      excerpt: $('meta[property="og:description"]').attr('content'),
    };
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error);
    return {
      url: urlString,
      content: '',
      error: error instanceof Error ? error.message : 'Failed to extract content',
      originalUrl: url
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

    // Process all URLs in parallel with a concurrency limit
    const BATCH_SIZE = 3; // Process 3 URLs at a time
    const results: ExtractContentResult[] = [];
    
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((url, index) => {
        const claimIndex = i + index;
        const claim: ClaimType = claims?.[claimIndex];
        let claimText = `Claim ${claimIndex + 1}`;
        
        if (typeof claim === 'string') {
          claimText = claim;
        } else if (claim && typeof claim === 'object' && 'claim' in claim) {
          claimText = (claim as ClaimObject).claim;
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
