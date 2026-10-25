// ---------------------------------------------------------------------------
// YTM-DeSlop Options Script (Firefox)
// ---------------------------------------------------------------------------

/**
 * Cross-tab communication between popup, options, and background
 */
const STORAGE_KEY = 'YTM-DeSlop-settings';
const BLOCKED_CHANNELS_KEY = 'blockedChannels';
const BLOCKED_ARTISTS_KEY = 'blockedArtists';
const BLOCKED_KEYWORDS_KEY = 'blockedKeywords';

/**
 * State management
 */
let currentState = {
    preferences: {
        blockHighConfidence: true,
        showMediumConfidenceWarnings: true,
        autoBlockNew: false,
        showBlockIndicators: true,
    },
    manualBlocks: {
        blockedChannels: [],
        blockedArtists: [],
        blockedKeywords: [],
    },
};

let isInitialized = false;

/**
 * Initialize options page
 */
async function initializeOptions() {
    if (isInitialized) return;

    // Load all data
    await loadAllData();

    // Setup tabs
    setupTabs();

    // Setup event listeners
    setupEventListeners();

    // Populate stats
    updateStats();

    // Populate source list
    populateSourceList();

    // Populate manual blocks
    populateManualBlocks();

    isInitialized = true;
}

/**
 * Load all settings and manual blocks from storage
 */
async function loadAllData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            [STORAGE_KEY, BLOCKED_CHANNELS_KEY, BLOCKED_ARTISTS_KEY, BLOCKED_KEYWORDS_KEY],
            (items) => {
                if (items[STORAGE_KEY]) {
                    const parsed = JSON.parse(items[STORAGE_KEY]);
                    currentState.preferences = {
                        ...currentState.preferences,
                        ...parsed.preferences,
                    };
                }

                currentState.manualBlocks.blockedChannels = items[BLOCKED_CHANNELS_KEY] || [];
                currentState.manualBlocks.blockedArtists = items[BLOCKED_ARTISTS_KEY] || [];
                currentState.manualBlocks.blockedKeywords = items[BLOCKED_KEYWORDS_KEY] || [];

                resolve();n            }
        );
    });
}

/**
 * Setup tab navigation
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.ytm-ds-tab');
    const panels = document.querySelectorAll('.ytm-ds-tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Update tab state
            tabs.forEach(t => t.classList.remove('ytm-ds-tab--active'));
            tab.classList.add('ytm-ds-tab--active');

            // Update panel state
            panels.forEach(p => p.classList.remove('ytm-ds-tab-panel--active'));
            const targetPanel = document.querySelector(`.ytm-ds-tab-panel[data-tab="${targetTab}"]`);
            if (targetPanel) targetPanel.classList.add('ytm-ds-tab-panel--active');
        });
    });
}

/**
 * Setup event listeners for all controls
 */
function setupEventListeners() {
    // General preferences
    document.getElementById('prefBlockHigh').addEventListener('change', (e) => {
        currentState.preferences.blockHighConfidence = e.target.checked;
        saveState();
    });

    document.getElementById('prefWarnMedium').addEventListener('change', (e) => {
        currentState.preferences.showMediumConfidenceWarnings = e.target.checked;
        saveState();
    });

    document.getElementById('prefAutoBlock').addEventListener('change', (e) => {
        currentState.preferences.autoBlockNew = e.target.checked;
        saveState();
    });

    document.getElementById('prefShowIndicator').addEventListener('change', (e) => {
        currentState.preferences.showBlockIndicators = e.target.checked;
        saveState();
    });

    // Manual blocks
    document.getElementById('btnAddChannel').addEventListener('click', addBlockedChannel);
    document.getElementById('addChannelInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBlockedChannel();
    });

    document.getElementById('btnAddArtist').addEventListener('click', addBlockedArtist);
    document.getElementById('addArtistInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBlockedArtist();
    });

    document.getElementById('btnAddKeyword').addEventListener('click', addBlockedKeyword);
    document.getElementById('addKeywordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBlockedKeyword();
    });

    // Data management
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importData);

    document.getElementById('btnClearAll').addEventListener('click', clearAllBlocks);
    document.getElementById('btnResetAll').addEventListener('click', resetAll);

    document.getElementById('btnRefreshSources').addEventListener('click', refreshBlocklist);
}

