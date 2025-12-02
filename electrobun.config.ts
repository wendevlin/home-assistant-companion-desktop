export default {
  app: {
    name: "ha-desktop",
    identifier: "ha-desktop.electrobun.dev",
    version: "1.0.0",
  },
  build: {
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
        external: [],
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
    },
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
};
