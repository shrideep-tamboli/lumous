import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { extract } from '@extractus/article-extractor';

// --- MAIN FUNCTION ---
async function extractArticleText(url: string): Promise<{
  content: string;
  title?: string;
  excerpt?: string;
  source: 'article-extractor' | 'fallback';
}> {
  // 1. Try robust extractor first
  try {
    const article = await extract(url);
    if (article?.content) {
      return {
        content: cleanText(article.content),
        title: article.title,
        excerpt: article.description,
        source: 'article-extractor'
      };
    }
  } catch (e) {
    console.warn("Article-extractor failed, falling back to cheerio...");
  }

  // 2. Fallback: basic HTML paragraph extraction
  try {
    const res = await axios.get(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(res.data);
    
    // Extract main content (tries to be smart about finding the main article content)
    let content = $('article').text() || $('main').text() || $('body').text();
    
    // If we don't have enough content, try getting all paragraphs
    if (content.length < 500) {
      content = $('p').map((_, el) => $(el).text()).get().join('\n');
    }

    return {
      content: cleanText(content),
      title: $('title').text(),
      excerpt: $('meta[property="og:description"]').attr('content') || 
               $('meta[name="description"]').attr('content') ||
               content.slice(0, 200) + '...',
      source: 'fallback'
    };
    
  } catch (err) {
    console.error("Content extraction failed:", err);
    throw new Error('Failed to extract content from the URL');
  }
}

// --- Helper: Clean extracted text ---
function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')     // Remove HTML tags
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .replace(/\s*[\r\n]+\s*/g, '\n') // Clean up newlines
    .trim()
    .slice(0, 10000);             // Limit content length
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log('Processing URL:', url);
    
    // 1. Fetch and extract article content
    const { content, title, excerpt, source } = await extractArticleText(url);
    
    if (!content) {
      return NextResponse.json(
        { error: 'Could not extract any content from the URL' },
        { status: 400 }
      );
    }

    // 2. Process the extracted content
    const wordCount = content.split(/\s+/).length;
    const charCount = content.length;
    
    // 3. Return the results
    return NextResponse.json({
      status: 'success',
      url,
      metadata: {
        title,
        excerpt,
        wordCount,
        charCount,
        source
      },
      content: content,
      processedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in analyze API:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process the URL',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}