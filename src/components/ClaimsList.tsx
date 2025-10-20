import { SearchResult, ClaimsResponse, ClaimsListProps, RelevantChunk } from '@/types';

// Re-export types for backward compatibility
export type { SearchResult, ClaimsResponse, ClaimsListProps, RelevantChunk };

export default function ClaimsList({ claims, searchResults = [] }: ClaimsListProps) {
  if (!claims?.claims?.length) return null;

  const getPreviewText = (content: string, maxLength = 150) => {
    if (!content) return '';
    return content.length > maxLength 
      ? `${content.substring(0, maxLength)}...` 
      : content;
  };

  // In ClaimsList.tsx, replace the return statement with:
return (
  <div className="mt-8 p-6 border-2 border-black bg-white">
    
    <div className="space-y-4">
      {claims.claims.map((claim, index) => {
        const result = searchResults?.[index];
        if (!result) return null;

        return (
          <div key={index} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-gray-900 font-medium">Claim: {claim.claim}</p>
                {result.reference && (
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium">Reference:</span> {result.reference}
                  </p>
                )}
                {result.url && (
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                  >
                    {new URL(result.url).hostname}
                  </a>
                )}
              </div>
              
              <div className="ml-4 text-right">
                {result.verdict && (
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                    result.verdict === 'Support' ? 'bg-green-100 text-green-800' :
                    result.verdict === 'Refute' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {result.verdict}
                  </span>
                )}
                {typeof result.trustScore === 'number' && (
                  <div className="mt-1 text-lg font-bold">
                    {result.trustScore}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
}
