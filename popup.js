/* popup.js using Dexie.js for IndexedDB */

const db = new Dexie("JPDBMediaSupportDB");
db.version(1).stores({
  settings: "key",
  cards: "cardId",
  vids: "vid",
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

async function fetchAndStoreData() {
  // Retrieve field selections for Japanese, English, image, and audio.
  const japaneseField = document.getElementById("japaneseFieldSelect").value;
  const englishField = document.getElementById("englishFieldSelect").value;
  const imageField = document.getElementById("imageFieldSelect").value;
  const audioField = document.getElementById("audioFieldSelect").value;
  const resultDiv = document.getElementById("result");
  const progressBar = document.getElementById("progressBar");
  const deckName = document.getElementById("deckSelect").value;

  // Save field settings
  saveSetting("selectedJapaneseField", japaneseField);
  saveSetting("selectedEnglishField", englishField);
  saveSetting("selectedImageField", imageField);
  saveSetting("selectedAudioField", audioField);

  if (!japaneseField) {
    alert("Please select fields for Japanese, English, image, and audio.");
    return;
  }

  const token = document.getElementById("jpdbApiKey").value.trim();
  if (!token) {
    alert("Please enter a valid JPDB API key.");
    return;
  }

  progressBar.style.display = "block";
  progressBar.value = 0;
  const totalCards = window.fetchedCards.length;

  // Build an array of cleaned Japanese texts from each card.
  const japaneseTexts = window.fetchedCards.map((card) => {
    const rawJapaneseText = card.fields[japaneseField].value.trim();
    return stripJapaneseHtml(rawJapaneseText);
  });

  // Chunk the texts into groups of 100.
  const textChunks = chunkArray(japaneseTexts, 100);
  let allVidsForCards = [];

  // Process each chunk sequentially.
  for (const chunk of textChunks) {
    const jpdbData = await getVidsFromContext(chunk);
    if (jpdbData && jpdbData.vidsForCards) {
      allVidsForCards.push(...jpdbData.vidsForCards);
    }
  }

  // Make sure we have the same number of results as cards.
  if (allVidsForCards.length !== totalCards) {
    console.warn("The number of results does not match the number of cards.");
  }

  for (let i = 0; i < totalCards; i++) {
    const card = window.fetchedCards[i];
    const cardId = card.cardId;

    // Retrieve raw HTML from the selected fields.
    const rawJapaneseText = japaneseField
      ? card.fields[japaneseField].value.trim()
      : "";
    const rawEnglishText = englishField
      ? card.fields[englishField].value.trim()
      : "";
    const rawImageText = imageField ? card.fields[imageField].value.trim() : "";
    const rawAudioText = audioField ? card.fields[audioField].value.trim() : "";

    // Process texts using the provided functions.
    const japaneseText = stripJapaneseHtml(rawJapaneseText);
    const englishText = stripEnglishHtml(rawEnglishText);

    const imageFilename = extractImageFilenameUsingDOMParser(rawImageText);
    const audioFilename = extractAudioFilename(rawAudioText);

    // Check for an existing record; compare using the new field names.
    let newCardData = await db.cards.get(cardId);
    if (
      newCardData &&
      newCardData.japaneseContext === japaneseText &&
      newCardData.englishContext === englishText &&
      newCardData.image === imageFilename &&
      newCardData.audio === audioFilename &&
      newCardData.deckName === deckName
    ) {
      // Existing record is up-to-date; no need to update.
    } else {
      // Use the pre-fetched vids for this card (or an empty array if none)
      const cardVids = allVidsForCards[i] || [];
      newCardData = {
        cardId,
        deckName: deckName,
        japaneseContext: japaneseText,
        englishContext: englishText,
        image: imageFilename,
        audio: audioFilename,
        vids: cardVids,
      };
      await db.cards.put(newCardData);
    }

    // Update reverse mapping for vocabulary IDs.
    for (const vid of newCardData.vids) {
      let existingVid = await db.vids.get(vid);
      if (existingVid) {
        if (!existingVid.cards.includes(cardId)) {
          existingVid.cards.push(cardId);
          await db.vids.put(existingVid);
        }
      } else {
        await db.vids.put({ vid: vid, cards: [cardId] });
      }
    }

    progressBar.value = Math.round(((i + 1) / totalCards) * 100);
    updateCardCount();
  }

  progressBar.style.display = "none";
  resultDiv.innerText = `Data fetched and stored successfully!`;
  updateCardCount();
  resultDiv.style.display = "block";
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

document
  .getElementById("saveConfigButton")
  .addEventListener("click", async () => {
    const settings = await db.settings.toArray();
    const cards = await db.cards.toArray();
    const vids = await db.vids.toArray();
    const configData = { settings, cards, vids };
    const json = JSON.stringify(configData, null, 2);

    // Get the total card count from the database
    const totalCardCount = await db.cards.count();

    // Create the filename with the total card count
    const filename = `JPDB_Media_Config_${totalCardCount}.json`;

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename; // Use the dynamic filename here
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

document.getElementById("loadConfigButton").addEventListener("click", () => {
  document.getElementById("configFileInput").click();
});
document
  .getElementById("configFileInput")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const configData = JSON.parse(e.target.result);
        await Promise.all([
          db.settings.clear(),
          db.cards.clear(),
          db.vids.clear(),
        ]);
        if (configData.settings) await db.settings.bulkPut(configData.settings);
        if (configData.cards) await db.cards.bulkPut(configData.cards);
        if (configData.vids) await db.vids.bulkPut(configData.vids);
        alert("Configuration loaded successfully!");
      } catch (err) {
        alert("Error parsing configuration file: " + err.message);
      }
    };
    reader.readAsText(file);
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
  .getElementById("deleteData")
  .addEventListener("click", async function () {
    if (
      confirm(
        "Clearing the Data from here is totally safe and will not affect the Anki decks in any way.  It will only remove the relation in the extension's database"
      )
    ) {
      try {
        await db.cards.clear();
        await db.vids.clear();
        updateCardCount(); // Refresh the card count display
        alert("Cards data have been cleared.");
      } catch (error) {
        alert("An error occurred while deleting data.");
      }
    }
  });
