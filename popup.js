/* popup.js using Dexie.js for IndexedDB */

const db = new Dexie("JPDBMediaSupportDB");
// Use the NEW, EFFICIENT SCHEMA. This must match background.js
db.version(1).stores({
  cards: "cardId", // Lightweight metadata table
  media: "cardId", // Heavy media blobs table
  vids: "vid",
  settings: "key",
});

// --- Helper functions for settings ---
function getSetting(key, defaultValue) {
  return db.settings
    .get(key)
    .then((item) => (item ? item.value : defaultValue));
}

function saveSetting(key, value) {
  return db.settings.put({ key, value });
}

function loadExtensionEnabled() {
  getSetting("extensionEnabled", true).then((value) => {
    document.getElementById("extensionEnabled").checked = value;
  });
}

function loadHideNativeSentence() {
  getSetting("hideNativeSentence", true).then((value) => {
    document.getElementById("hideNativeSentence").checked = value;
  });
}

function loadSettings() {
  Promise.all([
    getSetting("jpdbApiKey", ""),
    getSetting("selectedJapaneseField", ""),
    getSetting("selectedEnglishField", ""),
    getSetting("selectedImageField", ""),
    getSetting("selectedAudioField", ""),
    getSetting("autoPlayAudio", false),
    getSetting("mediaBlockSize", "650"),
    // getSetting("autoSync", false) // Load autoSync setting
  ]).then(
    ([
      jpdbApiKey,
      selectedJapaneseField,
      selectedEnglishField,
      selectedImageField,
      selectedAudioField,
      autoPlayAudio,
      mediaBlockSize,
      // autoSync
    ]) => {
      if (jpdbApiKey) {
        document.getElementById("jpdbApiKey").value = jpdbApiKey;
      }
      if (selectedJapaneseField) {
        document.getElementById("japaneseFieldSelect").value =
          selectedJapaneseField;
      }
      if (selectedEnglishField) {
        document.getElementById("englishFieldSelect").value =
          selectedEnglishField;
      }
      if (selectedImageField) {
        document.getElementById("imageFieldSelect").value = selectedImageField;
      }
      if (selectedAudioField) {
        document.getElementById("audioFieldSelect").value = selectedAudioField;
      }
      document.getElementById("autoPlayAudio").checked = autoPlayAudio;

      // Load slider value for media block size.
      document.getElementById("mediaBlockSize").value = mediaBlockSize;
      document.getElementById("mediaBlockSizeValue").innerText =
        mediaBlockSize + "px";

      // Load autoSync setting and update the switch.
      // document.getElementById("autoSync").checked = autoSync;
      getSetting("showEnglishSentence", true).then((value) => {
        document.getElementById("showEnglishSentence").checked = !value;
      });
      loadExtensionEnabled();
      loadHideNativeSentence();
    }
  );
}

// ------------------------------
// Deck and Card functions (unchanged API calls)
// ------------------------------

async function fetchDecks() {
  const ankiUrl = document.getElementById("url").value.trim();
  const deckSelect = document.getElementById("deckSelect");
  deckSelect.innerHTML = '<option value="">-- Loading decks --</option>';

  try {
    const response = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deckNames",
        version: 6,
      }),
    });
    const data = await response.json();
    deckSelect.innerHTML = "";
    if (data.result && Array.isArray(data.result)) {
      data.result.forEach((deckName) => {
        const option = document.createElement("option");
        option.value = deckName;
        option.text = deckName;
        deckSelect.appendChild(option);
      });
      if (data.result.length === 0) {
        deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
      }
      // Retrieve stored deck value and select it if it exists.
      getSetting("selectedDeck", "").then((storedDeck) => {
        if (storedDeck) {
          deckSelect.value = storedDeck;
          deckSelect.dispatchEvent(new Event("change"));
        }
      });
    } else {
      deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
    }
  } catch (error) {
    deckSelect.innerHTML =
      '<option value="">-- Error loading decks --</option>';
  }
}

