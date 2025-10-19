# 🔍 Fact Checker - Real-Time News Verification

An intelligent browser extension that automatically analyzes news articles and verifies claims against trusted sources.

## Features

- ✅ **Automatic Analysis**: Detects and categorizes article content
- ✅ **Claim Extraction**: Identifies factual claims in articles
- ✅ **Trusted Source Verification**: Compares against category-specific trusted sources
- ✅ **Real-Time Scoring**: Displays trust score (0-100%)
- ✅ **Visual Highlighting**: Marks suspicious claims in red/yellow
- ✅ **Category Detection**: Politics, Health, Science, Tech, Economy, Climate
- ✅ **Privacy-Friendly**: All processing done locally

## Quick Start

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → Select this folder
4. Visit any news article → Extension analyzes automatically
5. Or click extension icon → "🔍 Analyze This Page"

## How It Works

1. **Content Extraction**: Extracts article text using Readability
2. **Category Detection**: Identifies topic (politics, health, science, etc.)
3. **Claim Extraction**: Finds factual statements
4. **Source Verification**: Compares domain against trusted sources list
5. **Scoring**: Calculates trust score based on multiple factors
6. **Display**: Shows floating badge + highlights suspicious text

## Trust Score Factors

- **Domain Reputation** (40%): Is source in trusted list?
- **Citation Quality** (30%): References to studies/official sources
- **Language Analysis** (20%): Sensational language detection
- **Factual Patterns** (10%): Numbers, dates, specifics

## Trusted Sources

Configured in `trusted-sources.json` by category:

- **Politics**: Reuters, AP News, BBC, The Hindu, NDTV, AltNews
- **Health**: WHO, CDC, NIH, Mayo Clinic
- **Science**: Nature, Science.org, NASA, ArXiv
- **Technology**: Ars Technica, TechCrunch, Wired
- **Economy**: Bloomberg, FT, WSJ, Economic Times
- **Climate**: IPCC, NASA Climate, NOAA

## Files

- `manifest.json` - Extension configuration
- `popup.html/js` - Analysis interface
- `content.js` - Page analysis & highlighting
- `background.js` - Fact-checking logic
- `trusted-sources.json` - Trusted source database
- `readability.js` - Content extraction
- `history.html/js` - Analysis history

## Customization

Edit `trusted-sources.json` to add/remove trusted sources:

```json
{
  "politics": {
    "sources": ["reuters.com", "apnews.com", ...],
    "weight": 0.9
  }
}
```

## Future Enhancements

- [ ] LLM integration (GPT-4/Claude) for better claim extraction
- [ ] Web search API (Google/Serper) for real-time verification
- [ ] Fact-checking API integration (PolitiFact, FactCheck.org)
- [ ] User feedback system
- [ ] Browser notifications for low-trust articles

## License

MIT - Free to use and modify
