/* popup.js using Dexie.js for IndexedDB */

const db = new Dexie("JPDBMediaSupportDB");
db.version(1).stores({
  settings: "key",
  cards: "cardId",
  vids: "vid"
});

// --- Helper functions for settings ---
function getSetting(key, defaultValue) {
  return db.settings.get(key).then((item) => (item ? item.value : defaultValue));
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
    getSetting("selectedDeck", ""),
    getSetting("selectedContextField", ""),
    getSetting("selectedImageField", ""),
    getSetting("selectedAudioField", ""),
    getSetting("autoPlayAudio", false)
  ]).then(
    ([
      jpdbApiKey,
      selectedDeck,
      selectedContextField,
      selectedImageField,
      selectedAudioField,
      autoPlayAudio
    ]) => {
      if (jpdbApiKey) {
        document.getElementById("jpdbApiKey").value = jpdbApiKey;
      }
      if (selectedDeck) {
        document.getElementById("deckSelect").value = selectedDeck;
      }
      if (selectedContextField) {
        document.getElementById("contextFieldSelect").value = selectedContextField;
      }
      if (selectedImageField) {
        document.getElementById("imageFieldSelect").value = selectedImageField;
      }
      if (selectedAudioField) {
        document.getElementById("audioFieldSelect").value = selectedAudioField;
      }
      document.getElementById("autoPlayAudio").checked = autoPlayAudio;
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
  console.log("Fetching decks from:", ankiUrl);

  try {
    const response = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deckNames",
        version: 6
      })
    });
    const data = await response.json();
    console.log("Decks response:", data);
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
    deckSelect.innerHTML = '<option value="">-- Error loading decks --</option>';
    console.error("Error fetching decks:", error);
  }
}

async function loadCardsAndFields() {
  const ankiUrl = document.getElementById("url").value.trim();
  const deckSelect = document.getElementById("deckSelect");
  const deckName = deckSelect.value;
  const resultDiv = document.getElementById("result");

  saveSetting("selectedDeck", deckName);

  resultDiv.innerHTML = "";
  window.fetchedCards = []; // global variable to store fetched cards

  if (!ankiUrl || !deckName) {
    alert("Please provide a valid Anki Connect URL and select a deck.");
    return;
  }

  try {
    // Get card IDs
    const findCardsResponse = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "findCards",
        version: 6,
        params: { query: `deck:"${deckName}"` }
      })
    });
    const findCardsData = await findCardsResponse.json();
    if (!findCardsData.result || findCardsData.result.length === 0) {
      alert("No cards found in the selected deck.");
      return;
    }

    // Get card details
    const cardIds = findCardsData.result;
    const cardsInfoResponse = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cardsInfo",
        version: 6,
        params: { cards: cardIds }
      })
    });
    const cardsInfoData = await cardsInfoResponse.json();
    if (!cardsInfoData.result || cardsInfoData.result.length === 0) {
      alert("Failed to retrieve card information.");
      return;
    }

    window.fetchedCards = cardsInfoData.result;

    // Use fields from the first card to populate dropdowns.
    const firstCard = window.fetchedCards[0];
    const fieldNames = Object.keys(firstCard.fields);

    populateFieldDropdown("contextFieldSelect", fieldNames);
    getSetting("selectedContextField", "").then((val) => {
      if (val) document.getElementById("contextFieldSelect").value = val;
    });

    populateFieldDropdown("imageFieldSelect", fieldNames);
    getSetting("selectedImageField", "").then((val) => {
      if (val) document.getElementById("imageFieldSelect").value = val;
    });

    populateFieldDropdown("audioFieldSelect", fieldNames);
    getSetting("selectedAudioField", "").then((val) => {
      if (val) document.getElementById("audioFieldSelect").value = val;
    });
  } catch (error) {
    console.error("Error loading cards:", error);
  }
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