async function loadCardsAndFields() {
  const ankiUrl = document.getElementById("url").value.trim();
  const deckSelect = document.getElementById("deckSelect");
  const deckName = deckSelect.value;
  const resultDiv = document.getElementById("result");
  const totalCardCountElem = document.getElementById("totalCardCount");

  saveSetting("selectedDeck", deckName);

  resultDiv.innerHTML = "";
  window.fetchedCards = []; // global variable to store fetched cards

  if (!ankiUrl || !deckName) {
    alert("Please provide a valid Anki Connect URL and select a deck.");
    return;
  }

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
      alert("No cards found in the selected deck.");
      return;
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
      alert("Failed to retrieve card information.");
      return;
    }

    window.fetchedCards = cardsInfoData.result;

    // Always show the total cards count below the sync button
    updateCardCount();

    // Use fields from the first card to populate dropdowns.
    const firstCard = window.fetchedCards[0];
    const fieldNames = Object.keys(firstCard.fields);

    // Populate dropdowns for Japanese and English fields.
    populateFieldDropdown("japaneseFieldSelect", fieldNames);
    getSetting("selectedJapaneseField", "").then((val) => {
      if (val) document.getElementById("japaneseFieldSelect").value = val;
    });
    populateFieldDropdown("englishFieldSelect", fieldNames);
    getSetting("selectedEnglishField", "").then((val) => {
      if (val) document.getElementById("englishFieldSelect").value = val;
    });

    // Populate dropdowns for image and audio fields.
    populateFieldDropdown("imageFieldSelect", fieldNames);
    getSetting("selectedImageField", "").then((val) => {
      if (val) document.getElementById("imageFieldSelect").value = val;
    });
    populateFieldDropdown("audioFieldSelect", fieldNames);
    getSetting("selectedAudioField", "").then((val) => {
      if (val) document.getElementById("audioFieldSelect").value = val;
    });
  } catch (error) {}
}

function populateFieldDropdown(selectId, fieldNames) {
  const selectElem = document.getElementById(selectId);
  selectElem.innerHTML = '<option value="">-- Select a field --</option>';
  fieldNames.forEach((fieldName) => {
    const option = document.createElement("option");
    option.value = fieldName;
    option.text = fieldName;
    selectElem.appendChild(option);
  });
}

function extractImageFilename(imageHTML) {
  if (!imageHTML) return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = imageHTML;
  const img = tempDiv.querySelector("img");
  let filename = img ? img.getAttribute("src") : imageHTML;
  try {
    // Decode any existing percent encoding and then re-encode properly.
    filename = encodeURI(decodeURIComponent(filename));
  } catch (e) {
    // Fallback in case the filename isn't properly percent encoded.
    filename = encodeURI(filename);
  }
  return filename;
}

function extractImageFilenameUsingDOMParser(imageHTML) {
  if (!imageHTML) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(imageHTML, "text/html");
  const img = doc.querySelector("img");
  let filename = img ? img.getAttribute("src") : imageHTML;
  // Split on "/" to handle paths correctly and encode each segment
  filename = filename
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
  return filename;
}

function extractAudioFilename(audioText) {
  if (!audioText) return "";
  if (audioText.startsWith("[sound:") && audioText.endsWith("]")) {
    return audioText.slice(7, -1);
  }
  return audioText;
}

function stripJapaneseHtml(html) {
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.innerText;
}

function stripEnglishHtml(html) {
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html.replace(/<br\s*\/?>/g, " ");
  return tempDiv.innerText;
}

