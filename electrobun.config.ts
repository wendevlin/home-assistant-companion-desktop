export default {
  app: {
    name: "ha-desktop",
    identifier: "ha-desktop.electrobun.dev",
    version: "1.0.0",
  },
  build: {
    views: {
      mainview: {
        bunEntrypoint: "src/mainview/index.ts",
      },
    },
    copy: [
      { from: "src/mainview/index.html", to: "views/mainview/index.html" },
      { from: "src/mainview/index.css", to: "views/mainview/index.css" },
    ],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    windows: {
      bundleCEF: false,
    },
  },
};
