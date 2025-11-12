import { Info } from 'lucide-react';

interface VerifiableSentencesProps {
  sentences: Array<{
    sentence: string;
    category: 'Verifiable' | 'Partially Verifiable' | 'Not Verifiable';
    reasoning: string;
    disambiguation?: {
      isAmbiguous: boolean;
      disambiguatedSentence?: string;
    };
    rewrittenVerifiablePart?: string;
  }>;
}

export function VerifiableSentences({ sentences }: VerifiableSentencesProps) {
  // Extract verifiable sentences and parts
  const verifiableContent = sentences.flatMap(sentence => {
    if (sentence.category === 'Verifiable') {
      // For verifiable sentences, use disambiguated version if available
      return [sentence.disambiguation?.disambiguatedSentence || sentence.sentence];
    } else if (sentence.category === 'Partially Verifiable' && sentence.rewrittenVerifiablePart) {
      // For partially verifiable, use the rewritten verifiable part
      return [sentence.rewrittenVerifiablePart];
    }
    return [];
  }).filter(Boolean);

  if (verifiableContent.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border rounded-lg overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-100 p-4 flex items-center gap-2">
        <Info className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-medium text-blue-800">Verifiable Content</h2>
      </div>
      <div className="bg-white p-4">
        <ul className="space-y-4">
          {verifiableContent.map((content, index) => (
            <li key={index} className="border-l-4 border-blue-400 pl-4 py-2">
              <p className="text-gray-800">{content}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
