// Global variable to store fetched cards info
let fetchedCards = [];

// Helper function to guess MIME type based on filename extension
function getMimeType(filename) {
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

// Fetch decks and populate the deck dropdown using deckNames action
async function fetchDecks() {
  const ankiUrl = document.getElementById('url').value.trim();
  const deckSelect = document.getElementById('deckSelect');
  deckSelect.innerHTML = '<option value="">-- Loading decks --</option>';
  
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
    deckSelect.innerHTML = '';
    if (data.result && Array.isArray(data.result)) {
      data.result.forEach(deckName => {
        const option = document.createElement('option');
        option.value = deckName;
        option.text = deckName;
        deckSelect.appendChild(option);
      });
    } else {
      deckSelect.innerHTML = '<option value="">-- No decks found --</option>';
    }
  } catch (error) {
    deckSelect.innerHTML = '<option value="">-- Error loading decks --</option>';
  }
}

// Load cards from the selected deck using findCards and cardsInfo actions
async function loadCards() {
  const ankiUrl = document.getElementById('url').value.trim();
  const deckSelect = document.getElementById('deckSelect');
  const deckName = deckSelect.value;
  const cardSelect = document.getElementById('cardSelect');
  const resultDiv = document.getElementById('result');

  cardSelect.innerHTML = '<option value="">-- Loading cards --</option>';
  resultDiv.innerHTML = '';
  fetchedCards = [];
  
  if (!ankiUrl || !deckName) {
    alert('Please provide a valid Anki Connect URL and select a deck.');
    return;
  }
  
  try {
    // Use findCards to get card IDs for the selected deck
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
      cardSelect.innerHTML = '<option value="">-- No cards found --</option>';
      return;
    }
    
    // Use cardsInfo to get details for each card
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
      cardSelect.innerHTML = '<option value="">-- No card information retrieved --</option>';
      return;
    }
    
    fetchedCards = cardsInfoData.result;
    cardSelect.innerHTML = '<option value="">-- Select a card --</option>';
    fetchedCards.forEach(card => {
      const option = document.createElement('option');
      option.value = card.cardId; // cardId uniquely identifies the card
      // Use the first field's text (with HTML stripped) as a brief summary
      const fields = card.fields;
      const firstFieldName = Object.keys(fields)[0];
      const summary = fields[firstFieldName].value.replace(/<[^>]+>/g, '').substring(0, 20);
      option.text = `Card ${card.cardId} - ${summary}`;
      cardSelect.appendChild(option);
    });
  } catch (error) {
    cardSelect.innerHTML = `<option value="">-- Error loading cards --</option>`;
  }
}

// Automatically load decks when the popup loads
window.addEventListener('load', fetchDecks);

// When a deck is selected, automatically update the card dropdown
document.getElementById('deckSelect').addEventListener('change', loadCards);

// When a card is selected, parse its fields using a DOM parser to get image src values
document.getElementById('showImage').addEventListener('click', async () => {
  const ankiUrl = document.getElementById('url').value.trim();
  const cardSelect = document.getElementById('cardSelect');
  const resultDiv = document.getElementById('result');
  const selectedCardId = cardSelect.value;
  
  if (!ankiUrl || !selectedCardId) {
    alert('Please ensure you have selected an Anki Connect URL and a card.');
    return;
  }
  
  // Find the selected card object from fetchedCards
  const card = fetchedCards.find(c => c.cardId == selectedCardId);
  if (!card) {
    resultDiv.innerText = 'Selected card not found.';
    return;
  }
  
  // Combine all fields from the card into one HTML string
  let combinedHTML = '';
  Object.keys(card.fields).forEach(fieldName => {
    combinedHTML += card.fields[fieldName].value + ' ';
  });
  
  // Use a DOM parser approach instead of regex to extract all <img> src values
  const container = document.createElement('div');
  container.innerHTML = combinedHTML;
  const imgElements = container.querySelectorAll('img');
  let imageFilenames = [];
  imgElements.forEach(img => {
    // Directly use the src attribute; this will contain the full filename including literal quotes
    imageFilenames.push(img.getAttribute('src'));
  });
  
  if (imageFilenames.length === 0) {
    resultDiv.innerText = 'No images found in the selected card.';
    return;
  }
  
  // Choose one image at random (or simply the first if you prefer)
  const randomIndex = Math.floor(Math.random() * imageFilenames.length);
  const randomImageFilename = imageFilenames[randomIndex];
  console.log("Selected image filename:", randomImageFilename);
  
  // Retrieve the media file using retrieveMediaFile
  try {
    const mediaResponse = await fetch(ankiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'retrieveMediaFile',
        version: 6,
        params: { filename: randomImageFilename }
      })
    });
    const mediaData = await mediaResponse.json();
    
    if (!mediaData.result) {
      resultDiv.innerText = 'Failed to retrieve the media file. ' + (mediaData.error || '');
      console.error("Media response error:", mediaData);
      return;
    }
    
    // Build a data URL from the base64 result and display the image
    const mimeType = getMimeType(randomImageFilename);
    const dataUrl = `data:${mimeType};base64,${mediaData.result}`;
    resultDiv.innerHTML = '';
    const imgElem = document.createElement('img');
    imgElem.src = dataUrl;
    imgElem.alt = randomImageFilename;
    resultDiv.appendChild(imgElem);
    
  } catch (error) {
    resultDiv.innerText = 'Error: ' + error.message;
  }
});
