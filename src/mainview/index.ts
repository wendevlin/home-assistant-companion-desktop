console.log("Home Assistant Desktop view loaded!");

// Extend Window interface for custom properties
interface WindowWithResetSettings extends Window {
  resetSettings?: () => void;
}

// Storage key for the HA server URL
const STORAGE_KEY = "ha_server_url";

// Get DOM elements
const settingsPage = document.getElementById("settings-page");
const webviewPage = document.getElementById("webview-page");
const settingsForm = document.getElementById("settings-form") as HTMLFormElement;
const serverUrlInput = document.getElementById("server-url") as HTMLInputElement;
const haWebview = document.getElementById("ha-webview") as HTMLElement;

// Check if we already have a saved server URL
const savedUrl = localStorage.getItem(STORAGE_KEY);

if (savedUrl) {
  // If we have a saved URL, go directly to the webview
  loadHomeAssistant(savedUrl);
} else {
  // Show the settings page
  showSettingsPage();
}

// Handle form submission
settingsForm?.addEventListener("submit", (e) => {
  e.preventDefault();

  const serverUrl = serverUrlInput.value.trim();

  if (serverUrl) {
    // Save the URL to localStorage
    localStorage.setItem(STORAGE_KEY, serverUrl);

    // Load Home Assistant
    loadHomeAssistant(serverUrl);
  }
});

function showSettingsPage() {
  if (settingsPage && webviewPage) {
    settingsPage.classList.remove("hidden");
    webviewPage.classList.add("hidden");
  }
}

function loadHomeAssistant(url: string) {
  if (settingsPage && webviewPage && haWebview) {
    // Hide settings, show webview
    settingsPage.classList.add("hidden");
    webviewPage.classList.remove("hidden");

    // Set the webview source
    haWebview.setAttribute("src", url);

    console.log(`Loading Home Assistant from: ${url}`);
  }
}

// Expose a function to reset settings (for future use from tray menu)
(window as WindowWithResetSettings).resetSettings = () => {
  localStorage.removeItem(STORAGE_KEY);
  if (serverUrlInput) {
    serverUrlInput.value = "";
  }
  showSettingsPage();
};
