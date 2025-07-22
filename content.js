// --- Utility Functions for Database Access via Messaging ---
function getSetting(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getSetting", key: key },
      (response) => {
        resolve(
          response && response.value !== undefined
            ? response.value
            : defaultValue
        );
      }
    );
  });
}

function getVidRecord(vid) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getVidRecord", vid: vid },
      (response) => {
        resolve(response && response.success ? response.result : null);
      }
    );
  });
}

function getCardsMapping(cardIds) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getCardsMapping", cardIds: cardIds },
      (response) => {
        resolve(response && response.success ? response.result : {});
      }
    );
  });
}

// ------------------------------
// URL Change Detection (Polling)
// ------------------------------
let lastHref = document.location.href;
const observer = new MutationObserver((mutations) => {
  mutations.forEach(() => {
    if (lastHref !== document.location.href) {
      lastHref = document.location.href;
      initIfEnabled(); // re-run if enabled when URL changes
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true });

// ------------------------------
// Utility Functions
// ------------------------------
function pauseOtherAudios(currentAudio) {
  const allAudios = document.querySelectorAll("audio");
  allAudios.forEach((audio) => {
    if (audio !== currentAudio && !audio.paused) {
      audio.pause();
    }
  });
}

function extractVidFromReviewUrl() {
  const params = new URLSearchParams(window.location.search);
  const cParam = params.get("c");
  if (cParam) {
    const parts = cParam.split(",");
    if (parts.length >= 2) {
      const vid = parts[1];
      return vid;
    }
  }
  return null;
}

function extractVidFromVocabularyUrl() {
  const parts = location.pathname.split("/");
  if (parts[1] === "vocabulary" && parts[2]) {
    return parts[2];
  }
  return null;
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(timer);
        resolve(element);
      } else {
        elapsed += interval;
        if (elapsed >= timeout) {
          clearInterval(timer);
          reject(new Error("Element not found: " + selector));
        }
      }
    }, interval);
  });
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

async function getAnkiUrl() {
  return getSetting("ankiUrl", "http://localhost:8765");
}

async function fetchMediaFile(filename) {
  const ankiUrl = await getAnkiUrl();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "fetchMediaFile", filename: filename, ankiUrl: ankiUrl },
      (response) => {
        if (response && response.success) {
          resolve(response.result);
        } else {
          resolve(null);
        }
      }
    );
  });
}

