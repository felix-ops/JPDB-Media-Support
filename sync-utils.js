/* sync-utils.js - Common syncing utilities for JPDB Media Support */

// Utility functions for settings access
function getSetting(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getSetting", key: key },
      (response) => {
        resolve(
          response && response.value !== undefined
            ? response.value
            : defaultValue
        );
      }
    );
  });
}

function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "saveSetting", key: key, value: value },
      (response) => {
        resolve(response && response.success);
      }
    );
  });
}

// Utility functions for data extraction
function extractImageFilenameUsingDOMParser(imageHTML) {
  if (!imageHTML) return "";

  if (typeof document === "undefined") {
    // For background script context, use regex-based extraction
    const imgMatch = imageHTML.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return imgMatch ? imgMatch[1] : imageHTML;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(imageHTML, "text/html");
  const img = doc.querySelector("img");
  return img ? img.getAttribute("src") : imageHTML;
}

function extractAudioFilename(audioText) {
  if (!audioText) return "";
  if (audioText.startsWith("[sound:") && audioText.endsWith("]")) {
    return audioText.slice(7, -1);
  }
  return audioText;
}

function stripJapaneseHtml(html) {
  if (typeof document === "undefined") {
    // For background script context, use simple regex-based stripping
    return html.replace(/<[^>]*>/g, "");
  }
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.innerText;
}

function stripEnglishHtml(html) {
  if (typeof document === "undefined") {
    // For background script context, use simple regex-based stripping
    return html.replace(/<br\s*\/?>/g, " ").replace(/<[^>]*>/g, "");
  }
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html.replace(/<br\s*\/?>/g, " ");
  return tempDiv.innerText;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function base64ToBlob(base64, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
}

function getMimeType(filename) {
  if (!filename) return "application/octet-stream";
  if (filename.match(/\.(jpg|jpeg)$/i)) return "image/jpeg";
  if (filename.match(/\.png$/i)) return "image/png";
  if (filename.match(/\.gif$/i)) return "image/gif";
  if (filename.match(/\.mp3$/i)) return "audio/mpeg";
  if (filename.match(/\.ogg$/i)) return "audio/ogg";
  return "application/octet-stream";
}

// JPDB API functions
async function getVidsFromContext(contextTexts, apiKey) {
  // contextTexts is an array of Japanese texts (max length: 100)
  const jpdbUrl = "https://jpdb.io/api/v1/parse";

  try {
    const response = await fetch(jpdbUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: contextTexts, // send an array of texts (max 100 per request)
        token_fields: ["vocabulary_index"],
        position_length_encoding: "utf16",
        vocabulary_fields: ["vid"],
      }),
    });
    const data = await response.json();
    if (
      data.vocabulary &&
      Array.isArray(data.vocabulary) &&
      data.tokens &&
      Array.isArray(data.tokens)
    ) {
      // Create an array where each element corresponds to one text's vids.
      const vidsForCards = data.tokens.map((tokenList) => {
        // tokenList is an array of tokens for one text.
        // Each token is an array with one element: the index into data.vocabulary.
        return tokenList.map((token) => {
          const vocabIndex = token[0];
          return String(data.vocabulary[vocabIndex][0]);
        });
      });
      return { vidsForCards, tokens: data.tokens, vocabulary: data.vocabulary };
    }
  } catch (error) {
    console.error("Error in getVidsFromContext:", error);
  }
  return { vidsForCards: [] };
}

// Anki Connect functions
async function retrieveMediaFilesInBatch(filenames, ankiUrl) {
  if (!filenames || filenames.length === 0) {
    return {};
  }
  const actions = filenames.map((filename) => ({
    action: "retrieveMediaFile",
    params: { filename: filename },
  }));

  try {
    const response = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "multi",
        version: 6,
        params: { actions: actions },
      }),
    });
    const data = await response.json();
    if (data.error) {
      console.error("AnkiConnect multi error:", data.error);
      return {};
    }

    const mediaDataMap = {};
    // The result is an array of base64 strings, matching the order of filenames sent.
    data.result.forEach((result, index) => {
      mediaDataMap[filenames[index]] = result;
    });
    return mediaDataMap;
  } catch (error) {
    console.error("Failed to batch fetch media files:", error);
    return {};
  }
}

