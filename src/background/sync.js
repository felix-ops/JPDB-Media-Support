import {
  stripJapaneseHtml,
  stripEnglishHtml,
  extractImageFilenameUsingDOMParser,
  extractAudioFilename,
  normalizeForComparison,
  chunkArray,
  base64ToBlob,
  getMimeType,
} from "../shared/utils.js";
import { getVidsFromContext } from "../api/jpdb.js";
import { retrieveMediaFilesInBatch, fetchAnkiCards } from "../api/anki.js";
import {
  getAllCardsMap,
  getMediaKeys,
  getAllCardsArray,
  getVidsByAffectedVids,
  bulkPutSyncData,
} from "./db.js";

export async function performSync(options = {}) {
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

  if (!japaneseField) throw new Error("Japanese field is required");
  if (!jpdbApiKey) throw new Error("JPDB API key is required");
  if (!ankiUrl) throw new Error("Anki URL is required");
  if (!deckName) throw new Error("Deck name is required");

  const deckNameParts = deckName.split("::");
  const formattedDeckName = deckNameParts[deckNameParts.length - 1];

  onStatusUpdate("Scanning for updates...");
  onProgress(0);

  const [allDbCardsMap, mediaIdSet, allDbCards] = await Promise.all([
    getAllCardsMap(),
    getMediaKeys(),
    getAllCardsArray(),
  ]);

  const ankiCardIds = new Set(ankiCards.map((c) => c.cardId));

  const deckCardsToProcess = [];
  const globalCardsToFix = [];

  for (const ankiCard of ankiCards) {
    const storedCard = allDbCardsMap.get(ankiCard.cardId);
    const newJapaneseText = stripJapaneseHtml(
      ankiCard.fields[japaneseField].value.trim(),
    );
    const newEnglishText = englishField
      ? ankiCard.fields[englishField].value.trim()
      : "";
    const newImageFile = imageField
      ? extractImageFilenameUsingDOMParser(
          ankiCard.fields[imageField].value.trim(),
        )
      : "";
    const newAudioFile = audioField
      ? extractAudioFilename(ankiCard.fields[audioField].value.trim())
      : "";

    const needsMediaData =
      shouldFetchMedia &&
      (newImageFile || newAudioFile) &&
      !mediaIdSet.has(ankiCard.cardId);

    if (
      !storedCard ||
      normalizeForComparison(storedCard.japaneseContext) !==
        normalizeForComparison(newJapaneseText) ||
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

  const totalCards = deckCardsToProcess.length + globalCardsToFix.length;
  onStatusUpdate(`Updating ${totalCards} cards...`);

  const textsToParse = deckCardsToProcess.map((c) => c.newJapaneseText);
  const filenamesToFetch = new Set();

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
        ((i + 1) / textChunks.length) * (shouldFetchMedia ? 40 : 100),
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
  const existingVids = await getVidsByAffectedVids(allAffectedVids);
  
  const finalVidsMap = new Map();
  existingVids.forEach((dbVid) => {
    finalVidsMap.set(dbVid.vid, new Set(dbVid.cards));
  });
  
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
      favCards: favCardsByVid.get(vid) || [],
    }),
  );

  await bulkPutSyncData(cardsToStore, mediaToStore, finalVidsArray);

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

export async function performAutoSync(params) {
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
    const ankiCards = await fetchAnkiCards(deckName, ankiUrl);
    if (ankiCards.length === 0) {
      return { success: false, error: "No cards found in the selected deck" };
    }

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
      onProgress: () => {},
      onStatusUpdate: () => {},
    });

    return { success: true, result };
  } catch (error) {
    console.error("Auto-sync error:", error);
    return { success: false, error: error.message };
  }
}
