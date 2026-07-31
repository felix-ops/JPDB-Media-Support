export async function fetchDecks(ankiUrl) {
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
    return data.result || [];
  } catch (error) {
    console.error("Error fetching Anki decks:", error);
    return [];
  }
}

export async function fetchAnkiCards(deckName, ankiUrl) {
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

export async function retrieveMediaFilesInBatch(filenames, ankiUrl) {
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

export async function retrieveSingleMediaFile(filename, ankiUrl) {
  try {
    const response = await fetch(ankiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retrieveMediaFile",
        version: 6,
        params: { filename: filename },
      }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message };
  }
}
