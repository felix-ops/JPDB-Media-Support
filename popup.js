// Global variable to store all fetched cards from the selected deck
let fetchedCards = [];

/**
 * Helper to determine MIME type (for later use if needed).
 */
function getMimeType(filename) {
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

/**
 * Load stored settings from local storage and apply them to UI.
 */
function loadSettings() {
  chrome.storage.local.get(
    ['jpdbApiKey', 'selectedDeck', 'selectedContextField', 'selectedImageField', 'selectedAudioField', 'autoPlayAudio'],
    function(data) {
      if (data.jpdbApiKey) {
        document.getElementById('jpdbApiKey').value = data.jpdbApiKey;
      }
      if (data.selectedDeck) {
        document.getElementById('deckSelect').value = data.selectedDeck;
      }
      if (data.selectedContextField) {
        document.getElementById('contextFieldSelect').value = data.selectedContextField;
      }
      if (data.selectedImageField) {
        document.getElementById('imageFieldSelect').value = data.selectedImageField;
      }
      if (data.selectedAudioField) {
        document.getElementById('audioFieldSelect').value = data.selectedAudioField;
      }
      if (typeof data.autoPlayAudio !== 'undefined') {
        document.getElementById('autoPlayAudio').checked = data.autoPlayAudio;
      }
    }
  );
}

/**
 * Save a setting to local storage.
 */
function saveSetting(key, value) {
  let setting = {};
  setting[key] = value;
  chrome.storage.local.set(setting);
}

/**
 * Fetch decks using Anki Connect's deckNames action.
 */
async function fetchDecks() {
  const ankiUrl = document.getElementById('url').value.trim();
  const deckSelect = document.getElementById('deckSelect');
  deckSelect.innerHTML = '<option value="">-- Loading decks --</option>';
  console.log("Fetching decks from:", ankiUrl);
  
  try {
    const response = await fetch(ankiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deckNames',
        version: 6
      })
    });
    const data = await response.json();
    console.log("Decks response:", data);
    deckSelect.innerHTML = '';
    if (data.result && Array.isArray(data.result)) {
      data.result.forEach(deckName => {
        const option = document.createElement('option');
        option.value = deckName;
        option.text = deckName;
        deckSelect.appendChild(option);
      });
      if (data.result.length === 0) {
        deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
      }
      
      // Retrieve the stored deck value and select it if it exists.
      chrome.storage.local.get('selectedDeck', (storedData) => {
        if (storedData.selectedDeck) {
          deckSelect.value = storedData.selectedDeck;
          // Optionally, trigger change event if needed
          deckSelect.dispatchEvent(new Event('change'));
        }
      });
    } else {
      deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
    }
  } catch (error) {
    deckSelect.innerHTML = '<option value="">-- Error loading decks --</option>';
    console.error('Error fetching decks:', error);
  }
}


/**
 * Load cards for the selected deck using findCards and cardsInfo.
 * Then, use the fields from the first card to populate the three field dropdowns.
 */
