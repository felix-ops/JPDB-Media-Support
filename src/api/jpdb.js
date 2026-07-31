export async function getVidsFromContext(contextTexts, apiKey) {
  // contextTexts is an array of Japanese texts (max length: 100)
  const jpdbUrl = "https://jpdb.io/api/v1/parse";

  try {
    const response = await fetch(jpdbUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
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

export async function getTokensForContext(vid, contextText, apiKey) {
  if (!contextText || !apiKey) return null;
  try {
    const response = await fetch("https://jpdb.io/api/v1/parse", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: contextText,
        token_fields: ["vocabulary_index", "position", "length"],
        position_length_encoding: "utf16",
        vocabulary_fields: ["vid"],
      }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in getTokensForContext:", error);
    return null;
  }
}