/**
 * Add a blocked channel
 */
function addBlockedChannel() {
    const input = document.getElementById('addChannelInput');
    const value = input.value.trim();

    if (!value) return;

    // Validate channel format (handle or UC ID)
    const isHandle = value.startsWith('@') && /^[a-zA-Z0-9_.-]{3,}$/.test(value.slice(1));
    const isUCId = /^[UC][A-Za-z0-9_-]{22}$/.test(value);

    if (!isHandle && !isUCId) {
        alert('Invalid channel format. Please enter a YouTube handle (@name) or UC channel ID (UC...).');
        return;
    }

    if (!currentState.manualBlocks.blockedChannels.includes(value)) {
        currentState.manualBlocks.blockedChannels.push(value);
        saveState();
        renderBlockedChannels();
    }

    input.value = '';
}

/**
 * Add a blocked artist
 */
function addBlockedArtist() {
    const input = document.getElementById('addArtistInput');
    const value = input.value.trim();

    if (!value) return;

    if (!currentState.manualBlocks.blockedArtists.includes(value)) {
        currentState.manualBlocks.blockedArtists.push(value);
        saveState();
        renderBlockedArtists();
    }

    input.value = '';
}

/**
 * Add a blocked keyword
 */
function addBlockedKeyword() {
    const input = document.getElementById('addKeywordInput');
    const value = input.value.trim();

    if (!value) return;

    if (!currentState.manualBlocks.blockedKeywords.includes(value)) {
        currentState.manualBlocks.blockedKeywords.push(value);
        saveState();
        renderBlockedKeywords();
    }

    input.value = '';
}

/**
 * Render blocked channels list
 */
function renderBlockedChannels() {
    const container = document.getElementById('blockedChannelsList');

    if (currentState.manualBlocks.blockedChannels.length === 0) {
        container.innerHTML = '<div class="ytm-ds-empty-state">No manually blocked channels</div>';
        return;
    }

    container.innerHTML = '';

    currentState.manualBlocks.blockedChannels.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'ytm-ds-list-item';
        item.innerHTML = `
            <span class="ytm-ds-list-item-value">${value}</span>
            <div class="ytm-ds-list-item-actions">
                <button class="ytm-ds-icon-button" data-index="${index}" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 7l-.867 12H5.867L5 7h14zm-4.5 0V5.5h-5V7h5zM6.75 3.75a.75.75 0 011.5 0V5h.75v.75H18v.75h-10.5V3.75H6.75z"/>
                    </svg>
                </button>
            </div>
        `;

        const removeBtn = item.querySelector('button');
        removeBtn.addEventListener('click', () => removeBlockedChannel(index));

        container.appendChild(item);
    });
}

/**
 * Render blocked artists list
 */
function renderBlockedArtists() {
    const container = document.getElementById('blockedArtistsList');

    if (currentState.manualBlocks.blockedArtists.length === 0) {
        container.innerHTML = '<div class="ytm-ds-empty-state">No manually blocked artists</div>';
        return;
    }

    container.innerHTML = '';

    currentState.manualBlocks.blockedArtists.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'ytm-ds-list-item';
        item.innerHTML = `
            <span class="ytm-ds-list-item-value">${value}</span>
            <div class="ytm-ds-list-item-actions">
                <button class="ytm-ds-icon-button" data-index="${index}" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 7l-.867 12H5.867L5 7h14zm-4.5 0V5.5h-5V7h5zM6.75 3.75a.75.75 0 011.5 0V5h.75v.75H18v.75h-10.5V3.75H6.75z"/>
                    </svg>
                </button>
            </div>
        `;

        const removeBtn = item.querySelector('button');
        removeBtn.addEventListener('click', () => removeBlockedArtist(index));

        container.appendChild(item);
    });
}

