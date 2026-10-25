/**
 * YTM-DeSlop Content Script
 * Runs in YouTube Music and YouTube pages to detect and block AI music content.
 * Communicates with background script for blocklist data.
 */

const CONFIG = {
    musicYouTube: "music.youtube.com",
    youtube: "youtube.com",
};

/**
 * Send message to background script to get blocklist data
 */
async function getBlocklist() {
    try {
        const response = await chrome.runtime.sendMessage({ type: "GET_BLOCKLIST" });
        return response?.blocklist;
    } catch (err) {
        console.warn("[YTM-DeSlop] Could not get blocklist from background:", err);
        return null;
    }
}

/**
 * Check if a channel handle/ID matches a blocklist entry
 */
function isChannelBlocked(channelIdOrHandle, blocklistEntries) {
    if (!channelIdOrHandle) return false;

    const canonical = canonicalize(channelIdOrHandle);

    if (!blocklistEntries) return false;

    for (const entry of blocklistEntries) {
        if (entry.kind !== "channel") continue;

        const entryValue = canonicalize(entry.value);

        // Exact match on handle
        if (canonical === entryValue) return true;

        // Handle base match (e.g., @name-1234 vs @name)
        if (canonical.startsWith("@") && entryValue.startsWith("@")) {
            const baseCanonical = canonical.slice(1);
            const baseEntry = entryValue.slice(1);
            if (baseCanonical === baseEntry) return true;
        }

        // UC ID exact match
        if (CHANNEL_ID_RE.test(canonical) && CHANNEL_ID_RE.test(entryValue)) {
            if (canonical === entryValue) return true;
        }
    }
    return false;
}

/**
 * Check if artist name matches a blocklist entry
 */
function isArtistBlocked(artistName, blocklistEntries) {
    if (!artistName || !blocklistEntries) return false;

    const canonical = canonicalize(artistName);

    for (const entry of blocklistEntries) {
        if (entry.kind !== "artist") continue;

        const entryValue = canonicalize(entry.value);

        // Contains match
        if (canonical.includes(entryValue) || entryValue.includes(canonical)) {
            return true;
        }

        // Exact match
        if (canonical === entryValue) return true;
    }
    return false;
}

/**
 * Check if title contains a blocked keyword
 */
function isTitleBlocked(title, blocklistEntries) {
    if (!title || !blocklistEntries) return false;

    const canonicalTitle = canonicalize(title);

    for (const entry of blocklistEntries) {
        if (entry.kind !== "keyword") continue;

        const keyword = canonicalize(entry.value);
        if (keyword && canonicalTitle.includes(keyword)) {
            return true;
        }
    }
    return false;
}

/**
 * Canonicalize a value for matching
 */
function canonicalize(value) {
    if (!value) return "";
    return value.trim().toLowerCase();
}

/**
 * YouTube channel ID regex: UC + 22 alphanumeric chars
 */
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * Apply blocking visual indicator to an element
 */
function applyBlockStyle(element, blockType, isUserBlock = false) {
    if (!element || !element.parentNode) return;

    const isHighConfidence = !isUserBlock;

    // Create warning indicator dot
    const indicator = document.createElement("span");
    indicator.style.cssText = `
        position: relative;
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-left: 3px;
        vertical-align: middle;
        background: ${isHighConfidence ? "#ff0000" : "#ffa500"};
        box-shadow: 0 0 0 2px ${element.style.color || "var(--yt-primary-color, white)"};
        cursor: help;
        title: ${isUserBlock ? "User-blocked" : "AI slop content"};
    `;

    // Insert after the element text node
    const textNode = element.ownerDocument.createTextNode(" ");
    element.parentNode.insertBefore(indicator, textNode.nextSibling);
    element.parentNode.insertBefore(textNode, indicator.nextSibling);

    // Add title attribute
    indicator.title = `YTM-DeSlop: ${blockType.toUpperCase()} content`;

    // Apply visual dimming
    const originalColor = element.style.color;
    element.style.color = isHighConfidence ? "#ff6b6b" : "#ffa501";
    element.style.setProperty("--ytm-block-confidence", isHighConfidence ? "high" : "medium", "important");

    // Schedule removal after page navigation or re-init
    const observer = new MutationObserver(() => {
        indicator.remove();
        observer.disconnect();
    });
    observer.observe(element.parentNode, { childList: true, subtree: true });
}

/**
 * Add warning text next to blocked content
 */
function addWarningText(element, blockType) {
    if (!element) return;

    const warning = document.createElement("span");
    warning.style.cssText = `
        position: relative;
        display: inline-block;
        margin-left: 6px;
        padding: 2px 6px;
        background: rgba(255, 0, 0, 0.15);
        border-radius: 3px;
        font-size: 10px;
        color: #ff0000;
        white-space: nowrap;
    `;
    warning.innerText = ` [AI-SLOP ${blockType.toUpperCase()}] `;

    element.parentNode.insertBefore(warning, element.nextSibling);
    element.parentNode.insertBefore(document.createTextNode(" "), warning.nextSibling);
}

