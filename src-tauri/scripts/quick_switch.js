// Quick Switch Dialog for Home Assistant Desktop
// Injected into HA pages to provide Ctrl+K server switching

(function() {
    if (window.__haDesktopQuickSwitchInstalled) return;
    window.__haDesktopQuickSwitchInstalled = true;

    let dialog = null;
    let servers = [];
    let selectedIndex = 0;

    const styles = `
        .ha-desktop-quick-switch-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding-top: 15vh;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .ha-desktop-quick-switch-dialog {
            background: #fff;
            border-radius: 12px;
            width: 400px;
            max-width: 90vw;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            color: #1a1a1a;
        }
        .ha-desktop-quick-switch-header {
            padding: 16px;
            border-bottom: 1px solid #e0e0e0;
            font-weight: 500;
            font-size: 14px;
            color: #666;
        }
        .ha-desktop-quick-switch-list {
            max-height: 300px;
            overflow-y: auto;
        }
        .ha-desktop-quick-switch-item {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.1s;
        }
        .ha-desktop-quick-switch-item:hover,
        .ha-desktop-quick-switch-item.selected {
            background: #f5f5f5;
        }
        .ha-desktop-quick-switch-item.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .ha-desktop-quick-switch-info {
            flex: 1;
            min-width: 0;
        }
        .ha-desktop-quick-switch-name {
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ha-desktop-quick-switch-user {
            font-size: 13px;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ha-desktop-quick-switch-badge {
            font-size: 11px;
            background: #4a90d9;
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .ha-desktop-quick-switch-badge.disabled {
            background: #999;
        }
        .ha-desktop-quick-switch-hotkey {
            font-size: 12px;
            font-family: monospace;
            color: #666;
            background: #f0f0f0;
            padding: 4px 8px;
            border-radius: 4px;
        }
        .ha-desktop-quick-switch-hint {
            padding: 12px 16px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
        .ha-desktop-quick-switch-hint kbd {
            font-family: monospace;
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 4px;
            margin: 0 2px;
        }
    `;

    function injectStyles() {
        if (document.getElementById('ha-desktop-quick-switch-styles')) return;
        const style = document.createElement('style');
        style.id = 'ha-desktop-quick-switch-styles';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    async function loadServers() {
        if (!window.__TAURI__ || !window.__TAURI__.core) return [];
        try {
            return await window.__TAURI__.core.invoke('get_servers_for_quick_switch');
        } catch (e) {
            console.error('HA Desktop: Failed to load servers:', e);
            return [];
        }
    }

    function renderDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'ha-desktop-quick-switch-overlay';
        overlay.onclick = (e) => {
            if (e.target === overlay) closeDialog();
        };

        const content = document.createElement('div');
        content.className = 'ha-desktop-quick-switch-dialog';

        const header = document.createElement('div');
        header.className = 'ha-desktop-quick-switch-header';
        header.textContent = 'Switch Server';
        content.appendChild(header);

        const list = document.createElement('div');
        list.className = 'ha-desktop-quick-switch-list';

        servers.forEach((server, idx) => {
            const item = document.createElement('div');
            item.className = 'ha-desktop-quick-switch-item';
            if (idx === selectedIndex) item.classList.add('selected');
            if (!server.has_tokens) item.classList.add('disabled');
            item.onclick = () => {
                if (server.has_tokens) switchToServer(server);
            };

            const info = document.createElement('div');
            info.className = 'ha-desktop-quick-switch-info';

            const name = document.createElement('div');
            name.className = 'ha-desktop-quick-switch-name';
            name.textContent = server.name;

            if (server.is_active) {
                const badge = document.createElement('span');
                badge.className = 'ha-desktop-quick-switch-badge';
                badge.textContent = 'Active';
                name.appendChild(badge);
            }

            if (!server.has_tokens) {
                const badge = document.createElement('span');
                badge.className = 'ha-desktop-quick-switch-badge disabled';
                badge.textContent = 'Not connected';
                name.appendChild(badge);
            }

            info.appendChild(name);

            if (server.user_name) {
                const user = document.createElement('div');
                user.className = 'ha-desktop-quick-switch-user';
                user.textContent = server.user_name;
                info.appendChild(user);
            }

            item.appendChild(info);

            if (server.index <= 9) {
                const hotkey = document.createElement('span');
                hotkey.className = 'ha-desktop-quick-switch-hotkey';
                hotkey.textContent = server.index;
                item.appendChild(hotkey);
            }

            list.appendChild(item);
        });

        content.appendChild(list);

        const hint = document.createElement('div');
        hint.className = 'ha-desktop-quick-switch-hint';
        hint.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd> navigate, <kbd>Enter</kbd> select, <kbd>1</kbd>-<kbd>9</kbd> quick access, <kbd>Esc</kbd> close';
        content.appendChild(hint);

        overlay.appendChild(content);
        return overlay;
    }

    function updateSelection() {
        if (!dialog) return;
        const items = dialog.querySelectorAll('.ha-desktop-quick-switch-item');
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === selectedIndex);
        });
    }

    async function switchToServer(server) {
        closeDialog();

        if (!window.__TAURI__ || !window.__TAURI__.core) return;

        try {
            // Check if we're already at this server
            const result = await window.__TAURI__.core.invoke('switch_to_server_by_index', { index: server.index });
            if (result && result.url) {
                const currentOrigin = window.location.origin;
                const targetUrl = new URL(result.url);
                const targetOrigin = targetUrl.origin;

                if (currentOrigin === targetOrigin) {
                    console.log('HA Desktop: Already at server', server.name);
                    return;
                }

                await window.__TAURI__.core.invoke('refresh_tray_menu');
                window.location.href = result.url + '?external_auth=1';
            }
        } catch (err) {
            console.error('HA Desktop: Could not switch server:', err);
        }
    }

    async function openDialog() {
        if (dialog) return;

        injectStyles();
        servers = await loadServers();
        if (servers.length === 0) return;

        selectedIndex = servers.findIndex(s => s.is_active);
        if (selectedIndex < 0) selectedIndex = 0;

        dialog = renderDialog();
        document.body.appendChild(dialog);
    }

    function closeDialog() {
        if (dialog) {
            dialog.remove();
            dialog = null;
        }
    }

    function handleKeydown(e) {
        // Ctrl+K to open
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (dialog) {
                closeDialog();
            } else {
                openDialog();
            }
            return;
        }

        // Only handle other keys if dialog is open
        if (!dialog) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeDialog();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, servers.length - 1);
            updateSelection();
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const server = servers[selectedIndex];
            if (server && server.has_tokens) {
                switchToServer(server);
            }
            return;
        }

        // Number keys 1-9
        if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const idx = parseInt(e.key, 10) - 1;
            const server = servers[idx];
            if (server && server.has_tokens) {
                switchToServer(server);
            }
        }
    }

    // Remove the Ctrl+K handler from keyboard_shortcuts.js since we handle it here
    document.addEventListener('keydown', handleKeydown, true);
})();
