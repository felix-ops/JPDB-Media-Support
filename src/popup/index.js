import { setupCombobox, populateFieldDropdown, updateCardCount } from "./ui.js";
import { fetchDecks, fetchAnkiCards } from "../api/anki.js";
import {
  getSetting,
  saveSetting,
  clearAllCards,
  clearAllMedia,
  restoreFromConfigMsg,
  performAutoSyncMsg
} from "../shared/messaging.js";

async function loadSettings() {
  const [
    jpdbApiKey,
    ankiUrl,
    autoPlayAudio,
    mediaBlockSize,
    fetchMediaToBrowser,
    autoSync,
    showImageOnFront,
    showSentenceOnFront,
    autoPlayFront,
    hideNativeSentenceFront,
    showEnglishSentence,
    extensionEnabled,
    hideNativeSentence
  ] = await Promise.all([
    getSetting("jpdbApiKey", ""),
    getSetting("ankiUrl", "http://localhost:8765"),
    getSetting("autoPlayAudio", false),
    getSetting("mediaBlockSize", "650"),
    getSetting("fetchMediaToBrowser", false),
    getSetting("autoSync", false),
    getSetting("showImageOnFront", false),
    getSetting("showSentenceOnFront", false),
    getSetting("autoPlayFront", false),
    getSetting("hideNativeSentenceFront", false),
    getSetting("showEnglishSentence", true),
    getSetting("extensionEnabled", true),
    getSetting("hideNativeSentence", true)
  ]);

  if (jpdbApiKey) {
    document.getElementById("jpdbApiKey").value = jpdbApiKey;
  }
  document.getElementById("url").value = ankiUrl;
  document.getElementById("autoPlayAudio").checked = autoPlayAudio;
  document.getElementById("fetchMediaToBrowser").checked = fetchMediaToBrowser;
  document.getElementById("mediaBlockSize").value = mediaBlockSize;
  document.getElementById("mediaBlockSizeValue").innerText = mediaBlockSize + "px";
  document.getElementById("autoSync").checked = autoSync;
  document.getElementById("showImageOnFront").checked = showImageOnFront;
  document.getElementById("showSentenceOnFront").checked = showSentenceOnFront;
  document.getElementById("autoPlayFront").checked = autoPlayFront;
  document.getElementById("hideNativeSentenceFront").checked = hideNativeSentenceFront;
  document.getElementById("showEnglishSentence").checked = !showEnglishSentence;
  document.getElementById("extensionEnabled").checked = extensionEnabled;
  document.getElementById("hideNativeSentence").checked = hideNativeSentence;
}

async function doFetchDecks() {
  const ankiUrl = document.getElementById("url").value.trim();
  const deckSelect = document.getElementById("deckSelect");
  deckSelect.innerHTML = '<option value="">-- Loading decks --</option>';

  const decks = await fetchDecks(ankiUrl);
  deckSelect.innerHTML = "";
  if (decks && decks.length > 0) {
    decks.forEach((deckName) => {
      const option = document.createElement("option");
      option.value = deckName;
      option.text = deckName;
      deckSelect.appendChild(option);
    });
    const storedDeck = await getSetting("selectedDeck", "");
    if (storedDeck) {
      deckSelect.value = storedDeck;
      deckSelect.dispatchEvent(new Event("change"));
    }
  } else {
    deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
  }
}

async function loadCardsAndFields() {
  const ankiUrl = document.getElementById("url").value.trim();
  const deckSelect = document.getElementById("deckSelect");
  const deckName = deckSelect.value;
  const resultDiv = document.getElementById("result");
  
  saveSetting("selectedDeck", deckName);
  resultDiv.innerHTML = "";
  window.fetchedCards = [];

  if (!ankiUrl || !deckName) return;

  const cards = await fetchAnkiCards(deckName, ankiUrl);
  if (!cards || cards.length === 0) {
    alert("No cards found or failed to retrieve card information.");
    return;
  }

  window.fetchedCards = cards;
  updateCardCount();

  const firstCard = cards[0];
  const fieldNames = Object.keys(firstCard.fields);

  const setField = async (selectId, settingKey) => {
    populateFieldDropdown(selectId, fieldNames);
    const val = await getSetting(settingKey, "");
    if (val) {
      const el = document.getElementById(selectId);
      el.value = val;
      el.dispatchEvent(new Event("change"));
    }
  };

  setField("japaneseFieldSelect", "selectedJapaneseField");
  setField("englishFieldSelect", "selectedEnglishField");
  setField("imageFieldSelect", "selectedImageField");
  setField("audioFieldSelect", "selectedAudioField");
}

