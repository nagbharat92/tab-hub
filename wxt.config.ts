import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDirTemplate: "round-2-{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
    },
  }),
  manifest: {
    name: "Tab Hub",
    description: "A local visual home for saved tab groups and the fragments that matter.",
    version: "0.4.0",
    commands: {
      "save-current-group": { description: "Save the active browser group", suggested_key: { default: "Alt+Shift+1" } },
      "save-current-tab": { description: "Save the active tab", suggested_key: { default: "Alt+Shift+2" } },
      "open-hub": { description: "Open Tab Hub", suggested_key: { default: "Alt+Shift+3" } },
      "mark-selected-text": { description: "Save selected passage", suggested_key: { default: "Alt+Shift+4" } }
    },
    permissions: [
      "activeTab",
      "clipboardWrite",
      "contextMenus",
      "favicon",
      "scripting",
      "storage",
      "tabs",
      "tabGroups",
      "unlimitedStorage"
    ],
    host_permissions: ["<all_urls>"]
  }
});
