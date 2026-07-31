import {
  getSetting,
  saveSetting,
  getVidRecord,
  toggleFavoriteCard,
  getCardsMapping,
  getMediaForCard,
  clearAllCards,
  clearAllMedia,
  getAutoSyncSettingsParams,
  restoreFromConfigDb,
  getCardCount,
} from "./db.js";
import { performAutoSync } from "./sync.js";
import { retrieveSingleMediaFile } from "../api/anki.js";
import { blobToBase64 } from "../shared/utils.js";

export function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.action === "fetchMediaFile") {
          const ankiUrl = message.ankiUrl || "http://localhost:8765";
          const data = await retrieveSingleMediaFile(message.filename, ankiUrl);
          if (data.result) {
            sendResponse({ success: true, result: data.result });
          } else {
            sendResponse({ success: false, error: data.error });
          }
        } 
        else if (message.action === "getSetting") {
          const item = await getSetting(message.key);
          sendResponse({ value: item ? item.value : undefined });
        } 
        else if (message.action === "saveSetting") {
          await saveSetting(message.key, message.value);
          sendResponse({ success: true });
        } 
        else if (message.action === "getVidRecord") {
          const result = await getVidRecord(message.vid);
          sendResponse({ success: true, result: result });
        } 
        else if (message.action === "toggleFavoriteCard") {
          const { vid, cardId } = message;
          if (!vid || !cardId) throw new Error("Missing vid or cardId");
          const isFavorite = await toggleFavoriteCard(vid, cardId);
          sendResponse({ success: true, isFavorite });
        } 
        else if (message.action === "getCardsMapping") {
          const mapping = await getCardsMapping(message.cardIds);
          sendResponse({ success: true, result: mapping });
        } 
        else if (message.action === "getMediaForCard") {
          const mediaObject = await getMediaForCard(message.cardId);
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
        } 
        else if (message.action === "clearAllCards") {
          await clearAllCards();
          sendResponse({ success: true });
        } 
        else if (message.action === "clearAllMedia") {
          await clearAllMedia();
          sendResponse({ success: true });
        } 
        else if (message.action === "getCardCount") {
          const count = await getCardCount();
          sendResponse({ success: true, count });
        }
        else if (message.action === "performAutoSync") {
          const { deckName, ankiUrl, jpdbApiKey, japaneseField } = message.params;
          if (!deckName || !ankiUrl || !jpdbApiKey || !japaneseField) {
            sendResponse({
              success: false,
              error: "Missing required parameters for auto-sync",
            });
            return;
          }
          const result = await performAutoSync(message.params);
          sendResponse({ success: true, result });
        } 
        else if (message.action === "getAutoSyncSettings") {
          const result = await getAutoSyncSettingsParams();
          sendResponse({ success: true, result });
        } 
        else if (message.action === "restoreFromConfig") {
          if (!message.data) {
            sendResponse({ success: false, error: "No configuration data provided." });
            return;
          }
          await restoreFromConfigDb(message.data);
          sendResponse({ success: true });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep the message channel open for async response
  });
}
