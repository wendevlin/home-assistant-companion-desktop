// Auth page URL overlay
// Shows the current server URL on the Home Assistant login/authorize page
// with a button to go back to server selection

(function() {
    if (document.getElementById('ha-desktop-url-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ha-desktop-url-overlay';
    overlay.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    const urlText = document.createElement('span');
    urlText.textContent = window.location.origin;
    urlText.style.opacity = '0.9';

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Change Server';
    backBtn.style.cssText = `
        background: #03a9f4;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
    `;
    backBtn.onmouseover = function() { this.style.background = '#0288d1'; };
    backBtn.onmouseout = function() { this.style.background = '#03a9f4'; };
    backBtn.onclick = function() {
        window.__TAURI__.core.invoke('go_to_settings');
    };

    overlay.appendChild(urlText);
    overlay.appendChild(backBtn);
    document.body.appendChild(overlay);
})();
