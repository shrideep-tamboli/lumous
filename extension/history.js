// Load and display extraction history

async function loadHistory() {
    const result = await chrome.storage.local.get(['extractions']);
    const extractions = result.extractions || [];
    
    displayStats(extractions);
    displayExtractions(extractions);
}

function displayStats(extractions) {
    const statsDiv = document.getElementById('stats');
    
    const totalExtractions = extractions.length;
    const totalChars = extractions.reduce((sum, e) => sum + e.textLength, 0);
    const uniqueDomains = new Set(extractions.map(e => e.domain)).size;
    
    statsDiv.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalExtractions}</div>
            <div class="stat-label">Total Extractions</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatNumber(totalChars)}</div>
            <div class="stat-label">Total Characters</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${uniqueDomains}</div>
            <div class="stat-label">Unique Domains</div>
        </div>
    `;
}

function displayExtractions(extractions) {
    const historyDiv = document.getElementById('history');
    
    if (extractions.length === 0) {
        historyDiv.innerHTML = `
            <div class="empty-state">
                <h2>No extractions yet</h2>
                <p>Click the extension icon on any webpage and press "Get Trust Score" to start analyzing content.</p>
            </div>
        `;
        return;
    }
    
    historyDiv.innerHTML = '';
    
    extractions.forEach((extraction, index) => {
        const extractionDiv = document.createElement('div');
        extractionDiv.className = 'extraction';
        extractionDiv.innerHTML = `
            <div class="extraction-header">
                <h3 class="extraction-title">${escapeHtml(extraction.title)}</h3>
            </div>
            <div class="extraction-meta">
                <span>🌐 ${extraction.domain}</span>
                <span>📝 ${formatNumber(extraction.textLength)} chars</span>
                <span>🕐 ${formatDate(extraction.timestamp)}</span>
            </div>
            <a href="${extraction.url}" target="_blank" class="extraction-url">${extraction.url}</a>
            <div class="extraction-excerpt">${escapeHtml(extraction.excerpt)}</div>
            <div class="extraction-actions">
                <button class="view-btn" data-index="${index}">👁️ View Full Text</button>
                <button class="copy-btn" data-index="${index}">📋 Copy Text</button>
                <button class="delete-btn danger" data-index="${index}">🗑️ Delete</button>
            </div>
        `;
        
        // Add event listeners
        extractionDiv.querySelector('.view-btn').addEventListener('click', () => viewFull(index));
        extractionDiv.querySelector('.copy-btn').addEventListener('click', () => copyText(index));
        extractionDiv.querySelector('.delete-btn').addEventListener('click', () => deleteExtraction(index));
        
        historyDiv.appendChild(extractionDiv);
    });
}

async function viewFull(index) {
    const result = await chrome.storage.local.get(['extractions']);
    const extraction = result.extractions[index];
    
    if (!extraction) return;
    
    // Open in new window with full text
    const newWindow = window.open('', '_blank', 'width=800,height=600');
    newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHtml(extraction.title)}</title>
            <style>
                body {
                    font-family: Georgia, serif;
                    max-width: 800px;
                    margin: 40px auto;
                    padding: 20px;
                    line-height: 1.6;
                }
                h1 { color: #333; }
                .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
                a { color: #007bff; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
            </style>
        </head>
        <body>
            <h1>${escapeHtml(extraction.title)}</h1>
            <div class="meta">
                <strong>URL:</strong> <a href="${extraction.url}" target="_blank">${extraction.url}</a><br>
                <strong>Extracted:</strong> ${formatDate(extraction.timestamp)}<br>
                <strong>Length:</strong> ${formatNumber(extraction.textLength)} characters
            </div>
            <pre>${escapeHtml(extraction.text)}</pre>
        </body>
        </html>
    `);
}

async function copyText(index) {
    const result = await chrome.storage.local.get(['extractions']);
    const extraction = result.extractions[index];
    
    if (!extraction) return;
    
    try {
        await navigator.clipboard.writeText(extraction.text);
        alert('✓ Text copied to clipboard!');
    } catch (error) {
        console.error('Copy failed:', error);
        alert('❌ Failed to copy text');
    }
}

async function deleteExtraction(index) {
    if (!confirm('Are you sure you want to delete this extraction?')) return;
    
    const result = await chrome.storage.local.get(['extractions']);
    const extractions = result.extractions || [];
    
    extractions.splice(index, 1);
    await chrome.storage.local.set({ extractions: extractions });
    
    loadHistory();
}

async function clearHistory() {
    if (!confirm('Are you sure you want to delete ALL extractions? This cannot be undone.')) return;
    
    await chrome.storage.local.set({ extractions: [] });
    loadHistory();
}

async function exportData() {
    const result = await chrome.storage.local.get(['extractions']);
    const extractions = result.extractions || [];
    
    const dataStr = JSON.stringify(extractions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `trust-score-extractions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

function refreshHistory() {
    loadHistory();
}

// Utility functions
function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add event listeners for action buttons
document.getElementById('refreshBtn').addEventListener('click', refreshHistory);
document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('clearBtn').addEventListener('click', clearHistory);

// Remove the "Save All as Individual Files" button since we don't need downloads anymore
const saveAllBtn = document.getElementById('saveAllBtn');
if (saveAllBtn) {
    saveAllBtn.style.display = 'none';
}

// Load history on page load
loadHistory();
