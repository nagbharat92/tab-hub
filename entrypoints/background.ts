export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("hub.html") });
  });
});
