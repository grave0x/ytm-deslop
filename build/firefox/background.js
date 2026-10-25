/**
 * YTM-DeSlop Background Script
 * Serves blocklist data to content scripts via messaging
 */

// Blocklist loaded from extension package
let blocklistCache = null;

/**
 * Load the embedded blocklist JSON
 */
async function loadEmbeddedBlocklist() {
    if (blocklistCache) return blocklistCache;

    try {
        // Try to fetch from packaged extension resources
        const response = await fetch(chrome.runtime.getURL('blocklist.json'));
        if (response.ok) {
            const data = await response.json();
            blocklistCache = data;
            console.log("[YTM-DeSlop] Loaded embedded blocklist:", data.total);
            return data;
        }
    } catch (e) {
        console.warn("[YTM-DeSlop] Could not load embedded blocklist:", e);
    }

    // Fallback: try remote URL
    try {
        const response = await fetch(
            'https://raw.githubusercontent.com/your-repo/YTM-DeSlop/main/src/data/blocklist.json',
            { headers: { 'User-Agent': 'YTM-DeSlop/1.0' } }
        );
        if (response.ok) {
            const data = await response.json();
            blocklistCache = data;
            console.log("[YTM-DeSlop] Loaded remote blocklist:", data.total);
            return data;
        }
    } catch (e) {
        console.warn("[YTM-DeSlop] Could not load remote blocklist:", e);
    }

    blocklistCache = null;
    return null;
}

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "GET_BLOCKLIST") {
        const data = await loadEmbeddedBlocklist();
        sendResponse({ blocklist: data ? data.entries : null, total: data ? data.total : 0 });
    }
    return true; // Keep message channel open for async response
});

/**
 * Initialize: load blocklist on startup
 */
loadEmbeddedBlocklist();
