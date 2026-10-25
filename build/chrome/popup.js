/**
 * YTM-DeSlop Popup Script
 */

document.getElementById('actionOpenOptions').onclick = () => {
    chrome.runtime.openOptionsPage();
};
document.getElementById('actionOpenOptions2').onclick = () => {
    // Export user data as JSON
    chrome.storage.local.get(null, (items) => {
        const blob = new Blob([JSON.stringify(items, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'YTM-DeSlop-export.json';
        a.click();
        URL.revokeObjectURL(url);
    });
};
document.getElementById('actionRefresh').onclick = () => {
    chrome.runtime.sendMessage({type: 'REFRESH_BLOCKLIST'});
    setTimeout(() => window.close(), 500);
};

// Load stats from storage
chrome.storage.local.get(['blockedChannels', 'blockedKeywords', 'blockedArtists'], (items) => {
    document.getElementById('statBlocked').textContent = (items.blockedChannels || []).length;
    document.getElementById('statManual').textContent = (items.blockedKeywords || []).length;
    // Load total from background
    chrome.runtime.sendMessage({type: 'GET_BLOCKLIST'}, response => {
        if (response && response.total) {
            document.getElementById('statTotal').textContent = response.total;
            document.getElementById('statBlocked').textContent = (response.total - (items.blockedChannels || []).length);
        }
    });
});