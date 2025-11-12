/*
 * implement the same functionality as claimify until text 
 * extract and sentences splitting but for re-claimify 
 * and make it output in a new page similar to claimify page
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Info } from 'lucide-react';

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

interface CategorizedSentence {
  sentence: string;
  category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable';
  reasoning: string;
  disambiguation?: DisambiguationResult;
  rewrittenVerifiablePart?: string;
}

const categoryColors = {
  'Verifiable': 'bg-green-100 text-green-800 border-green-200',
  'Partially Verifiable': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Not Verifiable': 'bg-gray-100 text-gray-800 border-gray-200'
};

function ReclaimifyContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') || '';
  
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentences, setSentences] = useState<CategorizedSentence[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // Removed show states since we'll show everything by default

  const fetchContent = async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/reclaimify?url=${encodeURIComponent(url)}&categorize=true&disambiguate=true`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch content');
      }
      
      const data = await response.json();
      
      if (!data.sentences || !Array.isArray(data.sentences)) {
        throw new Error('Invalid response format: expected sentences array');
      }
      
      setTitle(data.title || '');
      setExcerpt(data.excerpt || '');
      
      // Use categorized sentences if available, otherwise use plain sentences
      if (data.categorizedSentences && Array.isArray(data.categorizedSentences)) {
        const categorized = [...data.categorizedSentences] as CategorizedSentence[];

        // Build disambiguation map (by sentence text)
        const disambiguatedMap: Map<string, DisambiguationResult> = new Map(
          (data.disambiguatedSentences || []).map((d: DisambiguationResult) => [d.sentence, d])
        );

        // Build rewritten partials map: original -> rewritten
        const rewrittenMap: Map<string, string> = new Map(
          (data.rewrittenPartials || []).map((p: { originalSentence: string; rewrittenSentence: string }) => [p.originalSentence, p.rewrittenSentence])
        );

        // Merge: attach rewritten part and appropriate disambiguation
        for (let i = 0; i < categorized.length; i++) {
          const item = categorized[i];
          if (item.category === 'Verifiable') {
            const dis = disambiguatedMap.get(item.sentence);
            if (dis) categorized[i] = { ...item, disambiguation: dis };
          } else if (item.category === 'Partially Verifiable') {
            const rewritten = rewrittenMap.get(item.sentence) || '';
            const dis = rewritten ? disambiguatedMap.get(rewritten) : undefined;
            categorized[i] = {
              ...item,
              rewrittenVerifiablePart: rewritten || undefined,
              disambiguation: dis || item.disambiguation,
            };
          }
        }

        setSentences(categorized);
      } else {
        // Fallback to uncategorized sentences
        setSentences(data.sentences.map((s: string) => ({
          sentence: s,
          category: 'Not Verifiable',
          reasoning: 'Categorization not available'
        })));
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!url) {
      setError('No URL provided');
      setIsLoading(false);
      return;
    }
    
    fetchContent(url);
  }, [url]);

  const handleReanalyze = async () => {
    if (!url) return;
    
    try {
      setIsProcessing(true);
      
      const response = await fetch('/api/reclaimify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          categorize: true,
          disambiguate: true 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to re-analyze content');
      }

      const data = await response.json();
      
      if (!data.sentences || !Array.isArray(data.sentences)) {
        throw new Error('Invalid response format: expected sentences array');
      }
      
      setTitle(data.title || '');
      setExcerpt(data.excerpt || '');
      
      if (data.categorizedSentences && Array.isArray(data.categorizedSentences)) {
        const categorized = [...data.categorizedSentences] as CategorizedSentence[];

        const disambiguatedMap: Map<string, DisambiguationResult> = new Map(
          (data.disambiguatedSentences || []).map((d: DisambiguationResult) => [d.sentence, d])
        );
        const rewrittenMap: Map<string, string> = new Map(
          (data.rewrittenPartials || []).map((p: { originalSentence: string; rewrittenSentence: string }) => [p.originalSentence, p.rewrittenSentence])
        );

        for (let i = 0; i < categorized.length; i++) {
          const item = categorized[i];
          if (item.category === 'Verifiable') {
            const dis = disambiguatedMap.get(item.sentence);
            if (dis) categorized[i] = { ...item, disambiguation: dis };
          } else if (item.category === 'Partially Verifiable') {
            const rewritten = rewrittenMap.get(item.sentence) || '';
            const dis = rewritten ? disambiguatedMap.get(rewritten) : undefined;
            categorized[i] = {
              ...item,
              rewrittenVerifiablePart: rewritten || undefined,
              disambiguation: dis || item.disambiguation,
            };
          }
        }

        setSentences(categorized);
      } else {
        setSentences(data.sentences.map((s: string) => ({
          sentence: s,
          category: 'Not Verifiable',
          reasoning: 'Categorization not available'
        })));
      }
    } catch (err) {
      console.error('Error re-analyzing content:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-black" />
          <p className="text-gray-700">Extracting content from {url ? new URL(url).hostname : 'URL'}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Error</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <div className="space-x-4">
            <Link 
              href="/" 
              className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors"
            >
              Go Back
            </Link>
            <button
              onClick={() => fetchContent(url)}
              disabled={isProcessing}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center">
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Retrying...
                </span>
              ) : 'Try Again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              {title && (
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
              )}
            </div>
          </div>
          
          <div className="space-y-4">            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              {sentences.length > 0 ? (
                <ul className="space-y-4">
                  {sentences.map((item, index) => (
                    <li key={index} className="border-l-4 pl-4 py-3 pr-4 rounded-r transition-all bg-white shadow-sm mb-4">
                      <div className="flex flex-col gap-3">
                        {/* Sentence and category */}
                        <div className="flex flex-col gap-2">
                          <div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${categoryColors[item.category]}`}>
                              {item.category}
                            </span>
                          </div>
                          <p className="text-gray-800 leading-relaxed">
                            {item.sentence}
                          </p>
                        </div>

                        {/* Categorization reasoning */}
                        <div className="ml-6 p-3 text-sm bg-gray-50 border border-gray-100 rounded">
                          <h4 className="font-medium text-gray-700 mb-1">Categorization Analysis</h4>
                          <p className="text-gray-600">{item.reasoning}</p>
                        </div>

                        {/* Disambiguation details - always shown if available */}
                        {item.disambiguation && (
                          <div className="ml-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-3">Disambiguation Analysis</h4>
                            
                            {/* Main ambiguity status */}
                            <div className="mb-3 p-3 bg-white rounded border">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-black">Status:</span>
                                <span className={`font-medium ${item.disambiguation.isAmbiguous ? 'text-amber-600' : 'text-green-600'}`}>
                                  {item.disambiguation.isAmbiguous ? 'Ambiguous' : 'Clear'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mt-1">
                                {item.disambiguation.isAmbiguous 
                                  ? item.disambiguation.ambiguityReasoning || item.disambiguation.reasoning
                                  : item.disambiguation.clarityReasoning || 'This sentence is clear and unambiguous.'}
                              </p>
                            </div>

                            {/* Detailed analysis */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              {item.disambiguation.isAmbiguous && (
                                <>
                                  <div className="bg-white p-3 rounded border">
                                    <div className="text-xs font-medium text-gray-500 mb-1">Type of Ambiguity</div>
                                    <div className="font-medium text-amber-600 capitalize">
                                      {item.disambiguation.ambiguityType || 'Unknown'}
                                    </div>
                                    {item.disambiguation.ambiguityReasoning && (
                                      <p className="text-xs text-gray-600 mt-1">{item.disambiguation.ambiguityReasoning}</p>
                                    )}
                                  </div>

                                  <div className="bg-white p-3 rounded border">
                                    <div className="text-xs font-medium text-gray-500 mb-1">Disambiguation</div>
                                    <div className={`font-medium ${item.disambiguation.canBeDisambiguated ? 'text-green-600' : 'text-red-600'}`}>
                                      {item.disambiguation.canBeDisambiguated ? 'Possible' : 'Not Possible'}
                                    </div>
                                    {item.disambiguation.disambiguationReasoning && (
                                      <p className="text-xs text-gray-600 mt-1">
                                        {item.disambiguation.disambiguationReasoning}
                                      </p>
                                    )}
                                  </div>
                                </>
                              )}

                              {item.disambiguation.disambiguatedSentence && (
                                <div className="sm:col-span-2 bg-white p-3 rounded border border-green-100">
                                  <div className="text-xs font-medium text-green-700 mb-1">
                                    Disambiguated Version
                                  </div>
                                  <div className="text-gray-800">{item.disambiguation.disambiguatedSentence}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No content was extracted from this page.</p>
                  <button
                    onClick={handleReanalyze}
                    disabled={isProcessing}
                    className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    {isProcessing ? 'Extracting...' : 'Try extracting again'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReclaimifyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <ReclaimifyContent />
    </Suspense>
  );
}