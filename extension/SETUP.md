# 🚀 Quick Setup Guide

## Installation (2 minutes)

1. **Load Extension**
   ```
   Chrome → chrome://extensions/
   Enable "Developer mode" (top right toggle)
   Click "Load unpacked"
   Select: /Users/s/Documents/extension
   ```

2. **Test It**
   - Visit any news article (e.g., BBC, Reuters, NDTV)
   - Wait 2 seconds → Floating badge appears automatically
   - Or click extension icon → "🔍 Analyze This Page"

## What You'll See

### Floating Badge
```
✅ 78% Trustworthy
5 claims • politics
```

### In Popup
- Trust score circle (green/yellow/red)
- List of verified claims
- Confidence percentages
- Category detection

### On Page
- Suspicious claims highlighted in red/yellow
- Click badge for detailed report

## How The Scoring Works

The extension analyzes articles using:

1. **Domain Check** (40 points)
   - Is site in trusted-sources.json?
   - E.g., reuters.com = +40 points

2. **Citation Quality** (30 points)
   - Has "according to...", "study shows..."
   - References official sources

3. **Language Analysis** (20 points)
   - Deducts for sensational words
   - "Shocking!", "Unbelievable!" = -20 points

4. **Factual Patterns** (10 points)
   - Contains numbers, percentages, years
   - Specific dates and data

**Final Score**: 0-100%
- 70-100% = ✅ Trustworthy (green)
- 40-70% = ⚠️ Mixed (yellow)
- 0-40% = ❌ Low Trust (red)

## Customizing Trusted Sources

Edit `trusted-sources.json`:

```json
{
  "politics": {
    "sources": [
      "reuters.com",
      "apnews.com",
      "bbc.com",
      "your-trusted-site.com"  ← Add here
    ],
    "weight": 0.9
  }
}
```

Then reload extension:
```
chrome://extensions/ → Click reload icon
```

## Testing on Different Sites

### High Trust (Expected 70-90%)
- https://www.reuters.com
- https://apnews.com
- https://www.bbc.com/news
- https://www.thehindu.com

### Mixed Trust (Expected 40-70%)
- Medium blog posts
- General news sites
- Opinion articles

### Low Trust (Expected 0-40%)
- Sensationalist headlines
- Sites with lots of claims but no sources
- Unknown domains

## Troubleshooting

### Badge Doesn't Appear
- Wait 2 seconds after page loads
- Or click extension icon → "Analyze This Page"
- Check console (F12) for errors

### Wrong Category Detected
- Extension uses keyword matching
- Can be customized in `background.js`
- Look for `categorizeContent()` function

### No Claims Extracted
- Page might be too short (<200 chars)
- Or no factual statements detected
- Try a different article

## Next Steps

### For Development

**Add LLM Integration:**
```javascript
// In background.js
async function extractClaims(text) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Extract factual claims from: ${text}`
      }]
    })
  });
  return await response.json();
}
```

**Add Web Search API:**
```javascript
// Verify claims via Google
const searchUrl = `https://www.googleapis.com/customsearch/v1?key=YOUR_KEY&q=${claim}`;
```

### For Production

1. **Get API Keys**
   - OpenAI API (for LLM)
   - Google Custom Search API (for verification)
   - Or Serper.dev (simpler alternative)

2. **Add Backend**
   - Create Flask/FastAPI server
   - Handle API calls server-side
   - Return verified results to extension

3. **Publish to Chrome Web Store**
   - Clean up code
   - Add icons (128x128, 48x48, 16x16)
   - Submit for review

## Current Limitations

- ⚠️ Claim extraction is basic (regex-based)
- ⚠️ No real-time web search verification
- ⚠️ Limited to English content
- ⚠️ Heuristic-based scoring

**Solution**: Add LLM + Web Search APIs for production use

## Files Overview

| File | Purpose | Can Customize? |
|------|---------|----------------|
| `trusted-sources.json` | Trusted domains list | ✅ Yes - Add your sources |
| `background.js` | Fact-checking logic | ⚠️ Advanced - Tweak scoring |
| `content.js` | Page highlighting | ⚠️ Advanced - Change colors |
| `popup.html/js` | UI interface | ⚠️ Advanced - Redesign UI |
| `manifest.json` | Extension config | ❌ No - Don't edit unless needed |

---

**You're all set!** 🎉

Visit a news site and watch the magic happen!