// Main sync function that can be used from popup or background
async function performSync(options = {}) {
  const {
    japaneseField,
    englishField,
    imageField,
    audioField,
    deckName,
    ankiUrl,
    jpdbApiKey,
    onProgress = () => {},
    onStatusUpdate = () => {},
    shouldFetchMedia = false,
    ankiCards = [],
  } = options;

  // Validation
  if (!japaneseField) {
    throw new Error("Japanese field is required");
  }
  if (!jpdbApiKey) {
    throw new Error("JPDB API key is required");
  }
  if (!ankiUrl) {
    throw new Error("Anki URL is required");
  }
  if (!deckName) {
    throw new Error("Deck name is required");
  }

  const deckNameParts = deckName.split("::");
  const formattedDeckName = deckNameParts[deckNameParts.length - 1];

  onStatusUpdate("Scanning for updates...");
  onProgress(0);

  // Get database access
  const db = new Dexie("JPDBMediaSupportDB");
  db.version(2).stores({
    cards: "cardId",
    media: "cardId",
    vids: "vid",
    settings: "key",
  });

  // ====================================================================
  // UNIFIED SCANNING PHASE
  // ====================================================================

  const [allDbCards, mediaKeys] = await Promise.all([
    db.cards.toArray(),
    db.media.toCollection().keys(),
  ]);

  const allDbCardsMap = new Map(allDbCards.map((c) => [c.cardId, c]));
  const mediaIdSet = new Set(mediaKeys);
  const ankiCardIds = new Set(ankiCards.map((c) => c.cardId));

  const deckCardsToProcess = [];
  const globalCardsToFix = [];

  // --- Check current deck for text/file changes or missing media data ---
  for (const ankiCard of ankiCards) {
    const storedCard = allDbCardsMap.get(ankiCard.cardId);
    const newJapaneseText = stripJapaneseHtml(
      ankiCard.fields[japaneseField].value.trim()
    );
    const newEnglishText = englishField
      ? ankiCard.fields[englishField].value.trim()
      : "";
    const newImageFile = imageField
      ? extractImageFilenameUsingDOMParser(
          ankiCard.fields[imageField].value.trim()
        )
      : "";
    const newAudioFile = audioField
      ? extractAudioFilename(ankiCard.fields[audioField].value.trim())
      : "";

    // A card needs its media data if the toggle is on, it has media, and it's not in the DB
    const needsMediaData =
      shouldFetchMedia &&
      (newImageFile || newAudioFile) &&
      !mediaIdSet.has(ankiCard.cardId);

    if (
      !storedCard ||
      storedCard.japaneseContext !== newJapaneseText ||
      storedCard.englishContext !== newEnglishText ||
      storedCard.image !== newImageFile ||
      storedCard.audio !== newAudioFile ||
      needsMediaData
    ) {
      deckCardsToProcess.push({
        ankiCard,
        newJapaneseText,
        newEnglishText,
        newImageFile,
        newAudioFile,
      });
    }
  }

  // --- Check the rest of the DB *only* for missing media data ---
  // This only runs if the user wants to fetch media
  if (shouldFetchMedia) {
    for (const storedCard of allDbCards) {
      if (ankiCardIds.has(storedCard.cardId)) continue;
      const needsMedia =
        (storedCard.image || storedCard.audio) &&
        !mediaIdSet.has(storedCard.cardId);
      if (needsMedia) {
        globalCardsToFix.push(storedCard);
      }
    }
  }

  if (deckCardsToProcess.length === 0 && globalCardsToFix.length === 0) {
    onStatusUpdate("Everything is already up-to-date!");
    return {
      success: true,
      message: "Everything is already up-to-date!",
      cardsProcessed: 0,
    };
  }

  // ====================================================================
  // CONSOLIDATED PROCESSING PHASE
  // ====================================================================
  const totalCards = deckCardsToProcess.length + globalCardsToFix.length;
  onStatusUpdate(`Updating ${totalCards} cards...`);

  const textsToParse = deckCardsToProcess.map((c) => c.newJapaneseText);
  const filenamesToFetch = new Set();

  // Only populate the list of files to fetch if the toggle is enabled
  if (shouldFetchMedia) {
    deckCardsToProcess.forEach((c) => {
      if (c.newImageFile) filenamesToFetch.add(c.newImageFile);
      if (c.newAudioFile) filenamesToFetch.add(c.newAudioFile);
    });
    globalCardsToFix.forEach((c) => {
      if (c.image) filenamesToFetch.add(c.image);
      if (c.audio) filenamesToFetch.add(c.audio);
    });
  }

  let vidsForDeckCards = [];
  if (textsToParse.length > 0) {
    const textChunks = chunkArray(textsToParse, 100);
    for (let i = 0; i < textChunks.length; i++) {
      const jpdbData = await getVidsFromContext(textChunks[i], jpdbApiKey);
      vidsForDeckCards.push(...(jpdbData?.vidsForCards || []));

      const progress = Math.round(
        ((i + 1) / textChunks.length) * (shouldFetchMedia ? 40 : 100)
      );
      onProgress(progress);
    }
  } else {
    onProgress(shouldFetchMedia ? 40 : 100);
  }

  let allFetchedMedia = {};
  if (filenamesToFetch.size > 0) {
    const filenameChunks = chunkArray(Array.from(filenamesToFetch), 500);
    for (let i = 0; i < filenameChunks.length; i++) {
      allFetchedMedia = {
        ...allFetchedMedia,
        ...(await retrieveMediaFilesInBatch(filenameChunks[i], ankiUrl)),
      };
      const progress = 40 + Math.round(((i + 1) / filenameChunks.length) * 60);
      onProgress(progress);
    }
  }

  const cardsToStore = [];
  const mediaToStore = [];
  const vidsToUpdate = {};

  for (let i = 0; i < deckCardsToProcess.length; i++) {
    const c = deckCardsToProcess[i];
    cardsToStore.push({
      cardId: c.ankiCard.cardId,
      deckName: formattedDeckName,
      japaneseContext: c.newJapaneseText,
      englishContext: c.newEnglishText,
      image: c.newImageFile,
      audio: c.newAudioFile,
      vids: vidsForDeckCards[i] || [],
    });
    if (c.newImageFile || c.newAudioFile) {
      const imageBase64 = allFetchedMedia[c.newImageFile] || null;
      const audioBase64 = allFetchedMedia[c.newAudioFile] || null;

      if (imageBase64 || audioBase64) {
        mediaToStore.push({
          cardId: c.ankiCard.cardId,
          mediaData: {
            image: imageBase64
              ? base64ToBlob(imageBase64, getMimeType(c.newImageFile))
              : null,
            audio: audioBase64
              ? base64ToBlob(audioBase64, getMimeType(c.newAudioFile))
              : null,
          },
        });
      }
    }
    for (const vid of vidsForDeckCards[i] || []) {
      if (!vidsToUpdate[vid]) vidsToUpdate[vid] = new Set();
      vidsToUpdate[vid].add(c.ankiCard.cardId);
    }
  }

  // `globalCardsToFix` will only have items if `shouldFetchMedia` is true
  for (const card of globalCardsToFix) {
    const imageBase64 = allFetchedMedia[card.image] || null;
    const audioBase64 = allFetchedMedia[card.audio] || null;
    if (imageBase64 || audioBase64) {
      mediaToStore.push({
        cardId: card.cardId,
        mediaData: {
          image: imageBase64
            ? base64ToBlob(imageBase64, getMimeType(card.image))
            : null,
          audio: audioBase64
            ? base64ToBlob(audioBase64, getMimeType(card.audio))
            : null,
        },
      });
    }
  }

  const allAffectedVids = Object.keys(vidsToUpdate);
  const existingVids = await db.vids
    .where("vid")
    .anyOf(allAffectedVids)
    .toArray();
  const finalVidsMap = new Map();
  existingVids.forEach((dbVid) => {
    finalVidsMap.set(dbVid.vid, new Set(dbVid.cards));
  });
  // Preserve existing favorites per vid so bulkPut doesn't drop them
  const favCardsByVid = new Map();
  existingVids.forEach((dbVid) => {
    favCardsByVid.set(dbVid.vid, dbVid.favCards || []);
  });
  for (const vid in vidsToUpdate) {
    if (!finalVidsMap.has(vid)) {
      finalVidsMap.set(vid, new Set());
    }
    const cardSet = finalVidsMap.get(vid);
    vidsToUpdate[vid].forEach((cardId) => cardSet.add(cardId));
  }

  const finalVidsArray = Array.from(finalVidsMap.entries()).map(
    ([vid, cardIdSet]) => ({
      vid,
      cards: Array.from(cardIdSet),
      // Preserve existing favorites; initialize empty array for brand-new vids
      favCards: favCardsByVid.get(vid) || [],
    })
  );

  await db.transaction("rw", db.cards, db.media, db.vids, async () => {
    if (cardsToStore.length > 0) await db.cards.bulkPut(cardsToStore);
    if (mediaToStore.length > 0) await db.media.bulkPut(mediaToStore);
    if (finalVidsArray.length > 0) await db.vids.bulkPut(finalVidsArray);
  });

  onProgress(100);
  const finalMessage = `Sync complete: ${totalCards} cards were added.`;
  onStatusUpdate(finalMessage);

  return {
    success: true,
    message: finalMessage,
    cardsProcessed: totalCards,
    cardsAdded: cardsToStore.length,
    mediaAdded: mediaToStore.length,
  };
}

// Function to get Anki cards for auto-sync
async function fetchAnkiCards(deckName, ankiUrl) {
  try {
    // Get card IDs from Anki Connect
    const findCardsResponse = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "findCards",
        version: 6,
        params: { query: `deck:"${deckName}"` },
      }),
    });
    const findCardsData = await findCardsResponse.json();
    if (!findCardsData.result || findCardsData.result.length === 0) {
      return [];
    }

    // Get card details for the retrieved card IDs
    const cardIds = findCardsData.result;
    const cardsInfoResponse = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cardsInfo",
        version: 6,
        params: { cards: cardIds },
      }),
    });
    const cardsInfoData = await cardsInfoResponse.json();
    if (!cardsInfoData.result || cardsInfoData.result.length === 0) {
      return [];
    }

    return cardsInfoData.result;
  } catch (error) {
    console.error("Error fetching Anki cards:", error);
    return [];
  }
}
