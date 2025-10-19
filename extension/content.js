// Content script - Automatic fact-checking and trust scoring
console.log("🔍 Trust Score Analyzer: Content script loaded");

let trustBadge = null;
let highlightedElements = [];

// Auto-analyze when page loads
window.addEventListener('load', () => {
  setTimeout(autoAnalyzePage, 2000); // Wait 2s for dynamic content
});

// Listen for manual analysis trigger
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze") {
    analyzeCurrentPage();
    sendResponse({ success: true });
  }
  
  if (request.action === "showResults") {
    displayResults(request.data);
    sendResponse({ success: true });
  }
  
  if (request.action === "highlightClaims") {
    highlightSuspiciousClaims(request.claims);
    sendResponse({ success: true });
  }
  
  return true;
});

// Auto-analyze the page
function autoAnalyzePage() {
  const articleText = extractArticleText();
  
  if (articleText.length < 200) {
    console.log("Page too short to analyze");
    return;
  }
  
  console.log(`📝 Extracted ${articleText.length} characters`);
  
  // Send to background for analysis
  chrome.runtime.sendMessage({
    action: "analyzeArticle",
    data: {
      text: articleText,
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname
    }
  });
}

// Extract clean article text
function extractArticleText() {
  // Try to use Readability if available
  if (typeof Readability !== 'undefined') {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();
    if (article) return article.textContent;
  }
  
  // Fallback: extract from common article selectors
  const selectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    'main'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      return element.innerText;
    }
  }
  
  // Last resort: body text
  return document.body.innerText;
}

// Analyze current page manually
function analyzeCurrentPage() {
  removeBadge(); // Remove old badge
  clearHighlights(); // Clear old highlights
  autoAnalyzePage();
}

// Display trust score results
function displayResults(data) {
  const { overall_score, claims, category, verified_sources } = data;
  
  // Show floating badge
  showTrustBadge(overall_score, claims?.length || 0, category);
  
  // Highlight suspicious claims
  if (claims && claims.length > 0) {
    highlightSuspiciousClaims(claims);
  }
}

// Show floating trust badge
function showTrustBadge(score, claimsCount, category) {
  removeBadge(); // Remove existing badge
  
  const scorePercent = Math.round(score * 100);
  const color = scorePercent > 70 ? '#28a745' : scorePercent > 40 ? '#ffc107' : '#dc3545';
  const emoji = scorePercent > 70 ? '✅' : scorePercent > 40 ? '⚠️' : '❌';
  
  trustBadge = document.createElement('div');
  trustBadge.id = 'trust-score-badge';
  trustBadge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color};
    color: white;
    padding: 12px 18px;
    border-radius: 25px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    cursor: pointer;
    transition: transform 0.2s;
  `;
  
  trustBadge.innerHTML = `
    ${emoji} ${scorePercent}% Trustworthy
    <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">
      ${claimsCount} claims • ${category || 'general'}
    </div>
  `;
  
  trustBadge.addEventListener('mouseenter', () => {
    trustBadge.style.transform = 'scale(1.05)';
  });
  
  trustBadge.addEventListener('mouseleave', () => {
    trustBadge.style.transform = 'scale(1)';
  });
  
  trustBadge.addEventListener('click', () => {
    // Open detailed report
    chrome.runtime.sendMessage({ action: "openReport" });
  });
  
  document.body.appendChild(trustBadge);
}

// Highlight suspicious claims in the text
function highlightSuspiciousClaims(claims) {
  clearHighlights();
  
  claims.forEach(claim => {
    if (claim.score < 0.6) { // Only highlight low-trust claims
      highlightTextInPage(claim.text, claim.score);
    }
  });
}

// Highlight specific text in the page
function highlightTextInPage(searchText, score) {
  const color = score < 0.3 ? 'rgba(220, 53, 69, 0.3)' : 'rgba(255, 193, 7, 0.3)';
  
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const nodesToHighlight = [];
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent.includes(searchText.substring(0, 50))) {
      nodesToHighlight.push(node);
    }
  }
  
  nodesToHighlight.forEach(node => {
    const span = document.createElement('span');
    span.className = 'trust-score-highlight';
    span.style.backgroundColor = color;
    span.style.cursor = 'help';
    span.title = `Trust Score: ${Math.round(score * 100)}% - Click for details`;
    
    const text = node.textContent;
    const parent = node.parentNode;
    
    span.textContent = text;
    parent.replaceChild(span, node);
    
    highlightedElements.push(span);
  });
}

// Clear all highlights
function clearHighlights() {
  highlightedElements.forEach(el => {
    if (el.parentNode) {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    }
  });
  highlightedElements = [];
}

// Remove badge
function removeBadge() {
  if (trustBadge && trustBadge.parentNode) {
    trustBadge.parentNode.removeChild(trustBadge);
    trustBadge = null;
  }
}
