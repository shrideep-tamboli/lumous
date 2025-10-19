// Popup script for fact-checking interface

document.getElementById("analyze").addEventListener("click", analyzePage);

// Check if page is already analyzed on load
window.addEventListener('DOMContentLoaded', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const result = await chrome.storage.local.get([`analysis_${tab.url}`]);
  if (result[`analysis_${tab.url}`]) {
    displayResults(result[`analysis_${tab.url}`]);
  }
});

async function analyzePage() {
  const analyzeBtn = document.getElementById("analyze");
  const status = document.getElementById("status");
  const results = document.getElementById("results");
  
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";
  status.className = "status loading";
  status.style.display = "block";
  status.textContent = "Extracting content from page...";
  results.classList.add("hidden");
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if tab is valid
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      throw new Error("Cannot analyze browser internal pages");
    }
    
    // Inject content script if not already loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['readability.js']
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      console.log("Content script already loaded or injection failed:", e);
    }
    
    // Small delay to ensure scripts are loaded
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "analyze" });
    } catch (msgError) {
      // If message fails, analyze directly in popup
      console.log("Using direct analysis method");
      await analyzeDirectly(tab);
      return;
    }
    
    status.textContent = "Analyzing claims...";
    
    // Wait for background script to process
    setTimeout(async () => {
      const result = await chrome.storage.local.get([`analysis_${tab.url}`]);
      if (result[`analysis_${tab.url}`]) {
        displayResults(result[`analysis_${tab.url}`]);
        status.style.display = "none";
      } else {
        throw new Error("Analysis timeout - please try again");
      }
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 Analyze This Page";
    }, 5000);
    
  } catch (error) {
    console.error("Error:", error);
    status.className = "status error";
    status.textContent = `✗ ${error.message}`;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "🔍 Analyze This Page";
  }
}

// Fallback: analyze directly from popup without content script
async function analyzeDirectly(tab) {
  const status = document.getElementById("status");
  const analyzeBtn = document.getElementById("analyze");
  
  try {
    status.textContent = "Extracting text...";
    
    // Inject extraction script directly
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractPageText
    });
    
    if (!results || !results[0] || !results[0].result) {
      throw new Error("Could not extract page content");
    }
    
    const pageText = results[0].result;
    
    status.textContent = "Analyzing content...";
    
    // Send to background for analysis
    const data = {
      text: pageText,
      url: tab.url,
      title: tab.title,
      domain: new URL(tab.url).hostname,
      tab: { id: tab.id }
    };
    
    chrome.runtime.sendMessage({
      action: "analyzeArticle",
      data: data
    });
    
    // Wait for results
    setTimeout(async () => {
      const result = await chrome.storage.local.get([`analysis_${tab.url}`]);
      if (result[`analysis_${tab.url}`]) {
        displayResults(result[`analysis_${tab.url}`]);
        status.style.display = "none";
      } else {
        throw new Error("Analysis failed");
      }
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 Analyze This Page";
    }, 3000);
    
  } catch (error) {
    status.className = "status error";
    status.textContent = `✗ ${error.message}`;
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "🔍 Analyze This Page";
  }
}

// Function to extract page text (injected into page)
function extractPageText() {
  // Try multiple selectors for article content
  const selectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    'main',
    '#content'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 200) {
      return element.innerText;
    }
  }
  
  // Fallback to body
  return document.body.innerText || document.body.textContent || "";
}

function displayResults(data) {
  const results = document.getElementById("results");
  const scoreCircle = document.getElementById("scoreCircle");
  const scoreValue = document.getElementById("scoreValue");
  const scoreLabel = document.getElementById("scoreLabel");
  const claimsInfo = document.getElementById("claimsInfo");
  const claimsList = document.getElementById("claimsList");
  
  const score = data.overall_score || 0;
  const scorePercent = Math.round(score * 100);
  
  scoreValue.textContent = scorePercent;
  scoreCircle.className = "score-circle";
  if (scorePercent > 70) {
    scoreCircle.classList.add("high");
    scoreLabel.textContent = data.verdict || "✅ Trustworthy";
  } else if (scorePercent > 40) {
    scoreCircle.classList.add("medium");
    scoreLabel.textContent = data.verdict || "⚠️ Mixed Credibility";
  } else {
    scoreCircle.classList.add("low");
    scoreLabel.textContent = data.verdict || "❌ Low Credibility";
  }
  
  const claimsCount = data.claims?.length || 0;
  const category = data.category || "general";
  const credible = data.claims?.filter(c => c.score >= 0.7).length || 0;
  const questionable = data.claims?.filter(c => c.score >= 0.4 && c.score < 0.7).length || 0;
  const suspicious = data.claims?.filter(c => c.score < 0.4).length || 0;
  
  claimsInfo.textContent = `${claimsCount} claims • ${category} • ✅${credible} ⚠️${questionable} ❌${suspicious}`;
  
  claimsList.innerHTML = "";
  if (data.claims && data.claims.length > 0) {
    data.claims.forEach((claim, index) => {
      const claimDiv = document.createElement("div");
      claimDiv.className = "claim-item";
      const claimScore = claim.score || 0;
      if (claimScore > 0.7) claimDiv.classList.add("true");
      else if (claimScore > 0.4) claimDiv.classList.add("mixed");
      else claimDiv.classList.add("false");
      
      let details = `${Math.round(claimScore * 100)}% - ${claim.verification_status || 'Unknown'}`;
      if (claim.trust_level) details += ` • ${claim.trust_level} source`;
      if (claim.types && claim.types.length > 0) details += ` • ${claim.types[0]}`;
      
      claimDiv.innerHTML = `
        <div class="claim-text">${escapeHtml(claim.text)}</div>
        <div class="claim-score">${details}</div>
        ${claim.reasoning ? `<div style="font-size:10px;color:#888;margin-top:4px;font-style:italic;">${escapeHtml(claim.reasoning.substring(0, 120))}${claim.reasoning.length > 120 ? '...' : ''}</div>` : ''}
      `;
      claimsList.appendChild(claimDiv);
    });
  } else {
    claimsList.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">No claims detected</div>';
  }
  results.classList.remove("hidden");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
