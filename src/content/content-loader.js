(async () => {
  try {
    const src = chrome.runtime.getURL("src/content/index.js");
    const contentMain = await import(src);
    if (contentMain.initIfEnabled) {
      contentMain.initIfEnabled();
    }
  } catch (error) {
    console.error("Failed to load JPDB Media Importer content script", error);
  }
})();
