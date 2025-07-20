// If you're not using a bundler, ensure Dexie is loaded.
importScripts("dexie.js");

// Initialize Dexie DB with the NEW, EFFICIENT SCHEMA
const db = new Dexie("JPDBMediaSupportDB");
db.version(1).stores({
  cards: "cardId, deckName", // Lightweight metadata table
  media: "cardId", // Heavy media blobs table
  vids: "vid",
  settings: "key",
});

// Listen for messages from content and popup scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Action: fetchMediaFile (no change)
  if (message.action === "fetchMediaFile") {
    const ankiUrl = message.ankiUrl || "http://localhost:8765";
    const filename = message.filename;
    fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retrieveMediaFile",
        version: 6,
        params: { filename: filename },
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.result) {
          sendResponse({ success: true, result: data.result });
        } else {
          sendResponse({ success: false, error: data.error });
        }
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Action: getSetting (no change)
  else if (message.action === "getSetting") {
    db.settings
      .get(message.key)
      .then((item) => {
        sendResponse({ value: item ? item.value : undefined });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Action: getVidRecord (no change)
  else if (message.action === "getVidRecord") {
    db.vids
      .get(message.vid)
      .then((result) => {
        sendResponse({ success: true, result: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // *** UPDATED: getCardsMapping now reads from TWO tables and joins them ***
  else if (message.action === "getCardsMapping") {
    // Fetch from both tables in parallel for maximum speed
    Promise.all([
      db.cards.bulkGet(message.cardIds),
      db.media.bulkGet(message.cardIds),
    ])
      .then(([cardsArray, mediaArray]) => {
        const mapping = {};
        cardsArray.forEach((card, index) => {
          if (card) {
            // Re-attach the mediaData object so content.js doesn't need to change.
            const mediaObject = mediaArray[index];
            if (mediaObject) {
              card.mediaData = mediaObject.mediaData;
            }
            mapping[card.cardId] = card;
          }
        });
        sendResponse({ success: true, result: mapping });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
