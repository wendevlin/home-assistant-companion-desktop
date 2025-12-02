import { BrowserWindow } from "electrobun/bun";

// Create the main application window
const _mainWindow = new BrowserWindow({
  title: "Home Assistant Desktop",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 200,
    y: 200,
  },
});

console.log("Home Assistant Desktop app started!");
