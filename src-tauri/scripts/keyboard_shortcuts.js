// Keyboard shortcuts for Home Assistant Desktop
// Installs handlers for F5 (refresh), Ctrl+F5 (hard refresh), F12 (dev tools),
// Ctrl+1-9 (switch server), and Ctrl+K (quick switch dialog)

if (!window.__haDesktopKeyboardInstalled) {
    window.__haDesktopKeyboardInstalled = true;

    // Helper to switch to a server by index
    async function switchToServer(index) {
        if (!window.__TAURI__ || !window.__TAURI__.core) return;
        try {
            const server = await window.__TAURI__.core.invoke('switch_to_server_by_index', { index });
            if (server && server.url) {
                // Check if we're already at this server (compare origins)
                const currentOrigin = window.location.origin;
                const targetUrl = new URL(server.url);
                const targetOrigin = targetUrl.origin;

                if (currentOrigin === targetOrigin) {
                    console.log('HA Desktop: Already at server', server.name);
                    return;
                }

                await window.__TAURI__.core.invoke('refresh_tray_menu');
                window.location.href = server.url + '?external_auth=1';
            }
        } catch (err) {
            console.log('HA Desktop: Could not switch server:', err);
        }
    }

    document.addEventListener('keydown', function(e) {
        const key = e.key.toLowerCase();

        // F12: Toggle dev tools
        if (key === 'f12') {
            e.preventDefault();
            if (window.__TAURI__ && window.__TAURI__.core) {
                window.__TAURI__.core.invoke('toggle_devtools');
            }
            return;
        }

        // Ctrl+1-9: Switch to server by index (Ctrl+K is handled in quick_switch.js)
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const index = parseInt(e.key, 10);
            switchToServer(index);
            return;
        }

        // Ctrl+F5 or Ctrl+Shift+R: Hard refresh (clear cache)
        if ((e.ctrlKey && key === 'f5') || (e.ctrlKey && e.shiftKey && key === 'r')) {
            e.preventDefault();
            if (window.localStorage) localStorage.clear();
            if (window.sessionStorage) sessionStorage.clear();
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(name => caches.delete(name)));
            }
            window.location.reload();
            return;
        }

        // F5 or Ctrl+R: Normal refresh
        if (key === 'f5' || (e.ctrlKey && key === 'r')) {
            e.preventDefault();
            window.location.reload();
        }
    });
}
