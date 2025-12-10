// Offline detection script
// Detects browser error pages and redirects to the offline view

(function() {
    // Detect WebKitGTK error pages - they have very specific characteristics
    // Only trigger on actual browser error pages, not slow-loading HA pages
    const bodyText = document.body ? document.body.innerText : '';
    const isWebKitErrorPage = (
        // WebKitGTK error page indicators
        bodyText.includes('Problem Loading Page') ||
        bodyText.includes('Unable to load') ||
        bodyText.includes('Could not connect') ||
        bodyText.includes('The page could not be loaded') ||
        bodyText.includes('Server not found') ||
        bodyText.includes('Network is unreachable') ||
        bodyText.includes('Connection refused') ||
        // Chrome/Chromium style errors
        bodyText.includes('ERR_CONNECTION_REFUSED') ||
        bodyText.includes('ERR_NAME_NOT_RESOLVED') ||
        bodyText.includes('ERR_NETWORK_CHANGED') ||
        bodyText.includes('ERR_INTERNET_DISCONNECTED')
    );

    if (isWebKitErrorPage && window.__TAURI__ && window.__TAURI__.core) {
        console.log('HA Desktop: Detected browser error page, redirecting to offline view...');
        const serverUrl = window.location.origin;
        window.__TAURI__.core.invoke('go_to_offline', {
            serverUrl: serverUrl,
            serverName: ''
        });
    }
})();
