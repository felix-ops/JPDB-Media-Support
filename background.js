// If you're not using a bundler, ensure Dexie and sync-utils are loaded.
importScripts("dexie.js", "sync-utils.js");

// Initialize Dexie DB with the NEW, EFFICIENT SCHEMA
const db = new Dexie("JPDBMediaSupportDB");
db.version(2).stores({
  cards: "cardId", // Lightweight metadata table
  media: "cardId", // Heavy media blobs table
  vids: "vid",
  settings: "key",
});

//  Helper function to convert a Blob to a Base64 string ---
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

// Auto-sync function for background script
async function performAutoSync(params) {
  const {
    deckName,
    ankiUrl,
    jpdbApiKey,
    japaneseField,
    englishField,
    imageField,
    audioField,
    shouldFetchMedia,
  } = params;

  try {
    // Fetch Anki cards
    const ankiCards = await fetchAnkiCards(deckName, ankiUrl);
    if (ankiCards.length === 0) {
      return { success: false, error: "No cards found in the selected deck" };
    }

    // Perform sync using the common sync function
    const result = await performSync({
      japaneseField,
      englishField,
      imageField,
      audioField,
      deckName,
      ankiUrl,
      jpdbApiKey,
      shouldFetchMedia,
      ankiCards,
      onProgress: () => {}, // No progress updates needed for background sync
      onStatusUpdate: () => {}, // No status updates needed for background sync
    });

    return { success: true, result };
  } catch (error) {
    console.error("Auto-sync error:", error);
    return { success: false, error: error.message };
  }
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

    // Action: saveSetting (for sync-utils.js compatibility)
    else if (message.action === "saveSetting") {
      try {
        await db.settings.put({ key: message.key, value: message.value });
        sendResponse({ success: true });
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

    // *** UPDATED: getCardsMapping now ONLY sends lightweight card metadata ***
    else if (message.action === "getCardsMapping") {
      try {
        const cardsArray = await db.cards.bulkGet(message.cardIds);
        const mapping = {};
        for (const card of cardsArray) {
          if (card) {
            mapping[card.cardId] = card;
          }
        }
        sendResponse({ success: true, result: mapping });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** NEW: Action to get media data for a SINGLE card ***
    else if (message.action === "getMediaForCard") {
      try {
        const cardId = message.cardId;
        const mediaObject = await db.media.get(cardId);
        let responseData = { image: null, audio: null };

        if (mediaObject && mediaObject.mediaData) {
          const imageBlob = mediaObject.mediaData.image;
          const audioBlob = mediaObject.mediaData.audio;

          const [imageBase64, audioBase64] = await Promise.all([
            imageBlob ? blobToBase64(imageBlob) : null,
            audioBlob ? blobToBase64(audioBlob) : null,
          ]);
          responseData = { image: imageBase64, audio: audioBase64 };
        }
        sendResponse({ success: true, mediaData: responseData });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** clears all Card Data
    else if (message.action === "clearAllCards") {
      try {
        // Perform all clear operations within a single transaction
        await db.transaction("rw", db.cards, db.media, db.vids, async () => {
          await Promise.all([
            db.cards.clear(),
            db.media.clear(),
            db.vids.clear(),
          ]);
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** clears all Media Blobs
    else if (message.action === "clearAllMedia") {
      try {
        // Perform all clear operations within a single transaction
        await db.transaction("rw", db.cards, db.media, db.vids, async () => {
          await db.media.clear();
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** NEW: Action to perform auto-sync ***
    else if (message.action === "performAutoSync") {
      try {
        const {
          deckName,
          ankiUrl,
          jpdbApiKey,
          japaneseField,
          englishField,
          imageField,
          audioField,
          shouldFetchMedia,
        } = message.params;

        if (!deckName || !ankiUrl || !jpdbApiKey || !japaneseField) {
          sendResponse({
            success: false,
            error: "Missing required parameters for auto-sync",
          });
          return;
        }

        // Import the sync utilities (they should be available in the background context)
        const result = await performAutoSync({
          deckName,
          ankiUrl,
          jpdbApiKey,
          japaneseField,
          englishField,
          imageField,
          audioField,
          shouldFetchMedia,
        });

        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** NEW: Action to get all settings needed for auto-sync ***
    else if (message.action === "getAutoSyncSettings") {
      try {
        const settings = await Promise.all([
          db.settings.get("selectedDeck"),
          db.settings.get("ankiUrl"),
          db.settings.get("jpdbApiKey"),
          db.settings.get("selectedJapaneseField"),
          db.settings.get("selectedEnglishField"),
          db.settings.get("selectedImageField"),
          db.settings.get("selectedAudioField"),
          db.settings.get("fetchMediaToBrowser"),
          db.settings.get("autoSync"),
        ]);

        const [
          selectedDeck,
          ankiUrl,
          jpdbApiKey,
          japaneseField,
          englishField,
          imageField,
          audioField,
          fetchMediaToBrowser,
          autoSync,
        ] = settings;

        const result = {
          deckName: selectedDeck?.value || "",
          ankiUrl: ankiUrl?.value || "http://localhost:8765",
          jpdbApiKey: jpdbApiKey?.value || "",
          japaneseField: japaneseField?.value || "",
          englishField: englishField?.value || "",
          imageField: imageField?.value || "",
          audioField: audioField?.value || "",
          shouldFetchMedia: fetchMediaToBrowser?.value || false,
          autoSyncEnabled: autoSync?.value || false,
        };

        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }

    // *** Restores from Config file
    else if (message.action === "restoreFromConfig") {
      const configData = message.data;
      if (!configData) {
        sendResponse({
          success: false,
          error: "No configuration data provided.",
        });
        return;
      }

      try {
        // Perform the ENTIRE operation in one transaction for atomicity
        await db.transaction(
          "rw",
          db.settings,
          db.cards,
          db.media,
          db.vids,
          async () => {
            // 1. Clear all existing data first
            await Promise.all([
              db.settings.clear(),
              db.cards.clear(),
              db.media.clear(), // Also clear media, as the config doesn't contain it
              db.vids.clear(),
            ]);

            // 2. Bulk-load the new data from the config file
            await Promise.all([
              db.settings.bulkPut(configData.settings),
              db.cards.bulkPut(configData.cards),
              db.vids.bulkPut(configData.vids),
            ]);
          }
        );
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
  })(); // Immediately invoke the async function

  // Return true to indicate that sendResponse will be called asynchronously.
  return true;
});