/**
 * Render blocked keywords list
 */
function renderBlockedKeywords() {
    const container = document.getElementById('blockedKeywordsList');

    if (currentState.manualBlocks.blockedKeywords.length === 0) {
        container.innerHTML = '<div class="ytm-ds-empty-state">No blocked keywords</div>';
        return;
    }

    container.innerHTML = '';

    currentState.manualBlocks.blockedKeywords.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'ytm-ds-list-item';
        item.innerHTML = `
            <span class="ytm-ds-list-item-value">${value}</span>
            <div class="ytm-ds-list-item-actions">
                <button class="ytm-ds-icon-button" data-index="${index}" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 7l-.867 12H5.867L5 7h14zm-4.5 0V5.5h-5V7h5zM6.75 3.75a.75.75 0 011.5 0V5h.75v.75H18v.75h-10.5V3.75H6.75z"/>
                    </svg>
                </button>
            </div>
        `;

        const removeBtn = item.querySelector('button');
        removeBtn.addEventListener('click', () => removeBlockedKeyword(index));

        container.appendChild(item);
    });
}

/**
 * Remove a blocked channel
 */
function removeBlockedChannel(index) {
    currentState.manualBlocks.blockedChannels.splice(index, 1);
    saveState();
    renderBlockedChannels();
}

/**
 * Remove a blocked artist
 */
function removeBlockedArtist(index) {
    currentState.manualBlocks.blockedArtists.splice(index, 1);
    saveState();
    renderBlockedArtists();
}

/**
 * Remove a blocked keyword
 */
function removeBlockedKeyword(index) {
    currentState.manualBlocks.blockedKeywords.splice(index, 1);
    saveState();
    renderBlockedKeywords();
}

/**
 * Save current state to storage
 */
function saveState() {
    chrome.storage.local.set({
        [STORAGE_KEY]: {
            preferences: currentState.preferences,
        },
        [BLOCKED_CHANNELS_KEY]: currentState.manualBlocks.blockedChannels,
        [BLOCKED_ARTISTS_KEY]: currentState.manualBlocks.blockedArtists,
        [BLOCKED_KEYWORDS_KEY]: currentState.manualBlocks.blockedKeywords,
    });
}

/**
 * Export all data as JSON
 */
function exportData() {
    const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        preferences: currentState.preferences,
        manualBlocks: currentState.manualBlocks,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YTM-DeSlop-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Import data from JSON file
 */
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format');
            }

            // Update state with imported data
            if (data.preferences) {
                currentState.preferences = { ...currentState.preferences, ...data.preferences };
            }

            if (data.manualBlocks) {
                currentState.manualBlocks = {
                    blockedChannels: Array.isArray(data.manualBlocks.blockedChannels)
                        ? data.manualBlocks.blockedChannels
                        : [],
                    blockedArtists: Array.isArray(data.manualBlocks.blockedArtists)
                        ? data.manualBlocks.blockedArtists
                        : [],
                    blockedKeywords: Array.isArray(data.manualBlocks.blockedKeywords)
                        ? data.manualBlocks.blockedKeywords
                        : [],
                };
            }

            saveState();
            updateUI();
            showNotification('Data imported successfully');
        } catch (err) {
            showNotification(`Error importing data: ${err.message}`, true);
        }
    };
    reader.readAsTextFile(file);
}

/**
 * Clear all manual blocks
 */
function clearAllBlocks() {
    if (confirm('Are you sure you want to clear all manually blocked channels, artists, and keywords? This cannot be undone.')) {
        currentState.manualBlocks.blockedChannels = [];
        currentState.manualBlocks.blockedArtists = [];
        currentState.manualBlocks.blockedKeywords = [];
        saveState();
        updateUI();
        showNotification('All manual blocks cleared');
    }
}