/**
 * Get the current video title from the page
 */
function getCurrentTitle() {
    // YouTube Music title
    const titleEl = document.querySelector('.ytd-video-title-renderer');
    if (titleEl) return titleEl.innerText || titleEl.textContent || "";

    // Standard YouTube title
    const ytTitle = document.querySelector('.watch-title');
    if (ytTitle) return ytTitle.innerText || ytTitle.textContent || "";

    // Fallback: page title
    return document.title;
}

/**
 * Get the current channel/artist name from the page
 */
function getCurrentChannel() {
    // YouTube Music channel name
    const channelEl = document.querySelector('.ytd-channel-name');
    if (channelEl) return channelEl.innerText || channelEl.textContent || "";

    // Standard YouTube channel
    const ytChannel = document.querySelector('.ytd-channel-name');
    if (ytChannel) return ytChannel.innerText || ytChannel.textContent || "";

    // Channel from URL
    try {
        const url = new URL(window.location.href);
        if (url.hostname.includes("youtube")) {
            const vidId = url.searchParams.get("v");
            // Could fetch channel info, but skip for now
        }
    } catch (e) {}

    return "";
}

/**
 * Get the current artist name from the music page
 */
function getCurrentArtist() {
    // Music YouTube artist name
    const artistEl = document.querySelector('.ytd-player-bar .ytd-long-form-description-span');
    if (artistEl) return artistEl.innerText || artistEl.textContent || "";

    // Row-based artist
    const rowArtist = document.querySelector('.ytd-rock-carousel-container .ytd-video-secondary-info-renderer');
    if (rowArtist) return rowArtist.innerText || rowArtist.textContent || "";

    // Try meta tags
    const metaArtist = document.querySelector('meta[name="music:artist"]');
    if (metaArtist) return metaArtist.content || "";

    return "";
}

/**
 * Initialize content script - set up observers and check content
 */
function initialize() {
    // Periodically check for AI-blockable content
    const checkInterval = setInterval(async () => {
        if (!isRelevantPage()) {
            clearInterval(checkInterval);
            return;
        }

        const blocklist = await getBlocklist();
        if (!blocklist) return;

        // Check and block titles
        checkAndBlockTitles(blocklist);

        // Check and block channel names
        checkAndBlockChannels(blocklist);

        // Check and block artist names
        checkAndBlockArtists(blocklist);
    }, 3000);

    // Also check immediately on load
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 500);
}

/**
 * Check video titles against blocklist
 */
function checkAndBlockTitles(blocklist) {
    const titleElements = document.querySelectorAll(
        '.ytd-video-title-renderer, ' +
        '.video-title, ' +
        '.watch-title'
    );

    for (const el of titleElements) {
        const title = el.innerText || el.textContent || "";
        if (!title) continue;

        if (isTitleBlocked(title, blocklist)) {
            applyBlockStyle(el, "title");
            addWarningText(el, "title");
        }
    }
}

/**
 * Check channel names against blocklist
 */
function checkAndBlockChannels(blocklist) {
    const channelElements = document.querySelectorAll(
        '.ytd-channel-name, ' +
        '.yt-simple-endpoint.style-scope.ytd-channel-name'
    );

    for (const el of channelElements) {
        const channelName = el.innerText || el.textContent || "";
        if (!channelName) continue;

        // Check blocklist
        if (isChannelBlocked(channelName, blocklist)) {
            applyBlockStyle(el, "channel");
            addWarningText(el, "channel");
        }

        // User manually blocked channels are handled separately
        // via the options UI and stored in storage
    }
}

/**
 * Check artist names against blocklist
 */
function checkAndBlockArtists(blocklist) {
    const artistElements = document.querySelectorAll(
        '.ytd-player-bar .ytd-long-form-description-span, ' +
        '.ytd-video-owner .ytd-channel-name'
    );

    for (const el of artistElements) {
        const artistText = el.innerText || el.textContent || "";
        if (!artistText) continue;

        // Check blocklist
        if (isArtistBlocked(artistText, blocklist)) {
            applyBlockStyle(el, "artist");
            addWarningText(el, "artist");
        }
    }
}

/**
 * Determine if we're on a relevant YouTube page
 */
function isRelevantPage() {
    const hostname = window.location.hostname.toLowerCase();
    return (
        hostname === CONFIG.musicYouTube ||
        hostname === CONFIG.youtube ||
        hostname.endsWith(`.${CONFIG.youtube}`)
    );
}

// Initialize on content script load
initialize();