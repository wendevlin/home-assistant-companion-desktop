// OAuth callback handler
// Handles the authorization code exchange after Home Assistant redirects back

(async function() {
    if (window.__haOAuthHandled) return;
    window.__haOAuthHandled = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const serverUrl = window.location.origin;
    // client_id without trailing slash (must match authorize request)
    const clientId = serverUrl;

    try {
        const response = await fetch(serverUrl + '/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: clientId
            })
        });

        if (!response.ok) throw new Error('Token exchange failed: ' + response.status);

        const tokens = await response.json();

        // Check if there's a pending new server to create
        const servers = await window.__TAURI__.core.invoke('get_servers');
        const existingServer = servers.find(s => s.url === serverUrl);
        const isNewServer = !existingServer;

        if (isNewServer) {
            // This might be a new server - use save_server_url as fallback
            // (it will be handled by pending server logic in backend)
            await window.__TAURI__.core.invoke('save_server_url', { url: serverUrl });
        }

        await window.__TAURI__.core.invoke('save_tokens', {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in
        });

        // Fetch and save user info
        try {
            const userResponse = await fetch(serverUrl + '/api/auth/current_user', {
                headers: {
                    'Authorization': 'Bearer ' + tokens.access_token,
                    'Content-Type': 'application/json'
                }
            });
            if (userResponse.ok) {
                const user = await userResponse.json();
                const userName = user.name || null;
                let userImage = null;
                if (user.picture) {
                    userImage = serverUrl + user.picture;
                }
                await window.__TAURI__.core.invoke('save_user_info', {
                    userName: userName,
                    userImage: userImage
                });
                console.log('HA Desktop: User info saved after OAuth:', userName);
            }
        } catch (userErr) {
            console.log('HA Desktop: Could not fetch user info:', userErr);
        }

        // Refresh tray menu to show new server
        await window.__TAURI__.core.invoke('refresh_tray_menu').catch(() => {});

        if (isNewServer) {
            // For new servers, go to settings with rename flag
            await window.__TAURI__.core.invoke('go_to_settings_rename');
        } else {
            window.location.href = serverUrl + '?external_auth=1';
        }
    } catch (err) {
        console.error('OAuth error:', err);
        await window.__TAURI__.core.invoke('clear_pending_server');
        if (!err.message.includes('400')) {
            const hasTokens = await window.__TAURI__.core.invoke('has_tokens');
            if (hasTokens) {
                const url = await window.__TAURI__.core.invoke('get_server_url');
                if (url) window.location.href = url + '?external_auth=1';
            } else {
                window.__TAURI__.core.invoke('go_to_settings');
            }
        }
    }
})();