/**
 * Reset all settings to defaults
 */
function resetAll() {
    if (confirm('Are you sure you want to reset all settings to defaults? This will also clear all manual blocks.')) {
        currentState.preferences = {
            blockHighConfidence: true,
            showMediumConfidenceWarnings: true,
            autoBlockNew: false,
            showBlockIndicators: true,
        };
        currentState.manualBlocks.blockedChannels = [];
        currentState.manualBlocks.blockedArtists = [];
        currentState.manualBlocks.blockedKeywords = [];
        saveState();
        updateUI();
        showNotification('All settings reset to defaults');
    }
}

/**
 * Update UI elements based on current state
 */
function updateUI() {
    updateStats();
    renderBlockedChannels();
    renderBlockedArtists();
    renderBlockedKeywords();
    updateTabPreferences();
}

/**
 * Update preferences checkboxes in UI
 */
function updateTabPreferences() {
    document.getElementById('prefBlockHigh').checked = currentState.preferences.blockHighConfidence;
    document.getElementById('prefWarnMedium').checked = currentState.preferences.showMediumConfidenceWarnings;
    document.getElementById('prefAutoBlock').checked = currentState.preferences.autoBlockNew;
    document.getElementById('prefShowIndicator').checked = currentState.preferences.showBlockIndicators;
}

/**
 * Update statistics display
 */
function updateStats() {
    // Update stats from local storage (simplified for now)
    document.getElementById('statTotalBlocklist').textContent = '-';
    document.getElementById('statHighConf').textContent = '-';
    document.getElementById('statMedConf').textContent = '-';
}

/**
 * Populate source list (simplified - just show available sources)
 */
function populateSourceList() {
    const container = document.getElementById('sourceList');

    const sources = [
        { name: 'AiSList Blocklist', confidence: 'High', count: '34,914', lastUpdate: '2026-07-19' },
        { name: 'AiSList Warnlist', confidence: 'Medium', count: '1,062', lastUpdate: '2026-07-19' },
        { name: 'Muhdiboy YTM Blocklist', confidence: 'Medium', count: '183', lastUpdate: 'Unknown' },
    ];

    container.innerHTML = '';

    sources.forEach(source => {
        const item = document.createElement('div');
        item.className = 'ytm-ds-list-item';
        item.innerHTML = `
            <div>
                <strong>${source.name}</strong><br>
                <span style="font-size: 12px; color: #5f6368;">${source.confidence} confidence • ${source.count} entries • ${source.lastUpdate}</span>
            </div>
        `;

        container.appendChild(item);
    });
}

/**
 * Show notification message
 */
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#d93025' : '#34a853'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2147483647;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        transition: opacity 0.3s;
    `;
    notification.innerText = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Refresh blocklist from sources
 */
async function refreshBlocklist() {
    const button = document.getElementById('btnRefreshSources');
    const originalText = button.innerText;

    button.innerText = 'Refreshing...';
    button.disabled = true;

    // Request blocklist refresh from background
    chrome.runtime.sendMessage({ type: 'REFRESH_BLOCKLIST' });

    setTimeout(() => {
        button.innerText = originalText;
        button.disabled = false;
        showNotification('Blocklist refreshed');
    }, 2000);
}

/**
 * Initialize options page
 */
async function initOptions() {
    try {
        await loadAllData();
        setupTabs();
        setupEventListeners();
        updateUI();
        console.log('[YTM-DeSlop] Options page initialized');
    } catch (err) {
        console.error('[YTM-DeSlop] Error initializing options page:', err);
        showNotification(`Error loading options: ${err.message}`, true);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initOptions);

// Handle storage changes from other tabs
chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY] || changes[BLOCKED_CHANNELS_KEY] || changes[BLOCKED_ARTISTS_KEY] || changes[BLOCKED_KEYWORDS_KEY]) {
        loadAllData().then(() => {
            updateUI();
        });
    }
});