async function loadCardsAndFields() {
  const ankiUrl = document.getElementById('url').value.trim();
  const deckSelect = document.getElementById('deckSelect');
  const deckName = deckSelect.value;
  const resultDiv = document.getElementById('result');
  
  // Save selected deck
  saveSetting('selectedDeck', deckName);
  
  // Clear previous state
  resultDiv.innerHTML = '';
  fetchedCards = [];
  
  if (!ankiUrl || !deckName) {
    alert('Please provide a valid Anki Connect URL and select a deck.');
    return;
  }
  
  try {
    // Get card IDs from the deck
    const findCardsResponse = await fetch(ankiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'findCards',
        version: 6,
        params: { query: `deck:"${deckName}"` }
      })
    });
    const findCardsData = await findCardsResponse.json();
    if (!findCardsData.result || findCardsData.result.length === 0) {
      alert('No cards found in the selected deck.');
      return;
    }
    
    // Get detailed info for these cards
    const cardIds = findCardsData.result;
    const cardsInfoResponse = await fetch(ankiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cardsInfo',
        version: 6,
        params: { cards: cardIds }
      })
    });
    const cardsInfoData = await cardsInfoResponse.json();
    if (!cardsInfoData.result || cardsInfoData.result.length === 0) {
      alert('Failed to retrieve card information.');
      return;
    }
    
    fetchedCards = cardsInfoData.result;
    
    // Populate the field dropdowns using fields from the first card (assumes uniformity)
    const firstCard = fetchedCards[0];
    const fieldNames = Object.keys(firstCard.fields);
    
    // Context field dropdown
    populateFieldDropdown('contextFieldSelect', fieldNames);
    chrome.storage.local.get('selectedContextField', (data) => {
      if (data.selectedContextField) {
        document.getElementById('contextFieldSelect').value = data.selectedContextField;
      }
    });
    
    // Image field dropdown
    populateFieldDropdown('imageFieldSelect', fieldNames);
    chrome.storage.local.get('selectedImageField', (data) => {
      if (data.selectedImageField) {
        document.getElementById('imageFieldSelect').value = data.selectedImageField;
      }
    });
    
    // Audio field dropdown
    populateFieldDropdown('audioFieldSelect', fieldNames);
    chrome.storage.local.get('selectedAudioField', (data) => {
      if (data.selectedAudioField) {
        document.getElementById('audioFieldSelect').value = data.selectedAudioField;
      }
    });
    
  } catch (error) {
    console.error('Error loading cards:', error);
  }
}


/**
 * Utility to populate a select element with a given list of field names.
 */
function populateFieldDropdown(selectId, fieldNames) {
  const selectElem = document.getElementById(selectId);
  selectElem.innerHTML = '<option value="">-- Select a field --</option>';
  fieldNames.forEach(fieldName => {
    const option = document.createElement('option');
    option.value = fieldName;
    option.text = fieldName;
    selectElem.appendChild(option);
  });
}

/**
 * Call the JPDB API for a given context text and return an array of vocabulary IDs.
 */
async function getVidsFromContext(contextText) {
  const jpdbUrl = "https://jpdb.io/api/v1/parse";
  const token = document.getElementById('jpdbApiKey').value.trim();
  
  try {
    const response = await fetch(jpdbUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: contextText,
        token_fields: [
          "vocabulary_index",
          "position",
          "length",
          "furigana"
        ],
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
      const vids = data.vocabulary.map(vocab => String(vocab[0]));
      return { vids, tokens: data.tokens, vocabulary: data.vocabulary };
    }
  } catch (error) {
    console.error('Error fetching JPDB data:', error);
  }
  return { vids: [], tokens: [], vocabulary: [] };
}

function extractImageFilename(imageHTML) {
  if (!imageHTML) return "";
  // Create a temporary element to parse the HTML.
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = imageHTML;
  const img = tempDiv.querySelector("img");
  return img ? img.getAttribute("src") : imageHTML;
}

function extractAudioFilename(audioText) {
  if (!audioText) return "";
  // If the audio is in the [sound:...] format, remove the markers.
  if (audioText.startsWith("[sound:") && audioText.endsWith("]")) {
    return audioText.slice(7, -1);
  }
  return audioText;
}

/**
 * Process all cards in the selected deck and build the data JSON.
 * Adds a 0.5 second delay per card and shows a progress bar.
 */
