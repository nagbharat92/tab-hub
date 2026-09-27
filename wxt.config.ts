import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
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
    version: "0.2.1",
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
