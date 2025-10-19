import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from 'next/server';

// Initialize the Google Generative AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export async function POST(request: Request) {
  try {
    const { content } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const prompt = `You are a fact-checking assistant analyzing an article. Your task is to extract only substantive, verifiable factual claims.

    INSTRUCTIONS:
    1. Extract ONLY complete, standalone factual claims that make a specific assertion that could be verified.
    2. EXCLUDE:
       - Trivial or obvious statements
       - Author/publisher information
       - Incomplete thoughts or sentence fragments
       - Lists of items without context
    3. Each claim MUST be:
       - A complete, self-contained statement
       - Objectively verifiable
       - Include necessary context to be understood independently

    Text to analyze: ${content}

    Return ONLY a valid JSON array of claim strings, with no additional text or formatting.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            claims: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              }
            },
            search_date: {
              type: Type.STRING,
              description: "The current date in ISO 8601 format (YYYY-MM-DD)"
            }
          },
          required: ['claims', 'search_date']
        }
      }
    });

    // Safely handle the response text
    const responseText = response.text;
    if (!responseText) {
      throw new Error('No response text received from the model');
    }

    // Parse the response
    const result = JSON.parse(responseText);
    
    // Validate the response structure
    if (!result || !Array.isArray(result.claims) || !result.search_date) {
      throw new Error('Invalid response format from the model');
    }

    // Add current date if not provided
    const searchDate = result.search_date || new Date().toISOString().split('T')[0];
    
    // Format the claims
    const formattedResponse = {
      claims: result.claims.map((claim: string) => ({
        claim,
        search_date: searchDate
      })),
      search_date: searchDate
    };

    return NextResponse.json(formattedResponse);

  } catch (error) {
    console.error('Error in claims extraction:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process claims',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}