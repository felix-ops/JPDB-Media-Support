// If you're not using a bundler, ensure Dexie is loaded.
// For example, in Manifest V3, you can import Dexie using importScripts.
importScripts("dexie.js");

// Initialize Dexie DB
const db = new Dexie("JPDBMediaSupportDB");
db.version(1).stores({
  settings: "key",
  cards: "cardId",
  vids: "vid"
});

// Listen for messages from content and popup scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Action: fetchMediaFile (existing functionality)
  if (message.action === "fetchMediaFile") {
    const ankiUrl = message.ankiUrl || "http://localhost:8765";
    const filename = message.filename;
    // Fetch from Anki Connect (background pages are exempt from CORS restrictions)
    fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retrieveMediaFile",
        version: 6,
        params: { filename: filename }
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.result) {
          sendResponse({ success: true, result: data.result });
        } else {
          sendResponse({ success: false, error: data.error });
        }
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates async response.
  }
  
  // New Action: getSetting
  else if (message.action === "getSetting") {
    db.settings.get(message.key)
      .then(item => {
        sendResponse({ value: item ? item.value : undefined });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // New Action: getVidRecord
  else if (message.action === "getVidRecord") {
    db.vids.get(message.vid)
      .then(result => {
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // New Action: getCardsMapping
  else if (message.action === "getCardsMapping") {
    db.cards.where("cardId").anyOf(message.cardIds).toArray()
      .then(cardsArray => {
        const mapping = {};
        cardsArray.forEach(card => {
          mapping[card.cardId] = card;
        });
        sendResponse({ success: true, result: mapping });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
