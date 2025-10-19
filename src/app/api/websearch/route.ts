import { NextResponse } from 'next/server';
import { tavily } from '@tavily/core';

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

interface Claim {
  claim: string;
  search_date: string;
}

interface WebSearchRequest {
  claims: Claim[];
  search_date: string;
  originalUrl?: string;
}

export async function POST(request: Request) {
  try {
    const { claims, originalUrl } = await request.json() as WebSearchRequest;
    
    if (!claims?.length) {
      return NextResponse.json(
        { error: 'No claims provided' },
        { status: 400 }
      );
    }

    // Process all claims in parallel
    const searchPromises = claims.map(async (claim) => {
      const searchQuery = `${claim.claim} ${claim.search_date || ''}`.trim();
      
      try {
        // First try Tavily
        const tavilyResponse = await tvly.search(searchQuery, {
          include_answer: false,
          include_raw_content: false,
          include_domains: [],
          exclude_domains: originalUrl ? [new URL(originalUrl).hostname] : [],
          max_results: 1
        });

        if (tavilyResponse?.results?.length > 0) {
          return tavilyResponse.results[0].url;
        }

        // Fallback to DuckDuckGo if Tavily fails
        const ddgResponse = await fetch(
          `https://serpapi.com/search?engine=duckduckgo&q=${encodeURIComponent(searchQuery)}&kl=us-en&api_key=${process.env.SERPAPI_KEY || '899ee3b0eb25789808adc1f0be51125c66bc3b572c1c3d0826b9197df1ad895d'}`,
          { next: { revalidate: 3600 } }
        );
        
        const ddgData = await ddgResponse.json();
        if (ddgData?.organic_results?.length > 0) {
          return ddgData.organic_results[0].link;
        }

        return null;
      } catch (error) {
        console.error('Search error for claim:', claim.claim, error);
        return null;
      }
    });

    const results = await Promise.all(searchPromises);
    
    // Calculate metrics
    const metrics = {
      totalSearches: results.length,
      successfulSearches: results.filter(url => url).length,
      failedSearches: results.filter(url => !url).length,
      errors: results
        .map((result, index) => ({
          claim: claims[index]?.claim || `Claim ${index + 1}`,
          stage: 'search' as const,
          error: result ? '' : 'No search results found'
        }))
        .filter(item => item.error)
    };
    
    return NextResponse.json({ 
      urls: results,
      metrics
    });

  } catch (error) {
    console.error('Web search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform web search' },
      { status: 500 }
    );
  }
}