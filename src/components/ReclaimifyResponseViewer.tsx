'use client';

import { useState } from 'react';
import { Info, AlertCircle, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { ReclaimifyApiResponse, DisambiguationResult, RewrittenPartial, CategorizedSentence } from '@/types';

interface ReclaimifyResponseViewerProps {
  data: ReclaimifyApiResponse;
  className?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Verifiable':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'Partially Verifiable':
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case 'Not Verifiable':
      return <XCircle className="w-4 h-4 text-gray-400" />;
    default:
      return <HelpCircle className="w-4 h-4 text-gray-400" />;
  }
};

export function ReclaimifyResponseViewer({ data, className = '' }: ReclaimifyResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'raw'>('summary');
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  if (!data) return null;

  const toggleExpand = (index: number) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  type EnrichedSentence = CategorizedSentence & {
    disambiguation?: DisambiguationResult | null;
    rewrittenVerifiablePart?: string;
    rewriteReasoning?: string;
  };

  const categorizedSentences: EnrichedSentence[] = Array.isArray(data.categorizedSentences) 
    ? data.categorizedSentences.map((sentence, index: number) => {
        // Find matching disambiguated sentence
        const disambiguated = Array.isArray(data.disambiguatedSentences) 
          ? data.disambiguatedSentences[index] 
          : null;
          
        // Find matching rewritten partial
        const rewritten = Array.isArray(data.rewrittenPartials) 
          ? data.rewrittenPartials.find((r: RewrittenPartial) => r.originalSentence === sentence.sentence)
          : null;
          
        return {
          ...sentence,
          disambiguation: disambiguated ? {
            ...disambiguated,
            // Use the disambiguated sentence if available, otherwise use the original
            disambiguatedSentence: disambiguated?.sentence || sentence.sentence
          } : null,
          rewrittenVerifiablePart: rewritten?.rewrittenSentence,
          rewriteReasoning: rewritten?.reasoning
        };
      })
    : [];

  return (
    <div className={`bg-gray-50 border border-gray-300 rounded p-4 ${className}`}>
      <h3 className="font-bold text-black mb-3">Claimify Analysis</h3>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          className={`py-2 px-4 font-medium text-sm flex items-center gap-1 ${
            activeTab === 'summary' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('summary')}
        >
          <span>Summary</span>
        </button>
        <button
          className={`py-2 px-4 font-medium text-sm flex items-center gap-1 ${
            activeTab === 'details' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('details')}
        >
          <span>Detailed Analysis</span>
        </button>
        <button
          className={`py-2 px-4 font-medium text-sm flex items-center gap-1 ${
            activeTab === 'raw' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('raw')}
        >
          <span>Raw Data</span>
        </button>
      </div>

      {/* Summary View */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-white border border-gray-200 rounded">
              <div className="text-gray-700 font-medium mb-1">Title</div>
              <div className="font-semibold text-black truncate">{data.title || 'No title'}</div>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded">
              <div className="text-gray-700 font-medium mb-1">Total Sentences</div>
              <div className="font-semibold text-black">
                {Array.isArray(data.sentences) ? data.sentences.length : 0}
              </div>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded">
              <div className="text-gray-700 font-medium mb-1">Verifiable Candidates</div>
              <div className="font-semibold text-black">
                {categorizedSentences.filter((s) => s.category === 'Verifiable' || s.category === 'Partially Verifiable').length}
              </div>
            </div>
          </div>

          {/* Categories Breakdown */}
          {categorizedSentences.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-800 mb-2">Categories Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {['Verifiable', 'Partially Verifiable', 'Not Verifiable'].map((category) => {
                  const count = categorizedSentences.filter((s) => s.category === category).length;
                  const total = categorizedSentences.length;
                  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                  
                  return (
                    <div key={category} className="p-3 bg-white border border-gray-200 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(category)}
                          <span className="text-sm font-medium text-gray-700">{category}</span>
                        </div>
                        <span className="text-sm font-semibold">{count}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div 
                          className={`h-2 rounded-full ${
                            category === 'Verifiable' ? 'bg-green-500' : 
                            category === 'Partially Verifiable' ? 'bg-yellow-500' : 'bg-gray-400'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{percentage}% of total</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Analysis View */}
      {activeTab === 'details' && (
        <div className="space-y-4">
          {categorizedSentences.length > 0 ? (
            <div className="space-y-3">
              {categorizedSentences.map((sentence, index: number) => (
                <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div 
                    className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleExpand(index)}
                  >
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(sentence.category)}
                      <span className="font-medium text-black">
                        {sentence.sentence.length > 100 
                          ? `${sentence.sentence.substring(0, 100)}...` 
                          : sentence.sentence}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {expandedItems[index] ? 'Show less' : 'Show more'}
                    </div>
                  </div>
                  
                  {expandedItems[index] && (
                    <div className="p-3 bg-white space-y-3">
                      {/* Original Sentence */}
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">Original Sentence</div>
                        <div className="text-sm text-gray-800 bg-gray-50 p-2 rounded">
                          {sentence.sentence}
                        </div>
                      </div>


                      {/* Disambiguation and Verifiable Parts */}
                      <div className="space-y-3">
                        {/* Ambiguity Information */}
                        {sentence.disambiguation && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">
                              Ambiguity Analysis
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700">Type:</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  sentence.disambiguation.isAmbiguous 
                                    ? 'bg-yellow-100 text-yellow-800' 
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {sentence.disambiguation.isAmbiguous ? 'Ambiguous' : 'Not Ambiguous'}
                                </span>
                                {sentence.disambiguation.ambiguityType && (
                                  <span className="text-xs text-gray-600">
                                    ({sentence.disambiguation.ambiguityType})
                                  </span>
                                )}
                              </div>
                              
                              {sentence.disambiguation.reasoning && (
                                <div className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-100">
                                  <div className="font-medium text-yellow-700">Reasoning:</div>
                                  <div className="whitespace-pre-wrap">{sentence.disambiguation.reasoning}</div>
                                </div>
                              )}
                              
                              {sentence.disambiguation.disambiguatedSentence && (
                                <div className="mt-2">
                                  <div className="text-xs text-gray-500 mb-1">Disambiguated Version:</div>
                                  <div className="text-sm text-gray-800 bg-blue-50 border border-blue-100 p-2 rounded mb-2">
                                    {sentence.disambiguation.disambiguatedSentence}
                                  </div>
                                  {sentence.rewrittenVerifiablePart && (
                                    <>
                                      <div className="text-xs text-gray-500 mb-1">Verifiable Part:</div>
                                      <div className="text-sm text-gray-800 bg-green-50 border border-green-100 p-2 rounded">
                                        {sentence.rewrittenVerifiablePart}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Rewritten Verifiable Part for Partially Verifiable Sentences */}
                        {sentence.category === 'Partially Verifiable' && (
                          <div>
                            <div className="space-y-2">
                              {sentence.rewrittenVerifiablePart ? (
                                <>
                                  {sentence.rewriteReasoning && (
                                    <div className="text-xs text-gray-600 italic">
                                      <span className="font-medium">Reason:</span> {sentence.rewriteReasoning}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-sm text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                                  <div className="font-medium">No Verifiable Part Could Be Extracted</div>
                                  {sentence.rewriteReasoning && (
                                    <div className="mt-1 text-xs">
                                      <span className="font-medium">Reason:</span> {sentence.rewriteReasoning}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              No analysis data available. Please run the analysis first.
            </div>
          )}
        </div>
      )}

      {/* Raw Data View */}
      {activeTab === 'raw' && (
        <div className="bg-white border border-gray-200 rounded p-3">
          <pre className="text-xs text-black overflow-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
