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

interface SearchResult {
  url: string | null;
  source: string;
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
      let searchSource = 'none';
      
      try {
        // First try Tavily
        let tavilyResponse;
        try {
          tavilyResponse = await tvly.search(searchQuery, {
            include_answer: false,
            include_raw_content: false,
            include_domains: [],
            exclude_domains: originalUrl ? [new URL(originalUrl).hostname] : [],
            max_results: 1
          });

          if (tavilyResponse?.results?.length > 0) {
            searchSource = 'tavily';
            return { url: tavilyResponse.results[0].url, source: searchSource };
          }
        } catch (tavilyError: unknown) {
          const errorMessage = tavilyError instanceof Error ? tavilyError.message : 'Unknown error';
          console.warn('Tavily search failed, falling back to DuckDuckGo:', errorMessage);
          // Continue to DuckDuckGo fallback
        }

        // Fallback to DuckDuckGo if Tavily fails or returns no results
        try {
          const ddgResponse = await fetch(
            `https://serpapi.com/search?engine=duckduckgo&q=${encodeURIComponent(searchQuery)}&kl=us-en&api_key=${process.env.SERPAPI_KEY || '899ee3b0eb25789808adc1f0be51125c66bc3b572c1c3d0826b9197df1ad895d'}`,
            { 
              next: { revalidate: 3600 },
              // Add timeout to prevent hanging
              signal: AbortSignal.timeout(10000) // 10 second timeout
            }
          );
          
          if (!ddgResponse.ok) {
            throw new Error(`DuckDuckGo API error: ${ddgResponse.status} ${ddgResponse.statusText}`);
          }
          
          const ddgData = await ddgResponse.json();
          if (ddgData?.organic_results?.length > 0) {
            searchSource = 'duckduckgo';
            return { url: ddgData.organic_results[0].link, source: searchSource };
          }
        } catch (ddgError) {
          console.error('DuckDuckGo search failed:', ddgError);
          // Continue to return null if both providers fail
        }

        return { url: null, source: searchSource };
      } catch (error) {
        console.error('Search error for claim:', claim.claim, error);
        return null;
      }
    });

    const results = await Promise.all(searchPromises);
    
    // Extract URLs and sources from results
    const urls = results.map(r => r?.url || null);
    const sources = results.map(r => r?.source || 'none');
    
    // Count successful searches and track sources
    const successfulSearches = urls.filter(url => url !== null).length;
    const failedSearches = claims.length - successfulSearches;
    
    // Generate error details for failed searches
    const errors = claims.map((claim, index) => ({
      claim: claim.claim,
      stage: 'search',
      source: sources[index],
      error: urls[index] === null ? `No search results found (tried: ${sources[index] || 'none'})` : ''
    })).filter(error => error.error);
    
    // Log search metrics
    const searchMetrics = {
      totalSearches: claims.length,
      successfulSearches,
      failedSearches,
      sources: sources.reduce((acc, source) => {
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
    
    console.log('Search metrics:', searchMetrics);
    
    return NextResponse.json({
      urls,
      metrics: {
        ...searchMetrics,
        errors
      }
    });

  } catch (error) {
    console.error('Web search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform web search' },
      { status: 500 }
    );
  }
}