async function getVidsFromContext(contextText) {
  const jpdbUrl = "https://jpdb.io/api/v1/parse";
  const token = document.getElementById("jpdbApiKey").value.trim();

  try {
    const response = await fetch(jpdbUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: contextText,
        token_fields: ["vocabulary_index", "position", "length", "furigana"],
        position_length_encoding: "utf16",
        vocabulary_fields: [
          "vid",
          "sid",
          "rid",
          "spelling",
          "reading",
          "frequency_rank",
          "meanings"
        ]
      })
    });
    const data = await response.json();
    console.log("JPDB API response:", data);
    if (data.vocabulary && Array.isArray(data.vocabulary)) {
      const vids = data.vocabulary.map((vocab) => String(vocab[0]));
      return { vids, tokens: data.tokens, vocabulary: data.vocabulary };
    }
  } catch (error) {
    console.error("Error fetching JPDB data:", error);
  }
  return { vids: [], tokens: [], vocabulary: [] };
}

function extractImageFilename(imageHTML) {
  if (!imageHTML) return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = imageHTML;
  const img = tempDiv.querySelector("img");
  return img ? img.getAttribute("src") : imageHTML;
}

function extractAudioFilename(audioText) {
  if (!audioText) return "";
  if (audioText.startsWith("[sound:") && audioText.endsWith("]")) {
    return audioText.slice(7, -1);
  }
  return audioText;
}

async function fetchAndStoreData() {
  const contextField = document.getElementById("contextFieldSelect").value;
  const imageField = document.getElementById("imageFieldSelect").value;
  const audioField = document.getElementById("audioFieldSelect").value;
  const resultDiv = document.getElementById("result");
  const progressBar = document.getElementById("progressBar");

  // Save field settings
  saveSetting("selectedContextField", contextField);
  saveSetting("selectedImageField", imageField);
  saveSetting("selectedAudioField", audioField);

  if (!contextField || !imageField || !audioField) {
    alert("Please select fields for context, image, and audio.");
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

  for (let i = 0; i < totalCards; i++) {
    const card = window.fetchedCards[i];
    const cardId = card.cardId;
    const contextText = card.fields[contextField].value.trim();
    const rawImageText = card.fields[imageField].value.trim();
    const rawAudioText = card.fields[audioField].value.trim();

    const imageFilename = extractImageFilename(rawImageText);
    const audioFilename = extractAudioFilename(rawAudioText);

    // Check for an existing record
    let newCardData = await db.cards.get(cardId);
    if (
      newCardData &&
      newCardData.context === contextText &&
      newCardData.image === imageFilename &&
      newCardData.audio === audioFilename
    ) {
      console.log(`Card ${cardId} unchanged, skipping JPDB API call.`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const jpdbData = contextText ? await getVidsFromContext(contextText) : { vids: [] };
      newCardData = {
        cardId,
        context: contextText,
        image: imageFilename,
        audio: audioFilename,
        vids: jpdbData.vids
      };
      await db.cards.put(newCardData);
    }

    // Update reverse mapping for vocabulary IDs
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
  }

  progressBar.style.display = "none";
  resultDiv.innerText = `Data fetched and stored successfully! Total cards: ${totalCards}`;
  resultDiv.style.display = "block";
}

// ------------------------------
// Event Listeners
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  fetchDecks();
  loadSettings();
});
document.getElementById("deckSelect").addEventListener("change", loadCardsAndFields);
document.getElementById("fetchData").addEventListener("click", fetchAndStoreData);
document.getElementById("jpdbApiKey").addEventListener("change", (e) => {
  saveSetting("jpdbApiKey", e.target.value.trim());
});
document.getElementById("saveConfigButton").addEventListener("click", async () => {
  const settings = await db.settings.toArray();
  const cards = await db.cards.toArray();
  const vids = await db.vids.toArray();
  const configData = { settings, cards, vids };
  const json = JSON.stringify(configData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "JPDB_Media_Support_Config.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
document.getElementById("loadConfigButton").addEventListener("click", () => {
  document.getElementById("configFileInput").click();
});
document.getElementById("configFileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const configData = JSON.parse(e.target.result);
      await Promise.all([db.settings.clear(), db.cards.clear(), db.vids.clear()]);
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
document.getElementById("hideNativeSentence").addEventListener("change", (e) => {
  saveSetting("hideNativeSentence", e.target.checked);
});
document.addEventListener("DOMContentLoaded", () => {
  const githubButton = document.getElementById("githubButton");
  if (githubButton) {
    githubButton.addEventListener("click", () => {
      window.open("https://github.com/felix-ops/JPDB-Media-Support");
    });
  }
});
