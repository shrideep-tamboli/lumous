'use client';

import { useState } from 'react';

import ClaimsList from '@/components/ClaimsList';
import InfoDialog from '@/components/InfoDialog';
import { ReclaimifyResponseViewer } from '@/components/ReclaimifyResponseViewer';
import { SearchResult, ClaimsResponse, ReclaimifyApiResponse, FactCheckResult } from '@/types';

interface RelevantChunk {
  text: string;
  similarity: number;
}

interface ProcessingMetrics {
  totalClaims: number;
  successfulSearches: number;
  failedSearches: number;
  successfulExtractions: number;
  failedExtractions: number;
  errors: Array<{
    claim: string;
    stage: 'search' | 'extraction';
    error: string;
  }>;
}

interface AnalysisState {
  totalClaims?: number;
  analyzedCount?: number;
  verdicts?: {
    support: number;
    partially: number;
    unclear: number;
    contradict: number;
    refute: number;
  };
  avgTrustScore?: number;
}

interface LoadingState {
  step1: boolean; // claims extraction
  step2: boolean; // web search
  step3: boolean; // batch analysis
  step4: boolean; // fact checking
  step5: boolean; // complete
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingClaims, setIsAnalyzingClaims] = useState(false);
  const [mode, setMode] = useState<'analyze' | 'claimify' | 'reclaimify'>('analyze');
  const [activeTab, setActiveTab] = useState<'analysis' | 'summary'>('analysis');
  // prefix unused state names with _ or rename to avoid linter warnings
  const [_result, setResult] = useState<{ url: string; content: string } | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [reclaimifyData, setReclaimifyData] = useState<ReclaimifyApiResponse | null>(null);
  
  // State for progressive loading
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    totalClaims: 0,
    analyzedCount: 0,
    verdicts: {
      support: 0,
      partially: 0,
      unclear: 0,
      contradict: 0,
      refute: 0
    },
    avgTrustScore: 0
  });
  const [loadingState, setLoadingState] = useState<LoadingState>({
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
  });
  
  // State for claims panel
  const [showClaimsPanel, setShowClaimsPanel] = useState(false);

  const handleAnalyze = async () => {
  if (!url.trim()) {
    setError('Please enter a URL');
    return;
  }
  
  setIsLoading(true);
  setError(null);
  setResult(null);
  setClaims(null);
  setReclaimifyData(null);
  setLoadingState({
    step1: true,  // Starting step 1
    step2: false,
    step3: false,
    step4: false,
    step5: false
  });
  setShowClaimsPanel(false);
  
  try {
    // 1. First call to reclaimify
    setLoadingState(prev => ({ ...prev, step1: true }));
    const reclaimifyResponse = await fetch(`/api/reclaimify?url=${encodeURIComponent(url.trim())}&categorize=true&disambiguate=true`);
    
    if (!reclaimifyResponse.ok) {
      const errorData = await reclaimifyResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to process URL');
    }
    
    const reclaimifyData: ReclaimifyApiResponse = await reclaimifyResponse.json();
    setReclaimifyData(reclaimifyData);
    setResult({ url: reclaimifyData.url || url.trim(), content: reclaimifyData.content || '' });

    // 2. Extract verifiable claims
    const categorized = Array.isArray(reclaimifyData.categorizedSentences) 
      ? reclaimifyData.categorizedSentences 
      : [];
    
    const verifiableList = categorized
      .filter((item) => item.category === 'Verifiable')
      .map((item) => item.sentence);

    const searchDate = new Date().toISOString().split('T')[0];
    const claimsData = {
      claims: verifiableList.map((claim: string) => ({ claim, search_date: searchDate })),
      search_date: searchDate,
    };

    setAnalysisState(prev => ({
      ...prev,
      totalClaims: claimsData.claims.length
    }));

    // 3. Call websearch
    setLoadingState(prev => ({ ...prev, step1: false, step2: true }));
    const webSearchResponse = await fetch('/api/websearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        claims: claimsData.claims,
        search_date: searchDate,
        originalUrl: url.trim()
      })
    });

    if (!webSearchResponse.ok) {
      throw new Error('Failed to perform web search');
    }
    
    const webSearchData = await webSearchResponse.json();
    const urlsPerClaim: string[][] = Array.isArray(webSearchData?.urls) ? webSearchData.urls : [];
    
    // Flatten URLs for batch extraction and create claim mapping
    const flattenedUrls: string[] = [];
    const claimsOnePerUrl: string[] = [];
    
    urlsPerClaim.forEach((urls, claimIndex) => {
      urls.forEach(url => {
        if (url) {
          flattenedUrls.push(url);
          claimsOnePerUrl.push(claimsData.claims[claimIndex]?.claim || '');
        }
      });
    });

    // 4. Call batch analysis with URLs and claims
    setLoadingState(prev => ({ ...prev, step2: false, step3: true }));
    
    if (flattenedUrls.length === 0) {
      throw new Error('No valid URLs found for analysis');
    }
    
    const batchResponse = await fetch('/api/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        urls: flattenedUrls,
        claims: claimsOnePerUrl
      })
    });

    if (!batchResponse.ok) {
      throw new Error('Failed to analyze content');
    }

    const batchData = await batchResponse.json();
    const batchResults: Array<{ claim?: string; url?: string; content?: string; title?: string; excerpt?: string; error?: string; relevantChunks?: RelevantChunk[] }> = Array.isArray(batchData?.results) ? batchData.results : [];

    // Group extracted contents per claim for fact checking
    const contentsByClaim: Record<string, string[]> = {};
    
    batchResults.forEach((result) => {
      const claimKey = (result?.claim || '').toString().trim();
      const content = (result?.content || '').toString().trim();
      
      if (claimKey && content) {
        if (!contentsByClaim[claimKey]) {
          contentsByClaim[claimKey] = [];
        }
        contentsByClaim[claimKey].push(content);
      }
    });

    // 5. Call fact check with claims and their associated content
    setLoadingState(prev => ({ ...prev, step3: false, step4: true }));
    
    const factCheckClaims = Object.entries(contentsByClaim).map(([claim, content]) => ({
      claim,
      content: content.length === 1 ? content[0] : content
    }));

    let factCheckResults: FactCheckResult[] = [];
    let averageTrustScore: number | undefined = undefined;
    
    if (factCheckClaims.length > 0) {
      const factCheckResponse = await fetch('/api/factCheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: factCheckClaims
        })
      });

      if (!factCheckResponse.ok) {
        throw new Error('Failed to perform fact checking');
      }
      
      const fcJson = await factCheckResponse.json();
      factCheckResults = Array.isArray(fcJson?.results) ? fcJson.results : [];
      averageTrustScore = typeof fcJson?.averageTrustScore === 'number' ? fcJson.averageTrustScore : undefined;
    }

    // Merge fact-check results with batch extraction results per claim
    const groupedByClaim: Record<string, SearchResult[]> = {};
    batchResults.forEach((r) => {
      const k = (r?.claim || '').toString().trim();
      if (!k) return;
      if (!groupedByClaim[k]) groupedByClaim[k] = [];
      groupedByClaim[k].push({
        url: String(r?.url || ''),
        content: String(r?.content || ''),
        title: r?.title || undefined,
        excerpt: r?.excerpt || undefined,
        error: r?.error || undefined,
        relevantChunks: Array.isArray(r?.relevantChunks) ? r.relevantChunks : []
      });
    });

    const mergedResults: SearchResult[] = claimsData.claims.map((c: { claim: string }, index: number) => {
      const claimText = c.claim;
      const group = groupedByClaim[claimText] || [];
      const representative: SearchResult = group.length > 0
        ? group[0]
        : { url: '', content: '' };
      const fc = factCheckResults.find((r) => (r?.claim || '').toString().trim() === claimText.trim());
      return {
        ...representative,
        verdict: fc?.verdict || fc?.Verdict,
        reference: fc?.reference || fc?.Reference,
        trustScore: typeof fc?.trustScore === 'number' ? fc.trustScore :
                    typeof fc?.Trust_Score === 'number' ? fc.Trust_Score :
                    typeof fc?.trust_score === 'number' ? fc.trust_score : undefined,
      } as SearchResult;
    });

    // Update analysis summary metrics
    const verdictCounts = { support: 0, partially: 0, unclear: 0, contradict: 0, refute: 0 };
    for (const fc of factCheckResults) {
      const v = (fc?.verdict || fc?.Verdict || '').toString();
      if (v === 'Support') verdictCounts.support++;
      else if (v === 'Partially Support') verdictCounts.partially++;
      else if (v === 'Unclear') verdictCounts.unclear++;
      else if (v === 'Contradict') verdictCounts.contradict++;
      else if (v === 'Refute') verdictCounts.refute++;
    }
    setAnalysisState((prev: AnalysisState) => ({
      ...prev,
      analyzedCount: mergedResults.length,
      verdicts: verdictCounts,
      avgTrustScore: typeof averageTrustScore === 'number' ? averageTrustScore : prev.avgTrustScore
    }));

    // Update final state with merged results so ClaimsList can render
    setClaims({
      ...claimsData,
      searchResults: mergedResults,
      analysis: batchData,
      factChecks: factCheckResults
    });
    
    setShowClaimsPanel(true);
    setLoadingState(prev => ({ ...prev, step4: false, step5: true }));

  } catch (error) {
    console.error('Error:', error);
    setError(error instanceof Error ? error.message : 'An unknown error occurred');
  } finally {
    setIsLoading(false);
  }
};

  const handleClaimify = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }
    
    // Redirect to claimify or reclaimify page based on mode
    const path = mode === 'reclaimify' ? 're-claimify' : 'claimify';
    window.location.href = `/${path}?url=${encodeURIComponent(url.trim())}`;
    return;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      mode === 'analyze' ? handleAnalyze() : handleClaimify();
    }
  };

  const searchClaims = async (claimsData: ClaimsResponse, originalUrl: string) => {
    try {
      // 1. Get search results
      setLoadingState((prev: LoadingState) => ({ ...prev, step2: false, step3: true }));
      
      const searchResponse = await fetch('/api/websearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: claimsData.claims,
          search_date: claimsData.search_date,
          originalUrl: originalUrl
        }),
      });
      
      if (!searchResponse.ok) {
        throw new Error('Failed to search claims');
      }
      
      const { urls } = await searchResponse.json(); // now urls: string[][]
      if (!urls || !urls.length) return [];

      // Build normalized per-claim url lists and keep per-claim counts to regroup
      const rawPerClaimUrls: string[][] = urls as string[][];
      const perClaimUrls: string[][] = rawPerClaimUrls.map(group =>
        (group || [])
          .flatMap(u => String(u).split(/[,;\n\r]+/).map(s => s.trim()))
          .filter(s => s.length > 0)
      );

      // Deduplicate each group's URLs while preserving order
      const perClaimUrlsNormalized = perClaimUrls.map(arr => Array.from(new Set(arr)));

      // Flatten and keep only http(s) URLs
      const flatUrls: string[] = perClaimUrlsNormalized.flat().filter(s => /^https?:\/\//i.test(s));
      if (flatUrls.length === 0) return [];

      // 2. Extract content from search results (batch)
      setLoadingState((prev: LoadingState) => ({ ...prev, step3: false, step4: true }));
      
      const analyzeResponse = await fetch('/api/analyze/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: flatUrls
        }),
      });

      if (!analyzeResponse.ok) {
        throw new Error('Failed to analyze search results');
      }

      // Explicitly type the response to avoid `never` inference and safely access .content
      interface AnalyzeBatchResult { url?: string | null; content?: string | null; relevantChunks?: RelevantChunk[]; title?: string; excerpt?: string; error?: string; [key: string]: unknown }
      const analyzeJson = await analyzeResponse.json() as unknown;
      const rawResults: AnalyzeBatchResult[] = [];
      if (analyzeJson && typeof analyzeJson === 'object' && 'results' in analyzeJson) {
        const maybeResults = (analyzeJson as Record<string, unknown>)['results'];
        if (Array.isArray(maybeResults)) {
          for (const item of maybeResults) {
            if (item && typeof item === 'object') rawResults.push(item as AnalyzeBatchResult);
          }
        }
      }

      // Normalize rawResults into SearchResult shape (guarantee url/content are strings)
      const normalizedResults: SearchResult[] = rawResults.map((r) => ({
        url: r.url || '',
        content: r.content || '',
        title: r.title || undefined,
        excerpt: r.excerpt || undefined,
        error: r.error || undefined,
        relevantChunks: Array.isArray(r.relevantChunks) ? r.relevantChunks as RelevantChunk[] : [],
      }));

      // results correspond to flatUrls order

      // Regroup results per claim (using normalizedResults)
      const groupedResults: SearchResult[][] = [];
      let offset = 0;
      for (let i = 0; i < perClaimUrls.length; i++) {
        const count = perClaimUrls[i]?.length || 0;
        const group = normalizedResults.slice(offset, offset + count);
        groupedResults.push(group);
        offset += count;
      }

      // Update analyzed count (Box 2) after batch analysis
      // count items that have at least a url or content
      const analyzedCount = normalizedResults.filter((r) => !!(r && (r.content || r.url))).length;
      setAnalysisState((prev: AnalysisState) => ({
        ...prev,
        analyzedCount: analyzedCount
      }));
      
      // 3. Prepare and log fact-checking request
      // For each claim, send the extracted contents from up to 3 urls as an array (one per source)
      const factCheckRequest = {
        claims: claimsData.claims.map((claim, index) => {
          const group = groupedResults[index] || [];
          const contentsArray = group
            .slice(0, 3)
            .map((g: SearchResult) => g.content || '');
          return {
            claim: claim.claim,
            content: contentsArray
          };
        })
      };
      
      console.log('Sending to /api/factCheck:', JSON.stringify({
        claimsCount: factCheckRequest.claims.length,
        sampleClaim: factCheckRequest.claims[0]
      }, null, 2));
      
      // 4. Perform fact-checking and get results with average trust score
      const factCheckResponse = await fetch('/api/factCheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(factCheckRequest),
      });

      if (!factCheckResponse.ok) {
        throw new Error('Failed to fact-check results');
      }

      const { results: factCheckResults, averageTrustScore } = await factCheckResponse.json();
      
      // Merge fact-check results into groupedResults (assign verdict/reference/trustScore per claim)
      const merged: SearchResult[] = groupedResults.map((group, index) => {
        const fc = (Array.isArray(factCheckResults) && (factCheckResults[index] ||
                  factCheckResults.find((r: { claim?: string }) => r?.claim === claimsData.claims?.[index]?.claim))) || undefined;
        // Keep first group's result as representative and attach fc data
        const representative: SearchResult = group.length > 0
          ? group[0]
          : { url: perClaimUrls[index]?.[0] || '', content: '' };
        
        // Debug log to see what we're getting
        console.log(`Fact-check result for claim ${index}:`, fc);
        
        return {
          ...representative,
          relevantChunks: group.flatMap((g: SearchResult & { relevantChunks?: RelevantChunk[] }) => g.relevantChunks || []),
          // Map the fact-check fields to the expected case
          verdict: fc?.verdict || fc?.Verdict, // Try both cases
          reference: fc?.reference || fc?.Reference,
          trustScore: typeof fc?.trustScore === 'number' ? fc.trustScore : 
                     typeof fc?.Trust_Score === 'number' ? fc.Trust_Score :
                     typeof fc?.trust_score === 'number' ? fc.trust_score : undefined,
        } as SearchResult;
      });
      
      // Add the average trust score to the first result
      if (merged.length > 0) {
        merged[0].aggregateTrustScore = averageTrustScore;
      }
      
      return merged;
    } catch (error) {
      console.error('Error in search, analyze, and fact-check:', error);
      return [];
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-200 p-4 relative">
      <InfoDialog />
      
      {/* Main Content Container with Responsive Layout */}
      <div className={`w-full transition-all duration-500 ease-in-out ${
        showClaimsPanel 
          ? 'max-w-7xl flex gap-6' 
          : 'max-w-2xl'
      } px-4 sm:px-6`}>
        
        {/* Left Panel - Analysis Summary (shifts left when claims panel opens) */}
        <div className={`transition-all duration-500 ease-in-out ${
          showClaimsPanel 
            ? 'w-1/2 flex-shrink-0' 
            : 'w-full'
        }`}>
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-black mb-2 tracking-tight">
            LUMOUS
          </h1>
          <p className="text-gray-800 max-w-md mx-auto text-lg mb-6">
            Illuminate the truth behind every headline
          </p>
          
          {/* Mode Toggle 
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center border-2 border-black rounded-lg overflow-hidden">
              <button
                onClick={() => setMode('analyze')}
                className={`px-6 py-2 font-medium ${
                  mode === 'analyze' 
                    ? 'bg-black text-white' 
                    : 'bg-white text-black hover:bg-gray-100'
                } transition-colors duration-200`}
              >
                Analyze
              </button>
              <div className="h-6 w-0.5 bg-black"></div>
              <button
                onClick={() => setMode('claimify')}
                className={`px-6 py-2 font-medium ${
                  mode === 'claimify' 
                    ? 'bg-black text-white' 
                    : 'bg-white text-black hover:bg-gray-100'
                } transition-colors duration-200`}
              >
                Claimify
              </button>
              <div className="h-6 w-0.5 bg-black"></div>
              <button
                onClick={() => setMode('reclaimify')}
                className={`px-6 py-2 font-medium ${
                  mode === 'reclaimify' 
                    ? 'bg-black text-white' 
                    : 'bg-white text-black hover:bg-gray-100'
                } transition-colors duration-200`}
              >
                Re-claimify
              </button>
            </div>
          </div>
          
          <p className="text-gray-600 text-sm">
            {mode === 'analyze' 
              ? 'Full analysis with fact-checking' 
              : mode === 'claimify' 
                ? 'Extract and view content' 
                : 'Re-analyze and extract content'}
          </p>*/}
        </div>
        
        <div className="bg-white p-8 rounded-none border-2 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Paste your link here..."
                className="w-full pl-10 pr-4 py-4 border-2 border-black rounded-none focus:outline-none focus:ring-0 focus:border-black transition-all duration-200 font-mono placeholder-gray-500 text-black bg-white"
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
            </div>
            <button 
              onClick={mode === 'analyze' ? handleAnalyze : handleClaimify}
              disabled={isLoading}
              className={`bg-black text-white font-medium py-4 px-8 rounded-none border-2 border-black hover:bg-white hover:text-black transition-all duration-200 flex-shrink-0 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading 
                ? (mode === 'analyze' 
                    ? 'ANALYZING...' 
                    : 'PROCESSING...') 
                : mode === 'analyze' 
                  ? 'ANALYZE' 
                  : mode === 'claimify' 
                    ? 'EXTRACT' 
                    : 'RE-EXTRACT'}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 border border-red-300">
              {error}
            </div>
          )}

          {(reclaimifyData || isAnalyzingClaims || loadingState.step5) && (
            <div className="mt-6 p-4 bg-white border border-black rounded">
              <div className="flex border-b border-gray-200 mb-4">
                <button
                  className={`py-2 px-4 font-medium text-sm ${
                    activeTab === 'analysis' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('analysis')}
                >
                  Claimy Analysis
                </button>
                <button
                  className={`py-2 px-4 font-medium text-sm ${
                    activeTab === 'summary' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('summary')}
                >
                  Analysis Summary
                </button>
              </div>
              
              <div className={activeTab === 'analysis' ? 'block' : 'hidden'}>
                {reclaimifyData && <ReclaimifyResponseViewer data={reclaimifyData} />}
              </div>
              
              <div className={activeTab === 'summary' ? 'block' : 'hidden'}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                {/* Box 1: Total Claims - Shows immediately after claims extraction */}
                <div className="p-2 bg-gray-100 border border-gray-300 rounded">
                  <div className="text-gray-800">Total Claims</div>
                  <div className="font-semibold text-black">
                    {loadingState.step1 ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                        Loading...
                      </div>
                    ) : (
                      analysisState.totalClaims || 0
                    )}
                  </div>
                </div>

                {/* Box 2: Analyzed - Updates after batch analysis */}
                <div className="p-2 bg-gray-100 border border-gray-300 rounded">
                  <div className="text-gray-800">Analyzed</div>
                  <div className="font-semibold text-black">
                    {loadingState.step1 || loadingState.step2 || loadingState.step3 || loadingState.step4 ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                        {analysisState.analyzedCount || 0} / {analysisState.totalClaims || 0}
                      </div>
                    ) : (
                      `${analysisState.analyzedCount || 0} / ${analysisState.totalClaims || 0}`
                    )}
                  </div>
                </div>

                {/* Box 3 & 4: Verdicts - Shows title immediately, loads data after fact-checking */}
                <div className="p-2 bg-gray-100 border border-gray-300 rounded col-span-2 md:col-span-2">
                  <div className="text-gray-800">Verdicts</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {loadingState.step1 || loadingState.step2 || loadingState.step3 || loadingState.step4 ? (
                      <div className="flex items-center w-full">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                        <span className="text-gray-600">Analyzing claims...</span>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                          Support: {analysisState.verdicts?.support || 0}
                        </span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          Partially: {analysisState.verdicts?.partially || 0}
                        </span>
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                          Unclear: {analysisState.verdicts?.unclear || 0}
                        </span>
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                          Contradict: {analysisState.verdicts?.contradict || 0}
                        </span>
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                          Refute: {analysisState.verdicts?.refute || 0}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Box 5: Avg. Trust Score - Shows title immediately, loads data after fact-checking */}
                <div className="p-2 bg-blue-50 border border-blue-300 rounded">
                  <div className="text-gray-800">Avg. Trust Score</div>
                  <div className="text-2xl font-extrabold text-blue-700">
                    {loadingState.step1 || loadingState.step2 || loadingState.step3 || loadingState.step4 ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-700"></div>
                      </div>
                    ) : (
                      analysisState.avgTrustScore ?? 0
                    )}
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/api/download/extension"
            className="bg-black text-white font-medium py-3 px-6 rounded-none border-2 border-black hover:bg-white hover:text-black transition-all duration-200 text-center"
          >
            DOWNLOAD EXTENSION
          </a>
          <button
            onClick={() => setShowInstall(true)}
            className="bg-white text-black font-medium py-3 px-6 rounded-none border-2 border-black hover:bg-black hover:text-white transition-all duration-200 text-center"
          >
            HOW TO INSTALL
          </button>
          
          {/* Toggle Claims Panel Button - Show when claims exist but panel is closed */}
          {claims && !showClaimsPanel && (
            <button
              onClick={() => setShowClaimsPanel(true)}
              className="bg-white text-black font-medium py-3 px-6 rounded-none border-2 border-black hover:bg-black hover:text-white transition-all duration-200 text-center"
            >
              VIEW CLAIMS
            </button>
          )}
        </div>

        {showInstall && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-extension-title"
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowInstall(false)} />
            <div className="relative z-10 w-full max-w-lg mx-4 bg-white p-8 rounded-none border-2 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
              <div className="flex items-start justify-between">
                <h2 id="install-extension-title" className="text-2xl font-black text-black tracking-tight">Install the Chrome extension</h2>
                <button
                  onClick={() => setShowInstall(false)}
                  className="ml-4 -mt-2 text-black border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-all duration-200"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <ol className="mt-4 list-decimal list-inside space-y-2 text-gray-900 text-sm text-left">
                <li>Click <span className="font-semibold">DOWNLOAD EXTENSION</span> on the main page to get <code className="font-mono">extension.zip</code>.</li>
                <li>Extract the ZIP to a folder on your computer.</li>
                <li>Open Chrome and go to <span className="font-mono">chrome://extensions</span>.</li>
                <li>Enable <span className="font-semibold">Developer mode</span> (top-right).</li>
                <li>Click <span className="font-semibold">Load unpacked</span> and select the extracted <code className="font-mono">extension/</code> folder.</li>
                <li>Pin the extension from the toolbar for quick access.</li>
              </ol>
              <div className="mt-6 flex justify-end gap-3">
                <a
                  href="/api/download/extension"
                  className="bg-black text-white font-medium py-2 px-4 rounded-none border-2 border-black hover:bg-white hover:text-black transition-all duration-200"
                >
                  Download ZIP
                </a>
                <button
                  onClick={() => setShowInstall(false)}
                  className="bg-white text-black font-medium py-2 px-4 rounded-none border-2 border-black hover:bg-black hover:text-white transition-all duration-200"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-gray-700 mt-4">
                To update later, remove the old version in <span className="font-mono">chrome://extensions</span> and load the new extracted folder again.
              </p>
            </div>
          </div>
        )}
        </div>
        
        {/* Right Panel - Claims List (slides in from right) */}
        {showClaimsPanel && claims && (
          <div className={`w-1/2 flex-shrink-0 transition-all duration-500 ease-in-out transform ${
            showClaimsPanel ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}>
            <div className="bg-white border-2 border-black rounded-none shadow-[8px_8px_0_0_rgba(0,0,0,1)] h-[600px] flex flex-col">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b-2 border-black">
                <h3 className="font-bold text-black text-lg">Extracted Claims</h3>
                <button
                  onClick={() => setShowClaimsPanel(false)}
                  className="text-black border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-all duration-200 font-bold"
                  aria-label="Close claims panel"
                >
                  ✕
                </button>
              </div>
              
              {/* Panel Content with Custom Scrollbar */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <ClaimsList 
                  claims={claims} 
                  searchResults={claims?.searchResults} 
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}