async function fetchAndStoreData() {
  const contextField = document.getElementById('contextFieldSelect').value;
  const imageField = document.getElementById('imageFieldSelect').value;
  const audioField = document.getElementById('audioFieldSelect').value;
  const resultDiv = document.getElementById('result');
  const progressBar = document.getElementById('progressBar');

  // Save selected field settings
  saveSetting('selectedContextField', contextField);
  saveSetting('selectedImageField', imageField);
  saveSetting('selectedAudioField', audioField);

  if (!contextField || !imageField || !audioField) {
    alert('Please select fields for context, image, and audio.');
    return;
  }

  const token = document.getElementById('jpdbApiKey').value.trim();
  if (!token) {
    alert('Please enter a valid JPDB API key.');
    return;
  }

  // Retrieve existing data from storage
  chrome.storage.local.get('jpdbData', async (storedData) => {
    let existingData = storedData.jpdbData || { cards: {}, vid: {} };

    // Initialize a new data object
    let dataJson = { cards: {}, vid: {} };

    progressBar.style.display = 'block';
    progressBar.value = 0;

    const totalCards = fetchedCards.length;

    // Process each card sequentially
    for (let i = 0; i < totalCards; i++) {
      const card = fetchedCards[i];
      const cardId = card.cardId;
      // Extract raw text from the fields
      const contextText = card.fields[contextField].value.trim();
      const rawImageText = card.fields[imageField].value.trim();
      const rawAudioText = card.fields[audioField].value.trim();

      // Extract only the filename from the raw text.
      const imageFilename = extractImageFilename(rawImageText);
      const audioFilename = extractAudioFilename(rawAudioText);

      let newCardData;

      // Check if the card exists and its key fields are unchanged
      if (
        existingData.cards[cardId] &&
        existingData.cards[cardId].context === contextText &&
        existingData.cards[cardId].image === imageFilename &&
        existingData.cards[cardId].audio === audioFilename
      ) {
        // Reuse existing data if unchanged.
        newCardData = existingData.cards[cardId];
        console.log(`Card ${cardId} unchanged, skipping JPDB API call.`);
      } else {
        // For new or changed cards, wait 500ms and process.
        await new Promise(resolve => setTimeout(resolve, 500));
        // Only store vocabulary IDs if needed.
        const jpdbData = contextText ? await getVidsFromContext(contextText) : { vids: [] };
        newCardData = {
          context: contextText,
          image: imageFilename,
          audio: audioFilename,
          vids: jpdbData.vids
        };
      }

      dataJson.cards[cardId] = newCardData;
      progressBar.value = Math.round(((i + 1) / totalCards) * 100);
    }

    // Rebuild the reverse mapping for vocabulary IDs based on the updated cards.
    Object.keys(dataJson.cards).forEach(cardId => {
      let cardData = dataJson.cards[cardId];
      cardData.vids.forEach(vid => {
        if (!dataJson.vid[vid]) {
          dataJson.vid[vid] = { cards: [] };
        }
        if (!dataJson.vid[vid].cards.includes(cardId)) {
          dataJson.vid[vid].cards.push(cardId);
        }
      });
    });

    progressBar.style.display = 'none';

    // Store the updated data and display total cards count.
    chrome.storage.local.set({ jpdbData: dataJson }, () => {
      const resultDiv = document.getElementById('result');
      resultDiv.innerText = `Data fetched and stored successfully! Total cards: ${totalCards}`;
      resultDiv.style.display = 'block'; // Unhide the result div
    });
  });
}





/**
 * Event Listeners:
 * - Load decks and stored settings on DOMContentLoaded.
 * - When a deck is selected, automatically load cards and populate the field dropdowns.
 * - When the "Fetch Data" button is clicked, process all cards.
 * - Save API key changes.
 */
document.addEventListener('DOMContentLoaded', () => {
  fetchDecks();
  loadSettings();
});
document.getElementById('deckSelect').addEventListener('change', loadCardsAndFields);
document.getElementById('fetchData').addEventListener('click', fetchAndStoreData);
document.getElementById('jpdbApiKey').addEventListener('change', (e) => {
  saveSetting('jpdbApiKey', e.target.value.trim());
});


// Save entire local storage as a config.json file
document.getElementById('saveConfigButton').addEventListener('click', () => {
  chrome.storage.local.get(null, (data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link to trigger the download
    const a = document.createElement('a');
    a.href = url;
    a.download = "config.json";
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

// Trigger file selection when clicking the "Load Config" button
document.getElementById('loadConfigButton').addEventListener('click', () => {
  document.getElementById('configFileInput').click();
});

// Handle the file selection and load configuration
document.getElementById('configFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const configData = JSON.parse(e.target.result);
      chrome.storage.local.set(configData, () => {
        alert("Configuration loaded successfully!");
        // Optionally, you may want to refresh the UI after loading config.
      });
    } catch(err) {
      alert("Error parsing configuration file: " + err.message);
    }
  };
  reader.readAsText(file);
});

// Save the autoPlayAudio setting when the checkbox is changed.
document.getElementById('autoPlayAudio').addEventListener('change', (e) => {
  saveSetting('autoPlayAudio', e.target.checked);
});