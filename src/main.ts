// Import WebAwesome styles - this will be processed by Vite and resolve all @imports
import "@home-assistant/webawesome/dist/styles/webawesome.css";

// Apply theme based on OS preference
function applyTheme() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("wa-dark", prefersDark);
  document.documentElement.classList.toggle("wa-light", !prefersDark);
}

// Apply initial theme
applyTheme();

// Listen for OS theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// Import main app component
import "./components/ha-app.js";