function updateCardCount() {
  const totalCardCountElem = document.getElementById("totalCardCount");
  db.cards.count().then((count) => {
    totalCardCountElem.innerText = "Total Cards: " + count;
    totalCardCountElem.style.display = "flex"; // Ensure it's always visible
  });
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

async function getVidsFromContext(contextTexts) {
  // contextTexts is an array of Japanese texts (max length: 100)
  const jpdbUrl = "https://jpdb.io/api/v1/parse";
  const token = document.getElementById("jpdbApiKey").value.trim();

  try {
    const response = await fetch(jpdbUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
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

async function retrieveMediaFilesInBatch(filenames) {
  if (!filenames || filenames.length === 0) {
    return {};
  }
  const ankiUrl = document.getElementById("url").value.trim();
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

async function fetchAndStoreData() {
  // --- 1. INITIAL SETUP & VALIDATION ---
  const japaneseField = document.getElementById("japaneseFieldSelect").value;
  const englishField = document.getElementById("englishFieldSelect").value;
  const imageField = document.getElementById("imageFieldSelect").value;
  const audioField = document.getElementById("audioFieldSelect").value;
  const resultDiv = document.getElementById("result");
  const progressBar = document.getElementById("progressBar");
  const deckName = document.getElementById("deckSelect").value;

  const deckNameParts = deckName.split("::");
  const formattedDeckName = deckNameParts[deckNameParts.length - 1];

  saveSetting("selectedJapaneseField", japaneseField);
  saveSetting("selectedEnglishField", englishField);
  saveSetting("selectedImageField", imageField);
  saveSetting("selectedAudioField", audioField);

  if (!japaneseField) {
    alert("Please select a field for the Japanese sentence.");
    return;
  }
  const token = document.getElementById("jpdbApiKey").value.trim();
  if (!token) {
    alert("Please enter a valid JPDB API key.");
    return;
  }

  progressBar.style.display = "block";
  progressBar.value = 0;
  resultDiv.style.display = "block";
  resultDiv.innerText = "Scanning for updates...";

  // ====================================================================
  // UNIFIED SCANNING PHASE
  // ====================================================================

  const ankiCards = window.fetchedCards;
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
      ? stripEnglishHtml(ankiCard.fields[englishField].value.trim())
      : "";
    const newImageFile = imageField
      ? extractImageFilenameUsingDOMParser(
          ankiCard.fields[imageField].value.trim()
        )
      : "";
    const newAudioFile = audioField
      ? extractAudioFilename(ankiCard.fields[audioField].value.trim())
      : "";
    const needsMediaData =
      (newImageFile || newAudioFile) && !mediaIdSet.has(ankiCard.cardId);

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
  for (const storedCard of allDbCards) {
    if (ankiCardIds.has(storedCard.cardId)) continue;
    const needsMedia =
      (storedCard.image || storedCard.audio) &&
      !mediaIdSet.has(storedCard.cardId);
    if (needsMedia) {
      globalCardsToFix.push(storedCard);
    }
  }

  if (deckCardsToProcess.length === 0 && globalCardsToFix.length === 0) {
    progressBar.style.display = "none";
    resultDiv.innerText = "Everything is already up-to-date!";
    return;
  }

  // ====================================================================
  // CONSOLIDATED PROCESSING PHASE
  // ====================================================================
  resultDiv.innerText = `Found ${
    deckCardsToProcess.length + globalCardsToFix.length
  } cards to update... `;

  const textsToParse = deckCardsToProcess.map((c) => c.newJapaneseText);
  const filenamesToFetch = new Set();
  deckCardsToProcess.forEach((c) => {
    if (c.newImageFile) filenamesToFetch.add(c.newImageFile);
    if (c.newAudioFile) filenamesToFetch.add(c.newAudioFile);
  });
  globalCardsToFix.forEach((c) => {
    if (c.image) filenamesToFetch.add(c.image);
    if (c.audio) filenamesToFetch.add(c.audio);
  });

  let vidsForDeckCards = [];
  if (textsToParse.length > 0) {
    const textChunks = chunkArray(textsToParse, 100);
    for (let i = 0; i < textChunks.length; i++) {
      const jpdbData = await getVidsFromContext(textChunks[i]);
      vidsForDeckCards.push(...(jpdbData?.vidsForCards || []));
      progressBar.value = 0 + Math.round(((i + 1) / textChunks.length) * 40);
    }
  } else {
    progressBar.value = 40;
  }

  let allFetchedMedia = {};
  if (filenamesToFetch.size > 0) {
    const filenameChunks = chunkArray(Array.from(filenamesToFetch), 500);
    for (let i = 0; i < filenameChunks.length; i++) {
      allFetchedMedia = {
        ...allFetchedMedia,
        ...(await retrieveMediaFilesInBatch(filenameChunks[i])),
      };
      progressBar.value =
        40 + Math.round(((i + 1) / filenameChunks.length) * 60);
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
    for (const vid of vidsForDeckCards[i] || []) {
      if (!vidsToUpdate[vid]) vidsToUpdate[vid] = new Set();
      vidsToUpdate[vid].add(c.ankiCard.cardId);
    }
  }

  for (const card of globalCardsToFix) {
    const imageBase64 = allFetchedMedia[card.image] || null;
    const audioBase64 = allFetchedMedia[card.audio] || null;
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

  const allAffectedVids = Object.keys(vidsToUpdate);
  const existingVids = await db.vids
    .where("vid")
    .anyOf(allAffectedVids)
    .toArray();
  const finalVidsMap = new Map();
  existingVids.forEach((dbVid) => {
    finalVidsMap.set(dbVid.vid, new Set(dbVid.cards));
  });
  for (const vid in vidsToUpdate) {
    if (!finalVidsMap.has(vid)) {
      finalVidsMap.set(vid, new Set());
    }
    const cardSet = finalVidsMap.get(vid);
    vidsToUpdate[vid].forEach((cardId) => cardSet.add(cardId));
  }

  const finalVidsArray = Array.from(finalVidsMap.entries()).map(
    ([vid, cardIdSet]) => ({ vid, cards: Array.from(cardIdSet) })
  );

  await db.transaction("rw", db.cards, db.media, db.vids, async () => {
    if (cardsToStore.length > 0) await db.cards.bulkPut(cardsToStore);
    if (mediaToStore.length > 0) await db.media.bulkPut(mediaToStore);
    if (finalVidsArray.length > 0) await db.vids.bulkPut(finalVidsArray);
  });

  progressBar.style.display = "none";
  let finalMessage = `Sync complete: ${
    deckCardsToProcess.length + globalCardsToFix.length
  } cards were added.`;
  resultDiv.innerText = finalMessage;
  updateCardCount();
}

// ------------------------------
// Event Listeners
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  fetchDecks();
  loadSettings();
  updateCardCount();
});
document
  .getElementById("deckSelect")
  .addEventListener("change", loadCardsAndFields);
document
  .getElementById("fetchData")
  .addEventListener("click", fetchAndStoreData);
document.getElementById("jpdbApiKey").addEventListener("change", (e) => {
  saveSetting("jpdbApiKey", e.target.value.trim());
});

document.getElementById("loadConfigButton").addEventListener("click", () => {
  document.getElementById("configFileInput").click();
});

document.getElementById("autoPlayAudio").addEventListener("change", (e) => {
  saveSetting("autoPlayAudio", e.target.checked);
});
document.getElementById("extensionEnabled").addEventListener("change", (e) => {
  saveSetting("extensionEnabled", e.target.checked);
});
document
  .getElementById("hideNativeSentence")
  .addEventListener("change", (e) => {
    saveSetting("hideNativeSentence", e.target.checked);
  });
document
  .getElementById("mediaBlockSize")
  .addEventListener("input", function (e) {
    const size = e.target.value;
    document.getElementById("mediaBlockSizeValue").innerText = size + "px";
    saveSetting("mediaBlockSize", size);
  });
// document.getElementById("autoSync").addEventListener("change", (e) => {
//   saveSetting("autoSync", e.target.checked);
// });
document
  .getElementById("showEnglishSentence")
  .addEventListener("change", (e) => {
    saveSetting("showEnglishSentence", !e.target.checked);
  });

document.addEventListener("DOMContentLoaded", () => {
  const githubButton = document.getElementById("githubButton");
  if (githubButton) {
    githubButton.addEventListener("click", () => {
      window.open("https://github.com/felix-ops/JPDB-Media-Support");
    });
  }
});

document
  .getElementById("deckSelect")
  .addEventListener("change", async function () {
    await loadCardsAndFields();
  });

document
  .getElementById("saveConfigButton")
  .addEventListener("click", async () => {
    const settings = await db.settings.toArray();
    const cards = await db.cards.toArray(); // Only save lightweight metadata
    const vids = await db.vids.toArray();
    // Do NOT save the heavy 'media' table to the config file
    const configData = { settings, cards, vids };
    const json = JSON.stringify(configData, null, 2);
    const totalCardCount = await db.cards.count();
    const filename = `JPDB_Media_Config_${totalCardCount}.json`;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

// Replace the configFileInput listener
document
  .getElementById("configFileInput")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const configData = JSON.parse(e.target.result);
        // Clear all tables, including the new media table
        await Promise.all([
          db.settings.clear(),
          db.cards.clear(),
          db.media.clear(),
          db.vids.clear(),
        ]);
        if (configData.settings) await db.settings.bulkPut(configData.settings);
        if (configData.cards) await db.cards.bulkPut(configData.cards); // Load metadata
        if (configData.vids) await db.vids.bulkPut(configData.vids);
        alert(
          `Configuration loaded! Click "Fetch Data From Anki" to sync media files.`
        );
        updateCardCount();
      } catch (err) {
        alert("Error parsing configuration file: " + err.message);
      }
    };
    reader.readAsText(file);
  });

// Replace the deleteData listener
document
  .getElementById("deleteData")
  .addEventListener("click", async function () {
    if (
      confirm(
        "Clearing the Data from here is totally safe and will not affect the Anki decks in any way.  It will only remove the relation in the extension's database"
      )
    ) {
      try {
        await db.cards.clear();
        await db.media.clear();
        await db.vids.clear();
        updateCardCount();
      } catch (error) {
        alert("An error occurred while deleting data.");
      }
    }
  });
