// Server switch handler
// Shows a splash screen overlay and checks connectivity before navigating to a server
// This script uses format placeholders: {0} = serverUrl, {1} = urlWithAuth, {2} = serverName

(function() {{
    // Create splash overlay
    const splash = document.createElement('div');
    splash.id = 'ha-desktop-splash';
    splash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #1c1c1c;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        z-index: 999999;
    `;
    splash.innerHTML = `
        <svg style='width: 64px; height: 64px; margin-bottom: 20px;' viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'>
            <path fill='#F2F4F9' d='M240 224.813C240 233.063 233.25 239.813 225 239.813H15C6.75 239.813 0 233.063 0 224.813V134.813C0 126.563 4.77 115.043 10.61 109.203L109.39 10.423C115.22 4.593 124.77 4.593 130.6 10.423L229.39 109.213C235.22 115.043 240 126.573 240 134.823V224.823V224.813Z'/>
            <path fill='#18BCF2' d='M229.39 109.203L130.61 10.423C124.78 4.593 115.23 4.593 109.4 10.423L10.61 109.203C4.78 115.033 0 126.563 0 134.813V224.813C0 233.063 6.75 239.813 15 239.813H107.27L66.64 199.183C64.55 199.903 62.32 200.313 60 200.313C48.7 200.313 39.5 191.113 39.5 179.813C39.5 168.513 48.7 159.313 60 159.313C71.3 159.313 80.5 168.513 80.5 179.813C80.5 182.143 80.09 184.373 79.37 186.463L111 218.093V102.213C104.2 98.873 99.5 91.893 99.5 83.823C99.5 72.523 108.7 63.323 120 63.323C131.3 63.323 140.5 72.523 140.5 83.823C140.5 91.893 135.8 98.873 129 102.213V183.483L160.46 152.023C159.84 150.063 159.5 147.983 159.5 145.823C159.5 134.523 168.7 125.323 180 125.323C191.3 125.323 200.5 134.523 200.5 145.823C200.5 157.123 191.3 166.323 180 166.323C177.5 166.323 175.12 165.853 172.91 165.033L129 208.943V239.823H225C233.25 239.823 240 233.073 240 224.823V134.823C240 126.573 235.23 115.053 229.39 109.213V109.203Z'/>
        </svg>
        <div style='color: white; font-size: 24px; font-family: system-ui, sans-serif; margin-bottom: 30px;'>Home Assistant Desktop</div>
        <div style='width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #03a9f4; border-radius: 50%; animation: spin 1s linear infinite;'></div>
        <style>@keyframes spin {{ to {{ transform: rotate(360deg); }} }}</style>
    `;
    document.body.appendChild(splash);

    // Check connectivity before navigating
    const serverUrl = '{0}';
    const serverName = '{2}';
    const targetUrl = '{1}';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(serverUrl + '/api/', {{
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors'
    }})
    .then(() => {{
        clearTimeout(timeoutId);
        window.location.href = targetUrl;
    }})
    .catch(() => {{
        clearTimeout(timeoutId);
        window.__TAURI__.core.invoke('go_to_offline', {{
            serverUrl: serverUrl,
            serverName: serverName
        }});
    }});
}})();
