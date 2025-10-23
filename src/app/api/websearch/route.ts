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

// DDG organic result shape (we only need the link)
interface DDGOrganicResult { link?: string }

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
      let urls: string[] = [];
      
      try {
        // First try Tavily (request up to 5, we'll pick top 3)
        try {
          const tavilyResponse = await tvly.search(searchQuery, {
            include_answer: false,
            include_raw_content: false,
            include_domains: [],
            exclude_domains: originalUrl ? [new URL(originalUrl).hostname] : [],
            max_results: 3 // <-- changed to 3
          });

          if (tavilyResponse.results?.length) {
            urls = tavilyResponse.results
              .map(r => r.url)
              .filter(u => !!u) as string[];
            if (urls.length > 0) searchSource = 'tavily';
          }
        } catch (tavilyError) {
          console.error('Tavily search failed:', tavilyError);
        }

        // If we still need more urls (less than 3), try SerpAPI/DuckDuckGo to fill
        if (urls.length < 3) {
          try {
            const ddgResponse = await fetch(
              `https://serpapi.com/search?engine=duckduckgo&q=${encodeURIComponent(searchQuery)}&kl=us-en&api_key=${process.env.SERPAPI_KEY || '899ee3b0eb25789808adc1f0be51125c66bc3b572c1c3d0826b9197df1ad895d'}`,
              { 
                next: { revalidate: 3600 },
                signal: AbortSignal.timeout(10000)
              }
            );
            
            if (ddgResponse.ok) {
              const ddgData = await ddgResponse.json();
              const ddgUrls = (ddgData?.organic_results || [])
                .map((r: DDGOrganicResult) => r.link)
                .filter((u?: string): u is string => !!u);
              // append until 3 unique urls
              for (const u of ddgUrls) {
                if (urls.length >= 3) break;
                if (!urls.includes(u) && (!originalUrl || new URL(u).hostname !== new URL(originalUrl).hostname)) {
                  urls.push(u);
                }
              }
              if (urls.length > 0 && searchSource === 'none') searchSource = 'duckduckgo';
            }
          } catch (ddgError) {
            console.error('DuckDuckGo search failed:', ddgError);
          }
        }

        return { urls, source: searchSource };
      } catch (error) {
        console.error('Search error for claim:', claim.claim, error);
        return { urls: [], source: 'none' };
      }
    });

    const results = await Promise.all(searchPromises);
    
    // results is array of { urls: string[], source }
    const urlsPerClaim = results.map(r => r.urls || []);
    const sources = results.map(r => r.source || 'none');
    
    const successfulSearches = urlsPerClaim.filter(arr => (arr?.length || 0) > 0).length;
    const failedSearches = claims.length - successfulSearches;
    
    const errors = claims.map((claim, index) => ({
      claim: claim.claim,
      stage: 'search',
      source: sources[index],
      error: (urlsPerClaim[index]?.length || 0) === 0 ? `No search results found (tried: ${sources[index] || 'none'})` : ''
    })).filter(e => e.error);

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
      urls: urlsPerClaim, // array per claim (up to 3 each)
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