async function fetchAndStoreData() {
  const japaneseField = document.getElementById("japaneseFieldSelect").value;
  const englishField = document.getElementById("englishFieldSelect").value;
  const imageField = document.getElementById("imageFieldSelect").value;
  const audioField = document.getElementById("audioFieldSelect").value;
  const deckName = document.getElementById("deckSelect").value;
  const ankiUrl = document.getElementById("url").value.trim();
  const jpdbApiKey = document.getElementById("jpdbApiKey").value.trim();
  const resultDiv = document.getElementById("result");
  const progressBar = document.getElementById("progressBar");

  saveSetting("selectedJapaneseField", japaneseField);
  saveSetting("selectedEnglishField", englishField);
  saveSetting("selectedImageField", imageField);
  saveSetting("selectedAudioField", audioField);

  if (!japaneseField || !jpdbApiKey || !ankiUrl || !deckName) {
    alert("Please ensure Japanese Field, API Key, Anki URL, and Deck are selected.");
    return;
  }

  progressBar.style.display = "block";
  progressBar.value = 50; 
  resultDiv.style.display = "block";
  resultDiv.innerText = "Syncing in background...";

  const shouldFetchMedia = await getSetting("fetchMediaToBrowser", false);

  try {
    const result = await performAutoSyncMsg({
      deckName,
      ankiUrl,
      jpdbApiKey,
      japaneseField,
      englishField,
      imageField,
      audioField,
      shouldFetchMedia
    });

    progressBar.style.display = "none";
    resultDiv.innerText = result ? result.message : "Sync complete!";
    updateCardCount();
  } catch (error) {
    progressBar.style.display = "none";
    resultDiv.innerText = `Error: ${error.message}`;
    console.error("Sync error:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ["deckSelect", "japaneseFieldSelect", "englishFieldSelect", "imageFieldSelect", "audioFieldSelect"]
    .forEach(setupCombobox);

  loadSettings().then(() => {
    doFetchDecks();
  });
  updateCardCount();

  try {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById("extensionVersion");
    if (versionEl && manifest && manifest.version) {
      versionEl.textContent = `Version ${manifest.version}`;
    }
  } catch (e) {}

  document.getElementById("deckSelect").addEventListener("change", loadCardsAndFields);
  document.getElementById("fetchData").addEventListener("click", fetchAndStoreData);

  document.getElementById("jpdbApiKey").addEventListener("change", (e) => saveSetting("jpdbApiKey", e.target.value.trim()));
  document.getElementById("url").addEventListener("change", (e) => saveSetting("ankiUrl", e.target.value.trim()));
  document.getElementById("japaneseFieldSelect").addEventListener("change", (e) => saveSetting("selectedJapaneseField", e.target.value));
  document.getElementById("englishFieldSelect").addEventListener("change", (e) => saveSetting("selectedEnglishField", e.target.value));
  document.getElementById("imageFieldSelect").addEventListener("change", (e) => saveSetting("selectedImageField", e.target.value));
  document.getElementById("audioFieldSelect").addEventListener("change", (e) => saveSetting("selectedAudioField", e.target.value));

  document.getElementById("loadConfigButton").addEventListener("click", () => document.getElementById("configFileInput").click());
  
  document.getElementById("fetchMediaToBrowser").addEventListener("change", async (e) => {
    const isEnabled = e.target.checked;
    if (isEnabled) {
      await saveSetting("fetchMediaToBrowser", true);
    } else {
      if (confirm("Disabling this will clear all cached media from the browser. Proceed?")) {
        try {
          await saveSetting("fetchMediaToBrowser", false);
          await clearAllMedia();
          updateCardCount();
        } catch (error) {
          alert("Failed to clear media cache: " + error.message);
          e.target.checked = true;
        }
      } else {
        e.target.checked = true;
      }
    }
  });

  document.getElementById("autoPlayAudio").addEventListener("change", (e) => saveSetting("autoPlayAudio", e.target.checked));
  document.getElementById("showImageOnFront").addEventListener("change", (e) => saveSetting("showImageOnFront", e.target.checked));
  document.getElementById("showSentenceOnFront").addEventListener("change", (e) => saveSetting("showSentenceOnFront", e.target.checked));
  document.getElementById("autoPlayFront").addEventListener("change", (e) => saveSetting("autoPlayFront", e.target.checked));
  document.getElementById("hideNativeSentenceFront").addEventListener("change", (e) => saveSetting("hideNativeSentenceFront", e.target.checked));
  document.getElementById("extensionEnabled").addEventListener("change", (e) => saveSetting("extensionEnabled", e.target.checked));
  document.getElementById("hideNativeSentence").addEventListener("change", (e) => saveSetting("hideNativeSentence", e.target.checked));
  document.getElementById("showEnglishSentence").addEventListener("change", (e) => saveSetting("showEnglishSentence", !e.target.checked));
  document.getElementById("autoSync").addEventListener("change", (e) => saveSetting("autoSync", e.target.checked));

  document.getElementById("mediaBlockSize").addEventListener("input", function (e) {
    const size = e.target.value;
    document.getElementById("mediaBlockSizeValue").innerText = size + "px";
    saveSetting("mediaBlockSize", size);
  });

  const githubButton = document.getElementById("githubButton");
  if (githubButton) {
    githubButton.addEventListener("click", () => window.open("https://github.com/felix-ops/JPDB-Media-Support"));
  }

  document.getElementById("saveConfigButton").addEventListener("click", () => {
    alert("Export config not fully implemented in background yet, please refer to messaging.js for advanced exports!");
  });

  document.getElementById("configFileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const configData = JSON.parse(e.target.result);
        if (!configData.settings || !configData.cards || !configData.vids) {
          alert("Invalid or corrupt configuration file.");
          return;
        }
        await restoreFromConfigMsg(configData);
        alert(`Configuration loaded !`);
        updateCardCount();
        loadSettings();
        doFetchDecks();
      } catch (err) {
        alert("Error parsing configuration file: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  });

  document.getElementById("deleteData").addEventListener("click", async function () {
    if (confirm("'Delete All Cards' will remove all stored cards and favorites from the Extension.")) {
      try {
        await clearAllCards();
        updateCardCount();
      } catch (error) {
        alert("An error occurred while deleting data.");
      }
    }
  });
});
