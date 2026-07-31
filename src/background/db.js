import "../../public/dexie.js";

export const db = new globalThis.Dexie("JPDBMediaSupportDB");

db.version(2).stores({
  cards: "cardId", // Lightweight metadata table
  media: "cardId", // Heavy media blobs table
  vids: "vid",
  settings: "key",
});

export async function getSetting(key) {
  const item = await db.settings.get(key);
  return item;
}

export async function saveSetting(key, value) {
  return await db.settings.put({ key, value });
}

export async function getVidRecord(vid) {
  return await db.vids.get(vid);
}

export async function getCardsMapping(cardIds) {
  const cardsArray = await db.cards.bulkGet(cardIds);
  const mapping = {};
  for (const card of cardsArray) {
    if (card) {
      mapping[card.cardId] = card;
    }
  }
  return mapping;
}

export async function getMediaForCard(cardId) {
  return await db.media.get(cardId);
}

export async function clearAllCards() {
  await db.transaction("rw", db.cards, db.media, db.vids, async () => {
    await Promise.all([db.cards.clear(), db.media.clear(), db.vids.clear()]);
  });
}

export async function clearAllMedia() {
  await db.transaction("rw", db.cards, db.media, db.vids, async () => {
    await db.media.clear();
  });
}

export async function getCardCount() {
  return await db.cards.count();
}

export async function toggleFavoriteCard(vid, cardId) {
  let isFavorite = false;
  await db.transaction("rw", db.vids, async () => {
    const vidRecord = await db.vids.get(vid);
    if (vidRecord) {
      if (!vidRecord.favCards) {
        vidRecord.favCards = [];
      }
      const favIndex = vidRecord.favCards.indexOf(cardId);
      if (favIndex > -1) {
        vidRecord.favCards.splice(favIndex, 1);
      } else {
        vidRecord.favCards.unshift(cardId);
        isFavorite = true;
      }
      await db.vids.put(vidRecord);
    } else {
      throw new Error(`VID record ${vid} not found.`);
    }
  });
  return isFavorite;
}

export async function getAllCardsMap() {
  const allDbCards = await db.cards.toArray();
  return new Map(allDbCards.map((c) => [c.cardId, c]));
}

export async function getMediaKeys() {
  const mediaKeys = await db.media.toCollection().keys();
  return new Set(mediaKeys);
}

export async function getAllCardsArray() {
  return await db.cards.toArray();
}

export async function getVidsByAffectedVids(affectedVids) {
  return await db.vids.where("vid").anyOf(affectedVids).toArray();
}

export async function bulkPutSyncData(cardsToStore, mediaToStore, finalVidsArray) {
  await db.transaction("rw", db.cards, db.media, db.vids, async () => {
    if (cardsToStore.length > 0) await db.cards.bulkPut(cardsToStore);
    if (mediaToStore.length > 0) await db.media.bulkPut(mediaToStore);
    if (finalVidsArray.length > 0) await db.vids.bulkPut(finalVidsArray);
  });
}

export async function getAutoSyncSettingsParams() {
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

  return {
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
}

export async function restoreFromConfigDb(configData) {
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
        db.media.clear(),
        db.vids.clear(),
      ]);

      // 2. Bulk-load the new data from the config file
      await Promise.all([
        db.settings.bulkPut(configData.settings),
        db.cards.bulkPut(configData.cards),
        db.vids.bulkPut(configData.vids),
      ]);
    },
  );
}
