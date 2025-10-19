'use client';

import { useState } from 'react';

export default function InfoDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 p-2 rounded-full bg-white border-2 border-black hover:bg-gray-100 transition-colors shadow-sm"
        aria-label="How it works"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-black"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white p-6 rounded-lg border-2 border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] w-full max-w-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-black text-black">How LUMOS Works</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-black hover:text-gray-700 focus:outline-none"
                aria-label="Close"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-gray-800">
              <div className="space-y-2">
                <h3 className="font-bold text-lg">1. Submit a URL</h3>
                <p className="text-sm">
                  Paste any article or webpage URL to analyze its content for potential misinformation.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-lg">2. Claim Extraction</h3>
                <p className="text-sm">
                  Our AI extracts key claims and statements from the content for analysis.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-lg">3. Fact-Checking</h3>
                <p className="text-sm">
                  Each claim is cross-referenced with trusted sources to verify its accuracy.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-lg">4. Results & Analysis</h3>
                <p className="text-sm">
                  Receive a detailed report with trust scores, source verification, and potential biases.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="bg-black text-white font-medium py-2 px-4 rounded-none border-2 border-black hover:bg-white hover:text-black transition-all duration-200"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
