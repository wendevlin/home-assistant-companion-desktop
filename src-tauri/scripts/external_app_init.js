// External App API for Home Assistant
// This script runs before page load to set up the window.externalApp object
// that Home Assistant uses to communicate with native companion apps.

(function() {
    console.log('HA Desktop: Initializing external app API...');

    // Helper to refresh access token using refresh_token
    async function refreshAccessToken() {
        const tokenData = await window.__TAURI__.core.invoke('get_external_auth', { force: false });
        if (!tokenData || !tokenData.refresh_token) {
            console.log('HA Desktop: No refresh token available');
            return null;
        }

        const serverUrl = window.location.origin;
        // client_id without trailing slash (must match authorize request)
        const clientId = serverUrl;

        console.log('HA Desktop: Refreshing access token...');
        const response = await fetch(serverUrl + '/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokenData.refresh_token,
                client_id: clientId
            })
        });

        if (!response.ok) {
            console.error('HA Desktop: Token refresh failed:', response.status);
            // Tokens are invalid (likely created with old client_id)
            // Clear them and redirect to OAuth flow
            const activeServerId = await window.__TAURI__.core.invoke('get_active_server_id');
            if (activeServerId) {
                await window.__TAURI__.core.invoke('clear_server_tokens', { serverId: activeServerId });
            }
            // Redirect to OAuth authorization
            const authUrl = serverUrl + '/auth/authorize?' +
                'client_id=' + encodeURIComponent(serverUrl) +
                '&redirect_uri=' + encodeURIComponent(serverUrl + '/?auth_callback=1') +
                '&response_type=code';
            console.log('HA Desktop: Redirecting to OAuth flow');
            window.location.href = authUrl;
            return null;
        }

        const newTokens = await response.json();
        console.log('HA Desktop: Token refreshed successfully');

        // Save the new access token (keep the same refresh token)
        await window.__TAURI__.core.invoke('save_tokens', {
            accessToken: newTokens.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: newTokens.expires_in || 1800
        });

        return {
            access_token: newTokens.access_token,
            expires_in: newTokens.expires_in || 1800
        };
    }

    // Helper to fetch and save user info from Home Assistant
    async function fetchAndSaveUserInfo(accessToken) {
        try {
            const serverUrl = window.location.origin;
            const response = await fetch(serverUrl + '/api/auth/current_user', {
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const user = await response.json();
                const userName = user.name || null;
                // Build the full image URL if available
                let userImage = null;
                if (user.picture) {
                    userImage = serverUrl + user.picture;
                }
                await window.__TAURI__.core.invoke('save_user_info', {
                    userName: userName,
                    userImage: userImage
                });
                console.log('HA Desktop: User info saved:', userName);
            }
        } catch (err) {
            console.log('HA Desktop: Could not fetch user info:', err);
        }
    }

    window.externalApp = {
        getExternalAuth: function(payload) {
            console.log('HA Desktop: getExternalAuth called');
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                const callbackName = data.callback || 'externalAuthSetToken';
                const force = data.force || false;

                if (window.__TAURI__ && window.__TAURI__.core) {
                    // Always refresh the token to ensure it's valid
                    refreshAccessToken()
                        .then(function(tokenData) {
                            if (tokenData && tokenData.access_token) {
                                console.log('HA Desktop: Token retrieved (refreshed)');
                                // Fetch and save user info in background
                                fetchAndSaveUserInfo(tokenData.access_token);
                                if (typeof window[callbackName] === 'function') {
                                    window[callbackName](true, {
                                        access_token: tokenData.access_token,
                                        expires_in: tokenData.expires_in || 1800
                                    });
                                }
                            } else {
                                console.log('HA Desktop: No token available, need to re-authenticate');
                                if (typeof window[callbackName] === 'function') {
                                    window[callbackName](false);
                                }
                            }
                        })
                        .catch(function(err) {
                            console.error('HA Desktop: Failed to get/refresh token:', err);
                            if (typeof window[callbackName] === 'function') {
                                window[callbackName](false);
                            }
                        });
                } else {
                    setTimeout(function() {
                        if (window.__TAURI__ && window.__TAURI__.core) {
                            window.externalApp.getExternalAuth(payload);
                        } else if (typeof window[callbackName] === 'function') {
                            window[callbackName](false);
                        }
                    }, 100);
                }
            } catch (e) {
                console.error('HA Desktop: Error in getExternalAuth:', e);
            }
        },

        revokeExternalAuth: function(payload) {
            console.log('HA Desktop: revokeExternalAuth called');
            try {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                const callbackName = data.callback || 'externalAuthRevokeToken';

                if (window.__TAURI__ && window.__TAURI__.core) {
                    window.__TAURI__.core.invoke('revoke_external_auth')
                        .then(function() {
                            console.log('HA Desktop: Token revoked');
                            if (typeof window[callbackName] === 'function') {
                                window[callbackName](true);
                            }
                            window.__TAURI__.core.invoke('go_to_settings');
                        })
                        .catch(function(err) {
                            console.error('HA Desktop: Failed to revoke token:', err);
                            if (typeof window[callbackName] === 'function') {
                                window[callbackName](false);
                            }
                        });
                }
            } catch (e) {
                console.error('HA Desktop: Error in revokeExternalAuth:', e);
            }
        },

        externalBus: function(payload) {
            try {
                const message = typeof payload === 'string' ? JSON.parse(payload) : payload;
                window.__haDesktopHandleMessage(message);
            } catch (e) {
                console.error('HA Desktop: Failed to parse external bus message:', e);
            }
        }
    };

    window.__haDesktopHandleMessage = function(message) {
        const { id, type } = message;

        const sendResponse = function(result) {
            setTimeout(function() {
                if (typeof window.externalBus === 'function') {
                    window.externalBus({
                        id: id,
                        type: 'result',
                        success: true,
                        result: result
                    });
                }
            }, 0);
        };

        switch (type) {
            case 'config/get':
                sendResponse({
                    hasSettingsScreen: true,
                    canWriteTag: false,
                    canCommissionMatter: false,
                    canImportThreadCredentials: false,
                    hasAssist: false,
                    hasBarCodeScanner: false
                });
                break;
            case 'config_screen/show':
                if (window.__TAURI__ && window.__TAURI__.core) {
                    window.__TAURI__.core.invoke('go_to_settings');
                }
                break;
            case 'haptic':
            case 'connection-status':
                break;
            default:
                console.log('HA Desktop: Unhandled message type:', type);
        }
    };

    console.log('HA Desktop: External app API initialized');
})();
