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
    ['jpdbApiKey', 'selectedDeck', 'selectedContextField', 'selectedImageField', 'selectedAudioField'],
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
    console.log("findCards response:", findCardsData);
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
    console.log("cardsInfo response:", cardsInfoData);
    if (!cardsInfoData.result || cardsInfoData.result.length === 0) {
      alert('Failed to retrieve card information.');
      return;
    }
    
    fetchedCards = cardsInfoData.result;
    
    // Populate the field dropdowns using fields from the first card (assumes uniformity)
    const firstCard = fetchedCards[0];
    const fieldNames = Object.keys(firstCard.fields);
    populateFieldDropdown('contextFieldSelect', fieldNames);
    populateFieldDropdown('imageFieldSelect', fieldNames);
    populateFieldDropdown('audioFieldSelect', fieldNames);
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
  // Use the API key entered by the user
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
    // From the response, extract vocabulary ids.
    if (data.vocabulary && Array.isArray(data.vocabulary)) {
      return data.vocabulary.map(vocab => String(vocab[0]));
    }
  } catch (error) {
    console.error('Error fetching JPDB data:', error);
  }
  return [];
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
  
  let dataJson = {
    cards: {},
    vid: {}
  };
  
  progressBar.style.display = 'block';
  progressBar.value = 0;
  
  const totalCards = fetchedCards.length;
  
  // Process each card sequentially
  for (let i = 0; i < totalCards; i++) {
    const card = fetchedCards[i];
    const cardId = card.cardId;  // Unique card id
    const contextText = card.fields[contextField].value.trim();
    const imageText = card.fields[imageField].value.trim();
    const audioText = card.fields[audioField].value.trim();
    
    // Delay of 0.5 seconds per card
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get vocabulary ids by calling the JPDB API with the context text.
    let vids = [];
    if (contextText) {
      vids = await getVidsFromContext(contextText);
    }
    
    // Save this card's data
    dataJson.cards[cardId] = {
      context: contextText,
      image: imageText,
      audio: audioText,
      vids: vids
    };
    
    // Update the reverse mapping: for each vid, add this card id.
    vids.forEach(vid => {
      if (!dataJson.vid[vid]) {
        dataJson.vid[vid] = { cards: [] };
      }
      dataJson.vid[vid].cards.push(cardId);
    });
    
    // Update progress bar
    progressBar.value = Math.round(((i + 1) / totalCards) * 100);
  }
  
  // Hide progress bar after completion
  progressBar.style.display = 'none';
  
  // Store the JSON in extension local storage
  chrome.storage.local.set({ jpdbData: dataJson }, () => {
    resultDiv.innerText = 'Data fetched and stored successfully!';
    console.log('Stored data:', dataJson);
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