// --- UPDATED: Converts a Data URL (from background.js) or a raw base64 string (from fallback fetch) to a Blob ---
async function dataToBlob(data, mimeType) {
  // data can be a data URL "data:mime/type;base64,..." or just a base64 string
  const response = await fetch(
    data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`
  );
  return await response.blob();
}

function removeExistingContent() {
  getSetting("hideNativeSentence", true).then((hide) => {
    if (hide !== false) {
      const existingCardSentence = document.querySelector(
        ".card-sentence:not(.jpdb-inserted)"
      );
      if (existingCardSentence) {
        // remove native sentence elements only
        const existingTranslation = existingCardSentence.nextElementSibling;
        if (
          existingTranslation &&
          existingTranslation.querySelector(".sentence-translation")
        ) {
          existingTranslation.remove();
        }
        existingCardSentence.remove();

        const audioBtn = existingCardSentence.querySelector(
          "a.icon-link.example-audio:not(#jpdb-media-audio)"
        );
        if (audioBtn) {
          audioBtn.remove();
        }
      }
    }
  });
}

// ------------------------------
// Create Media Block
// ------------------------------
function createMediaBlock() {
  const mediaBlock = document.createElement("div");
  mediaBlock.id = "jpdb-media-block";
  mediaBlock.style.marginTop = "10px";
  mediaBlock.style.display = "flex";
  mediaBlock.style.flexDirection = "column";
  mediaBlock.style.alignItems = "center";

  const baseWidth = 650;
  mediaBlock.style.width = baseWidth + "px";
  mediaBlock.style.transformOrigin = "top right";

  getSetting("mediaBlockSize", "650").then((size) => {
    const scaleFactor = size / baseWidth;
    mediaBlock.style.transform = `scale(${scaleFactor})`;
  });

  const imageContainer = document.createElement("div");
  imageContainer.style.position = "relative";
  imageContainer.style.display = "flex";
  imageContainer.style.justifyContent = "center";
  imageContainer.style.alignItems = "center";
  imageContainer.style.width = "100%";
  // imageContainer.style.minHeight = "275px"; // Prevent layout shift

  const imgElem = document.createElement("img");
  imgElem.alt = "Vocabulary Image";
  imgElem.style.maxWidth = "500px";
  // The transition is removed for instantaneous swap
  // imgElem.style.transition = "opacity 0.3s";
  imgElem.style.display = "none";

  imgElem.addEventListener("click", () => {
    const audioElem = document.getElementById("jpdb-audio");
    if (audioElem) {
      pauseOtherAudios(audioElem);
      audioElem.currentTime = 0;
      audioElem.play();
    }
  });

  // --- NEW: Create the Deck Name Element ---
  const deckNameElem = document.createElement("div");
  deckNameElem.id = "jpdb-deck-name";
  deckNameElem.style.position = "absolute";
  deckNameElem.style.top = "5px";
  deckNameElem.style.left = "50%";
  deckNameElem.style.transform = "translateX(-50%)";
  deckNameElem.style.backgroundColor = "rgba(0,0,0,0.6)";
  deckNameElem.style.color = "#bbbbbb";
  deckNameElem.style.padding = "2px 8px";
  deckNameElem.style.borderRadius = "3px";
  deckNameElem.style.fontSize = "14px";
  deckNameElem.style.zIndex = "10";
  deckNameElem.style.display = "none";
  deckNameElem.style.userSelect = "none";
  deckNameElem.style.transition = "opacity 0.3s ease";

  const btnStyle = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "#007BFF",
    fontSize: "20px",
    cursor: "pointer",
    boxShadow: "none",
    outline: "none",
  };

  const leftButton = document.createElement("button");
  leftButton.innerHTML = "◀";
  Object.assign(leftButton.style, btnStyle, { left: "10px" });

  const rightButton = document.createElement("button");
  rightButton.innerHTML = "▶";
  Object.assign(rightButton.style, btnStyle, { right: "10px" });

  const cardCountElem = document.createElement("div");
  cardCountElem.id = "card-count";
  cardCountElem.style.position = "absolute";
  cardCountElem.style.bottom = "5px";
  cardCountElem.style.left = "50%";
  cardCountElem.style.transform = "translateX(-50%)";
  cardCountElem.style.backgroundColor = "rgba(0,0,0,0.6)";
  cardCountElem.style.color = "#bbbbbb";
  cardCountElem.style.padding = "2px 5px";
  cardCountElem.style.borderRadius = "3px";
  cardCountElem.style.fontSize = "14px";
  cardCountElem.style.zIndex = "10";
  cardCountElem.style.display = "block";
  cardCountElem.style.userSelect = "none";
  cardCountElem.innerText = `1/0`;
  cardCountElem.style.transition = "opacity 0.3s ease";
  const styleId = "jpdb-media-hover-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #${cardCountElem.id}:hover,
      #${deckNameElem.id}:hover {
        opacity: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // --- UPDATED: Create the Favorite Button ---
  const favoriteButton = document.createElement("button");
  favoriteButton.id = "jpdb-favorite-button";
  favoriteButton.innerHTML = "☆"; // Empty star
  favoriteButton.title = "Toggle Favorite (F)"; // Add shortcut hint
  // New styles for inline display
  favoriteButton.style.background = "transparent";
  favoriteButton.style.border = "none";
  favoriteButton.style.color = "#bbbbbb";
  favoriteButton.style.fontSize = "22px";
  favoriteButton.style.cursor = "pointer";
  favoriteButton.style.padding = "5px";
  favoriteButton.style.lineHeight = "1";

  imageContainer.appendChild(cardCountElem);
  imageContainer.appendChild(leftButton);
  imageContainer.appendChild(imgElem);
  imageContainer.appendChild(rightButton);
  // imageContainer.appendChild(deckNameElem);

  const contextElem = document.createElement("div");
  contextElem.style.display = "flex";
  contextElem.style.flexDirection = "column";
  contextElem.style.marginTop = "10px";

  // --- Create a single, persistent Audio Element ---
  const audioElem = document.createElement("audio");
  audioElem.id = "jpdb-audio";
  audioElem.style.display = "none";

  // Append it to the top-level mediaBlock so it's never destroyed
  mediaBlock.appendChild(audioElem);

  mediaBlock.appendChild(imageContainer);
  mediaBlock.appendChild(contextElem);

  return {
    mediaBlock,
    imageContainer,
    imgElem,
    leftButton,
    rightButton,
    cardCountElem,
    contextElem,
    audioElem,
    deckNameElem,
    favoriteButton,
  };
}

// ------------------------------
// Setup Media Block (Navigation, etc.)
// ------------------------------
async function setupMediaBlock(vid, jpdbData, cardIds, elements, vidRecord) {
  removeExistingContent();

  if (cardIds.length < 2) {
    elements.leftButton.style.color = "grey";
    elements.rightButton.style.color = "grey";
    elements.leftButton.style.cursor = "default";
    elements.rightButton.style.cursor = "default";
    elements.leftButton.style.pointerEvents = "none";
    elements.rightButton.style.pointerEvents = "none";
  }

  // --- OPTIMIZATION START ---
  const mediaCache = {}; // { cardId: { imageURL: '...', audioURL: '...' } }
  let currentCardIndex = 0;
  let favCards = vidRecord.favCards || [];

  // This function now handles both pre-cached data and fallback fetching.
  const processAndCacheCard = async (cardId) => {
    if (mediaCache[cardId]) return; // Already processed

    const cardData = jpdbData.cards[cardId];
    if (!cardData) return;

    let imageBase64 = null;
    let audioBase64 = null;

    // Source 1: Try to get media from the pre-fetched database cache.
    if (cardData.mediaData) {
      imageBase64 = cardData.mediaData.image;
      audioBase64 = cardData.mediaData.audio;
    }

    // Source 2: Fallback to fetching from Anki if data was missing.
    const imageFetchPromise =
      !imageBase64 && cardData.image
        ? fetchMediaFile(cardData.image)
        : Promise.resolve(null);
    const audioFetchPromise =
      !audioBase64 && cardData.audio
        ? fetchMediaFile(cardData.audio)
        : Promise.resolve(null);

    const [fetchedImage, fetchedAudio] = await Promise.all([
      imageFetchPromise,
      audioFetchPromise,
    ]);

    if (fetchedImage) imageBase64 = fetchedImage;
    if (fetchedAudio) audioBase64 = fetchedAudio;

    // Now, convert whatever data we found into Blobs.
    const imageBlobPromise = imageBase64
      ? dataToBlob(imageBase64, getMimeType(cardData.image))
      : Promise.resolve(null);
    const audioBlobPromise = audioBase64
      ? dataToBlob(audioBase64, getMimeType(cardData.audio))
      : Promise.resolve(null);

    const [imageBlob, audioBlob] = await Promise.all([
      imageBlobPromise,
      audioBlobPromise,
    ]);

    mediaCache[cardId] = {
      imageURL: imageBlob ? URL.createObjectURL(imageBlob) : null,
      audioURL: audioBlob ? URL.createObjectURL(audioBlob) : null,
    };
  };

  // Rewrite loadCard to be synchronous and use the cache.
  function loadCard(index) {
    elements.cardCountElem.innerText = `${index + 1}/${cardIds.length}`;
    elements.cardCountElem.style.display = "block";

    const audioElem = elements.audioElem;
    audioElem.pause();

    const cardId = cardIds[index];
    const cardData = jpdbData.cards[cardId];
    if (!cardData) return;

    // --- NEW: Update favorite button state ---
    const isFavorite = favCards.includes(cardId);
    elements.favoriteButton.innerHTML = isFavorite ? "★" : "☆"; // Filled vs empty star
    elements.favoriteButton.style.color = isFavorite ? "#4b8dff" : "#bbbbbb";

    // Instantly get URLs from cache.
    const cachedMedia = mediaCache[cardId] || {};
    audioElem.src = cachedMedia.audioURL || "";
    elements.imgElem.src = cachedMedia.imageURL || "";
    elements.imgElem.style.display = cachedMedia.imageURL ? "" : "none";

    // Start auto-play if configured
    getSetting("autoPlayAudio", false).then((autoPlay) => {
      if (autoPlay && audioElem.src) {
        audioElem.currentTime = 0;
        audioElem.play().catch(() => {});
      }
    });

    // --- The rest of the UI update logic from your original file ---
    const deckNameElem = elements.deckNameElem;
    if (cardData.deckName) {
      deckNameElem.innerText = cardData.deckName;
      deckNameElem.style.display = "block";
    } else {
      deckNameElem.style.display = "none";
    }

    const japaneseText = cardData.japaneseContext || "";
    const englishText = cardData.englishContext || "";

    const jpContainer = document.createElement("div");
    jpContainer.style.display = "flex";
    jpContainer.style.alignItems = "center";
    jpContainer.style.columnGap = "0.25rem";
    jpContainer.classList.add("card-sentence", "jpdb-inserted");
    jpContainer.style.justifyContent = "center";

    jpContainer.appendChild(elements.favoriteButton);

    const oldAudioBtn = document.getElementById("jpdb-media-audio-btn");
    if (oldAudioBtn) oldAudioBtn.remove();

    if (cardData.audio) {
      const audioBtn = document.createElement("a");
      audioBtn.id = "jpdb-media-audio-btn";
      audioBtn.className = "icon-link example-audio";
      audioBtn.href = "#";
      audioBtn.innerHTML =
        '<i class="ti ti-volume" style="color: #4b8dff;"></i>';
      audioBtn.addEventListener("click", (e) => {
        e.preventDefault();
        pauseOtherAudios(audioElem);
        audioElem.currentTime = 0;
        audioElem.play();
      });
      jpContainer.appendChild(audioBtn);
    }

    const jpSentence = document.createElement("div");
    jpSentence.className = "sentence";
    jpSentence.style.marginLeft = "0.3rem";
    jpSentence.style.fontSize = "22px";
    jpSentence.style.textAlign = "center";
    jpSentence.innerText = japaneseText;
    jpContainer.appendChild(jpSentence);

    elements.contextElem.innerHTML = "";
    elements.contextElem.appendChild(jpContainer);

    getTokensForContext(vid, japaneseText, jpSentence);

    getSetting("showEnglishSentence", true).then((showEnglish) => {
      if (showEnglish && englishText) {
        const translationContainer = document.createElement("div");
        translationContainer.style.display = "flex";
        translationContainer.style.justifyContent = "center";
        translationContainer.style.color = "#868686";
        const translationDiv = document.createElement("div");
        translationDiv.className = "sentence-translation";
        translationDiv.style.textAlign = "center";
        translationDiv.innerText = englishText;
        translationContainer.appendChild(translationDiv);
        elements.contextElem.appendChild(translationContainer);
      }
    });

    elements.imgElem.style.height = "275px";
    elements.imgElem.style.objectFit = "contain";
    elements.imgElem.style.maxWidth = "100%";
    elements.imgElem.style.maxHeight = "100%";
    elements.imgElem.style.opacity = 1;
  }

  // --- NEW: Add event listener for the favorite button ---
  elements.favoriteButton.addEventListener("click", () => {
    const currentCardId = cardIds[currentCardIndex];
    if (!currentCardId) return;

    // Optimistically update UI
    const isCurrentlyFavorite = favCards.includes(currentCardId);
    elements.favoriteButton.innerHTML = isCurrentlyFavorite ? "☆" : "★";
    elements.favoriteButton.style.color = isCurrentlyFavorite
      ? "#bbbbbb"
      : "#4b8dff";

    // Send message to background to update DB
    chrome.runtime.sendMessage(
      { action: "toggleFavoriteCard", vid: vid, cardId: currentCardId },
      (response) => {
        if (response && response.success) {
          // Update local state to match DB state
          if (response.isFavorite) {
            if (!favCards.includes(currentCardId)) {
              favCards.unshift(currentCardId);
            }
          } else {
            favCards = favCards.filter((id) => id !== currentCardId);
          }
        } else {
          // Revert UI on failure
          const isNowFavorite = favCards.includes(currentCardId);
          elements.favoriteButton.innerHTML = isNowFavorite ? "★" : "☆";
          elements.favoriteButton.style.color = isNowFavorite
            ? "#4b8dff"
            : "#bbbbbb";
          console.error("Failed to toggle favorite:", response?.error);
        }
      }
    );
  });

  // Set up navigation
  elements.leftButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex - 1 + cardIds.length) % cardIds.length;
    loadCard(currentCardIndex);
  });
  elements.rightButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex + 1) % cardIds.length;
    loadCard(currentCardIndex);
  });

  // --- UPDATED: Keydown listener for arrows and favorite toggle ---
  document.addEventListener("keydown", (event) => {
    if (document.getElementById("jpdb-media-block")) {
      if (event.key === "ArrowLeft") elements.leftButton.click();
      if (event.key === "ArrowRight") elements.rightButton.click();
      if (event.key === "f" || event.key === "F") {
        const activeElem = document.activeElement;
        const tagName = activeElem.tagName.toLowerCase();

        // Block only if the user is in a text entry field.
        // This allows the shortcut on buttons, divs, etc.
        if (
          tagName === "textarea" ||
          (tagName === "input" &&
            /text|email|password|search|url/.test(activeElem.type))
        ) {
          return;
        }

        event.preventDefault(); // Prevent default browser actions (e.g., find)
        elements.favoriteButton.click();
      }
    }
  });

  // Setup memory cleanup
  const observer = new MutationObserver(() => {
    if (!document.getElementById("jpdb-media-block")) {
      Object.values(mediaCache).forEach(({ imageURL, audioURL }) => {
        if (imageURL) URL.revokeObjectURL(imageURL);
        if (audioURL) URL.revokeObjectURL(audioURL);
      });
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // --- Prioritized Preloading Execution ---
  // 1. Process and load the first card IMMEDIATELY.
  if (cardIds.length > 0) {
    processAndCacheCard(cardIds[0]).then(() => {
      loadCard(0);
      // 2. Then, process the rest of the cards in the background.
      if (cardIds.length > 1) {
        Promise.all(cardIds.slice(1).map(processAndCacheCard));
      }
    });
  }
  // --- OPTIMIZATION END ---
}

// This helper function is now fire-and-forget
async function getTokensForContext(vid, contextText, elementToUpdate) {
  if (!contextText) return;
  try {
    const apiKey = await getSetting("jpdbApiKey", null);
    if (!apiKey) return;
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
    let newHtml = "";
    let lastIndex = 0;
    data.tokens
      .sort((a, b) => a[1] - b[1])
      .forEach(([vocabIndex, start, length]) => {
        newHtml += contextText.substring(lastIndex, start);
        const tokenText = contextText.substring(start, start + length);
        const isTarget =
          data.vocabulary[vocabIndex] &&
          String(data.vocabulary[vocabIndex][0]) === String(vid);
        newHtml += isTarget
          ? `<span style="color: #4b8dff; font-weight: bold;">${tokenText}</span>`
          : tokenText;
        lastIndex = start + length;
      });
    newHtml += contextText.substring(lastIndex);
    elementToUpdate.innerHTML = newHtml;
  } catch {
    elementToUpdate.innerHTML = contextText; // Fallback
  }
}

function extractVidFromPlainHtml() {
  const plainLink = document.querySelector('a.plain[href^="/vocabulary/"]');
  if (plainLink) {
    const href = plainLink.getAttribute("href");
    const match = href.match(/\/vocabulary\/(\d+)\//);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function insertMediaInReview() {
  let vid = extractVidFromReviewUrl();
  if (!vid) {
    vid = extractVidFromPlainHtml();
  }
  if (!vid) return;

  const vidRecord = await getVidRecord(vid);
  if (!vidRecord || !vidRecord.cards || vidRecord.cards.length === 0) return;

  const favCards = vidRecord.favCards || [];
  const regularCards = vidRecord.cards.filter((id) => !favCards.includes(id));
  const orderedCardIds = [...favCards, ...regularCards];

  const cardsMapping = await getCardsMapping(orderedCardIds);
  const cardIds = orderedCardIds.filter((id) => cardsMapping[id]);

  if (cardIds.length === 0) return;

  const elements = createMediaBlock();
  const mainContent = await waitForElement(".result.vocabulary .vbox.gap");
  document.body.style.maxWidth = "75rem";
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "row";
  wrapper.style.alignItems = "flex-start";
  wrapper.style.width = "100%";

  mainContent.parentNode.insertBefore(wrapper, mainContent);
  wrapper.appendChild(mainContent);
  mainContent.style.flex = "1";
  wrapper.appendChild(elements.mediaBlock);
  elements.mediaBlock.style.marginLeft = "40px";

  // Sorting based on deck name is handled within the original cardIds, not re-applied here.
  // The primary sorting is now fav vs. non-fav.
  setupMediaBlock(vid, { cards: cardsMapping }, cardIds, elements, vidRecord);
}

async function insertMediaInVocabularyPage() {
  const vid = extractVidFromVocabularyUrl();
  if (!vid) return;

  const vidRecord = await getVidRecord(vid);
  if (!vidRecord || !vidRecord.cards || vidRecord.cards.length === 0) return;

  const favCards = vidRecord.favCards || [];
  const regularCards = vidRecord.cards.filter((id) => !favCards.includes(id));
  const orderedCardIds = [...favCards, ...regularCards];

  const cardsMapping = await getCardsMapping(orderedCardIds);
  const cardIds = orderedCardIds.filter((id) => cardsMapping[id]);

  if (cardIds.length === 0) return;

  const elements = createMediaBlock();
  const meaningsElem = await waitForElement(".subsection-meanings");
  meaningsElem.parentElement.insertBefore(elements.mediaBlock, meaningsElem);

  setupMediaBlock(vid, { cards: cardsMapping }, cardIds, elements, vidRecord);
}

function init() {
  if (document.getElementById("jpdb-media-block")) return;

  if (
    location.pathname.includes("/vocabulary/") &&
    !location.search.includes("c=")
  ) {
    insertMediaInVocabularyPage().catch(console.error);
  } else {
    insertMediaInReview().catch(console.error);
  }
}

function initIfEnabled() {
  getSetting("extensionEnabled", true).then((enabled) => {
    if (enabled === false) {
      const existingBlock = document.getElementById("jpdb-media-block");
      if (existingBlock) existingBlock.remove();
      return;
    }
    init();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIfEnabled);
} else {
  initIfEnabled();
}
