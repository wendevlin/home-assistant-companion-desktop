import Electrobun, { BrowserWindow, Tray } from "electrobun/bun";

// Create the main application window
const mainWindow = new BrowserWindow({
  title: "Home Assistant Desktop",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 200,
    y: 200,
  },
});

// Create system tray
const tray = new Tray({
  title: "HA",
  // Note: You'll need to add a tray icon image later
  // For now, just use the title which works on macOS
  template: true,
  width: 22,
  height: 22,
});

// Set up tray menu
tray.setMenu([
  {
    type: "normal",
    label: "Show Home Assistant",
    action: "show-window",
  },
  {
    type: "separator",
  },
  {
    type: "normal",
    label: "Reset Settings",
    action: "reset-settings",
  },
  {
    type: "separator",
  },
  {
    type: "normal",
    label: "Quit",
    action: "quit-app",
  },
]);

// Handle tray menu clicks
tray.on("tray-clicked", (e) => {
  const action = e.data.action;

  switch (action) {
    case "show-window":
      mainWindow.show();
      mainWindow.focus();
      break;

    case "reset-settings":
      // Call the reset function in the webview
      mainWindow.webview.executeJavaScript("window.resetSettings?.()");
      mainWindow.show();
      mainWindow.focus();
      break;

    case "quit-app":
      Electrobun.quit();
      break;
  }
});

// Handle window close - minimize to tray instead of quitting
mainWindow.on("close", (e) => {
  e.preventDefault();
  mainWindow.hide();
});

console.log("Home Assistant Desktop app started!");
