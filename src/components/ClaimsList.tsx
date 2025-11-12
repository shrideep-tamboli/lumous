import { ClaimsListProps, SearchResult } from '@/types';

export default function ClaimsList({ claims, searchResults = [] }: ClaimsListProps) {
  if (!claims?.claims?.length) return null;

  // In ClaimsList.tsx, replace the return statement with:
return (
  <div className="mt-8 p-6 border-2 border-black bg-white">
    
    <div className="space-y-4">
      {claims.claims.map((claim, index) => {
        const result: SearchResult | undefined = searchResults?.[index];
        if (!result) return null;

        return (
          <div key={index} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-gray-900 font-medium">Claim: {claim.claim}</p>
                {(() => {
                  const ref = result.reference ?? result.Reference;
                  if (!ref) return null;
                  if (Array.isArray(ref)) {
                    return (
                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-medium">Reference:</span>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {ref.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                  return (
                    <p className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">Reference:</span> {String(ref)}
                    </p>
                  );
                })()}
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
                {(result.verdict || result.Verdict) && (
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                    (result.verdict || result.Verdict) === 'Support' ? 'bg-green-100 text-green-800' :
                    (result.verdict || result.Verdict) === 'Refute' || (result.verdict || result.Verdict) === 'Contradict' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {result.verdict || result.Verdict}
                  </span>
                )}
                {(() => {
                  const trust = typeof result.trustScore === 'number' ? result.trustScore :
                                 typeof result.Trust_Score === 'number' ? result.Trust_Score : undefined;
                  if (typeof trust === 'number') {
                    return (
                      <div className="mt-1 text-lg font-bold">
                        {trust}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
}
