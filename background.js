// If you're not using a bundler, ensure Dexie is loaded.
importScripts("dexie.js");

// Initialize Dexie DB with the NEW, EFFICIENT SCHEMA
const db = new Dexie("JPDBMediaSupportDB");
db.version(1).stores({
  cards: "cardId", // Lightweight metadata table
  media: "cardId", // Heavy media blobs table
  vids: "vid",
  settings: "key",
});

// --- NEW: Helper function to convert a Blob to a Base64 string ---
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

// Listen for messages from content and popup scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use an IIFE to handle async logic and `sendResponse` correctly.
  (async () => {
    // Action: fetchMediaFile (no change)
    if (message.action === "fetchMediaFile") {
      const ankiUrl = message.ankiUrl || "http://localhost:8765";
      const filename = message.filename;
      try {
        const response = await fetch(ankiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "retrieveMediaFile",
            version: 6,
            params: { filename: filename },
          }),
        });
        const data = await response.json();
        if (data.result) {
          sendResponse({ success: true, result: data.result });
        } else {
          sendResponse({ success: false, error: data.error });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // Action: getSetting (no change)
    else if (message.action === "getSetting") {
      try {
        const item = await db.settings.get(message.key);
        sendResponse({ value: item ? item.value : undefined });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // Action: getVidRecord (no change)
    else if (message.action === "getVidRecord") {
      try {
        const result = await db.vids.get(message.vid);
        sendResponse({ success: true, result: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** NEW: Action to toggle a card's favorite status ***
    else if (message.action === "toggleFavoriteCard") {
      try {
        const { vid, cardId } = message;
        if (!vid || !cardId) {
          throw new Error("Missing vid or cardId");
        }

        await db.transaction("rw", db.vids, async () => {
          const vidRecord = await db.vids.get(vid);
          if (vidRecord) {
            // Initialize favCards if it doesn't exist
            if (!vidRecord.favCards) {
              vidRecord.favCards = [];
            }

            const favIndex = vidRecord.favCards.indexOf(cardId);
            if (favIndex > -1) {
              // It's a favorite, so unfavorite it (remove from array)
              vidRecord.favCards.splice(favIndex, 1);
            } else {
              // It's not a favorite, so favorite it (add to the beginning of the array)
              vidRecord.favCards.unshift(cardId);
            }
            await db.vids.put(vidRecord);
            sendResponse({ success: true, isFavorite: favIndex === -1 });
          } else {
            throw new Error(`VID record ${vid} not found.`);
          }
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** UPDATED: getCardsMapping now converts Blobs to Base64 before sending ***
    else if (message.action === "getCardsMapping") {
      try {
        const [cardsArray, mediaArray] = await Promise.all([
          db.cards.bulkGet(message.cardIds),
          db.media.bulkGet(message.cardIds),
        ]);

        const mapping = {};
        for (let i = 0; i < cardsArray.length; i++) {
          const card = cardsArray[i];
          if (!card) continue;

          const mediaObject = mediaArray[i];
          if (mediaObject && mediaObject.mediaData) {
            // Convert Blob to Base64 before sending
            const imageBlob = mediaObject.mediaData.image;
            const audioBlob = mediaObject.mediaData.audio;

            const [imageBase64, audioBase64] = await Promise.all([
              imageBlob ? blobToBase64(imageBlob) : null,
              audioBlob ? blobToBase64(audioBlob) : null,
            ]);

            card.mediaData = {
              image: imageBase64,
              audio: audioBase64,
            };
          }
          mapping[card.cardId] = card;
        }
        sendResponse({ success: true, result: mapping });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
  })(); // Immediately invoke the async function

  // Return true to indicate that sendResponse will be called asynchronously.
  return true;
});
