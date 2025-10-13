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
  // Fallback: Parse from front-page DOM when URL lacks c= (front of card)
  try {
    // 1) Look for the hidden answer box's vocabulary link
    const plain = document.querySelector(".answer-box .plain");
    if (plain) {
      const link = plain.querySelector('a[href^="/vocabulary/"]');
      if (link && link.getAttribute("href")) {
        const m = link.getAttribute("href").match(/\/vocabulary\/(\d+)\//);
        if (m) return m[1];
      }
    }
    // 2) Some front pages include a prefetch review link with c=...; try extracting from there
    const prefetch = document.querySelector(
      'link[rel="prefetch"][href*="/review?"]'
    );
    if (prefetch) {
      const href = prefetch.getAttribute("href");
      const url = new URL(href, location.origin);
      const c = url.searchParams.get("c");
      if (c) {
        const parts2 = c.split(",");
        if (parts2.length >= 2) return parts2[1];
      }
    }
    // 3) As a last resort, scan for any anchor matching /vocabulary/{vid}/
    const anyVocab = document.querySelector('a[href^="/vocabulary/"]');
    if (anyVocab) {
      const m2 = anyVocab.getAttribute("href").match(/\/vocabulary\/(\d+)\//);
      if (m2) return m2[1];
    }
  } catch {}
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

function getMediaForCard(cardId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getMediaForCard", cardId: cardId },
      (response) => {
        resolve(response && response.success ? response.mediaData : null);
      }
    );
  });
}

function formatTranslatedText(text) {
  if (!text) return "";
  const tempElement = document.createElement("textarea");
  tempElement.innerHTML = text;
  let decodedText = tempElement.value;
  return decodedText.replace(/\s+/g, " ").trim();
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

function removeExistingContent({ isFrontPage }) {
  // Hide native sentence on back/vocab pages via existing flag; on front page via dedicated flag
  const settingKey = isFrontPage
    ? "hideNativeSentenceFront"
    : "hideNativeSentence";
  getSetting(settingKey, false).then((hide) => {
    if (hide !== false) {
      const existingCardSentence = document.querySelector(
        ".card-sentence:not(.jpdb-inserted)"
      );
      if (existingCardSentence) {
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

function injectResponsiveStyles() {
  const styleId = "jpdb-responsive-styles";
  // Avoid injecting the same styles multiple times
  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  // Define a breakpoint. 768px is a good starting point for this layout.
  const breakpoint = "768px";

  style.textContent = `
    /* Wrapper for both JPDB content and our media block */
    #jpdb-media-wrapper {
      display: flex;
      flex-direction: row; /* Side-by-side on desktop */
      align-items: flex-start;
      width: 100%;
      gap: 0px; /* Replaces margin-left for better spacing */
    }

    #jpdb-media-block {
      position: static;
      top: 20px;
    }

    /* --- MOBILE STYLES --- */
    @media (max-width: ${breakpoint}) {
      #jpdb-media-wrapper {
        flex-direction: column; /* Stack elements vertically on smaller screens */
        gap: 25px;
      }

      #jpdb-media-block {
        /* This is the key part: 'order: -1' moves our media block
           to the TOP of the flex container visually. */
        order: -1;
        position: relative; /* Un-stick it on mobile */
        top: 0;
        width: 100%; /* Make it full-width on mobile */
        max-width: 100% !important; /* Ensure it doesn't exceed screen width */
        margin-left: 0 !important; /* Override any old inline styles */
      }
    }
  `;
  document.head.appendChild(style);
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
      audioElem.play().catch(() => {});
    }
  });

  //  Create the Deck Name Element ---
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
  // favoriteButton.title = "Toggle Favorite"; // Add shortcut hint
  favoriteButton.style.background = "rgba(0, 0, 0, 0)";
  favoriteButton.style.color = "#bbbbbb";

  Object.assign(favoriteButton.style, btnStyle, {
    left: "auto", // override the 'left' from btnStyle if not needed
    right: "auto", // override the 'right' from btnStyle
    position: "relative", // Keep it in the document flow
    top: "auto", // reset top
    transform: "none", // reset transform
    fontSize: "22px",
    padding: "5px",
    lineHeight: "0",
  });

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
async function setupMediaBlock(
  vid,
  jpdbData,
  cardIds,
  elements,
  vidRecord,
  options = {}
) {
  const { isFrontPage = false } = options;
  removeExistingContent({ isFrontPage });

  if (cardIds.length < 2) {
    elements.rightButton.style.color = "grey";
    elements.rightButton.style.cursor = "default";
    elements.rightButton.style.pointerEvents = "none";
    elements.leftButton.style.color = "grey";
    elements.leftButton.style.cursor = "default";
    elements.leftButton.style.pointerEvents = "none";
  }

  const mediaCache = {}; // { cardId: { imageURL: '...', audioURL: '...' } }
  let currentCardIndex = 0;
  let favCards = vidRecord.favCards || [];

  const processAndCacheCard = async (cardId) => {
    if (mediaCache[cardId] || !cardId) return; // Already cached or invalid ID

    const cardData = jpdbData.cards[cardId];
    if (!cardData) return;

    // To prevent multiple simultaneous fetches for the same card,
    // we mark it as "caching in progress" immediately.
    mediaCache[cardId] = { imageURL: null, audioURL: null };

    const mediaFromDB = await getMediaForCard(cardId);
    let imageBase64 = mediaFromDB?.image;
    let audioBase64 = mediaFromDB?.audio;

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

    // Update the cache with the final Object URLs
    mediaCache[cardId] = {
      imageURL: imageBlob ? URL.createObjectURL(imageBlob) : null,
      audioURL: audioBlob ? URL.createObjectURL(audioBlob) : null,
    };

    // Auto-display media if this card is currently being viewed
    if (
      currentCardIndex < cardIds.length &&
      cardIds[currentCardIndex] === cardId
    ) {
      loadMediaContent(cardId);
    }
  };

  /**
   * Pre-loads a window of cards around the current index.
   */
  function preloadSurroundingCards(currentIndex) {
    const PRELOAD_WINDOW = 10;
    const totalCards = cardIds.length;
    if (totalCards <= 1) return;

    const cardIdsToPreload = [];

    // Gather IDs alternating between forward and backward cards
    for (let i = 1; i <= PRELOAD_WINDOW; i++) {
      // Add forward card
      const forwardIndex = (currentIndex + i) % totalCards;
      const forwardCardId = cardIds[forwardIndex];
      if (forwardCardId && !mediaCache[forwardCardId]) {
        cardIdsToPreload.push(forwardCardId);
      }

      // Add backward card
      const backwardIndex = (currentIndex - i + totalCards) % totalCards;
      const backwardCardId = cardIds[backwardIndex];
      if (backwardCardId && !mediaCache[backwardCardId]) {
        cardIdsToPreload.push(backwardCardId);
      }
    }

    // Asynchronously process each unique card ID in the preload window
    for (const cardId of cardIdsToPreload) {
      // Fire-and-forget the caching process.
      processAndCacheCard(cardId).catch(console.error);
    }
  }

  async function displayCard(index) {
    const cardId = cardIds[index];
    if (!cardId) return;

    // 1. Show text content immediately
    const cardData = jpdbData.cards[cardId];
    loadTextContent(cardData, index);

    // 2. Fetch media for the current card if it's not already cached
    if (!mediaCache[cardId]) {
      await processAndCacheCard(cardId);
    } else {
      // 3. If media is already cached, display it immediately
      loadMediaContent(cardId);
    }

    // 4. Trigger the advanced pre-caching for surrounding cards
    preloadSurroundingCards(index);
  }

  function loadTextContent(cardData, index) {
    if (!cardData) return;

    currentCardIndex = index;
    elements.cardCountElem.innerText = `${index + 1}/${cardIds.length}`;
    elements.cardCountElem.style.display = "block";

    // Pause audio and clear media from view while loading
    elements.audioElem.pause();
    elements.imgElem.style.display = "none";
    elements.imgElem.src = "";
    elements.audioElem.src = "";

    const cardId = cardData.cardId;
    const isFavorite = favCards.includes(cardId);
    elements.favoriteButton.innerHTML = isFavorite ? "★" : "☆";
    elements.favoriteButton.style.color = isFavorite ? "#4b8dff" : "#bbbbbb";

    const deckNameElem = elements.deckNameElem;
    if (cardData.deckName) {
      deckNameElem.innerText = cardData.deckName;
      deckNameElem.style.display = "block";
    } else {
      deckNameElem.style.display = "none";
    }

    const japaneseText = cardData.japaneseContext || "";
    const englishText = formatTranslatedText(cardData.englishContext || "");

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
        pauseOtherAudios(elements.audioElem);
        elements.audioElem.currentTime = 0;
        elements.audioElem.play();
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

    // On front page, translation is always disabled
    const allowTranslation = isFrontPage ? false : true;
    getSetting("showEnglishSentence", true).then((showEnglish) => {
      if (allowTranslation && showEnglish && englishText) {
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

  function loadMediaContent(cardId) {
    const cachedMedia = mediaCache[cardId];
    if (!cachedMedia) return;

    const audioElem = elements.audioElem;
    audioElem.src = cachedMedia.audioURL || "";
    elements.imgElem.src = cachedMedia.imageURL || "";
    if (isFrontPage) {
      getSetting("showImageOnFront", false).then((showImg) => {
        elements.imgElem.style.display =
          showImg && cachedMedia.imageURL ? "block" : "none";
      });
    } else {
      elements.imgElem.style.display = cachedMedia.imageURL ? "block" : "none";
    }

    const autoPlayKey = isFrontPage ? "autoPlayFront" : "autoPlayAudio";
    getSetting(autoPlayKey, false).then((autoPlay) => {
      if (!autoPlay || !audioElem.src) return;
      audioElem.currentTime = 0;
      audioElem.play().catch(() => {});
    });
  }

  // --- Event Listeners ---
  elements.favoriteButton.addEventListener("click", () => {
    const currentCardId = cardIds[currentCardIndex];
    if (!currentCardId) return;

    const isCurrentlyFavorite = favCards.includes(currentCardId);
    elements.favoriteButton.innerHTML = isCurrentlyFavorite ? "☆" : "★";
    elements.favoriteButton.style.color = isCurrentlyFavorite
      ? "#bbbbbb"
      : "#4b8dff";

    chrome.runtime.sendMessage(
      { action: "toggleFavoriteCard", vid: vid, cardId: currentCardId },
      (response) => {
        if (response && response.success) {
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

  elements.leftButton.addEventListener("click", () => {
    const newIndex = (currentCardIndex - 1 + cardIds.length) % cardIds.length;
    displayCard(newIndex);
  });

  elements.rightButton.addEventListener("click", () => {
    const newIndex = (currentCardIndex + 1) % cardIds.length;
    displayCard(newIndex);
  });

  document.addEventListener("keydown", (event) => {
    if (document.getElementById("jpdb-media-block")) {
      if (event.key === "ArrowLeft") elements.leftButton.click();
      if (event.key === "ArrowRight") elements.rightButton.click();
      if (event.key === "f" || event.key === "F") {
        const activeElem = document.activeElement;
        const tagName = activeElem.tagName.toLowerCase();
        if (
          tagName === "textarea" ||
          (tagName === "input" &&
            /text|email|password|search|url/.test(activeElem.type))
        ) {
          return;
        }
        event.preventDefault();
        elements.favoriteButton.click();
      }
      if (event.key === "a" || event.key === "A") {
        const activeElem = document.activeElement;
        const tagName = activeElem.tagName.toLowerCase();
        if (
          tagName === "textarea" ||
          (tagName === "input" &&
            /text|email|password|search|url/.test(activeElem.type))
        ) {
          return;
        }
        event.preventDefault();
        pauseOtherAudios(elements.audioElem);
        elements.audioElem.currentTime = 0;
        elements.audioElem.play().catch(() => {});
      }
    }
  });

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

  if (cardIds.length > 0) {
    displayCard(0);
  }
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

  // Decide front/back by presence of c= param; front page has no c
  const isFrontPage =
    !new URLSearchParams(window.location.search).has("c") &&
    !document.querySelector(".subsection-meanings");

  if (isFrontPage) {
    // Check settings BEFORE creating/inserting any DOM to avoid flicker
    const [showImg, showSentence] = await Promise.all([
      getSetting("showImageOnFront", false),
      getSetting("showSentenceOnFront", false),
    ]);
    if (!showImg && !showSentence) {
      // Nothing to render on front page; keep layout untouched
      return;
    }

    const elements = createMediaBlock();
    // Insert outside and directly below the review-hidden container on the front page
    let anchor = document.querySelector(".review-hidden");
    if (!anchor) {
      anchor =
        document.querySelector(".answer-box") ||
        document.querySelector(".review-button-group") ||
        document.querySelector("#a") ||
        document.body;
    }
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(elements.mediaBlock, anchor.nextSibling);
    }

    if (!showImg) elements.imgElem.style.display = "none";
    if (!showSentence) elements.contextElem.style.display = "none";

    setupMediaBlock(
      vid,
      { cards: cardsMapping },
      cardIds,
      elements,
      vidRecord,
      { isFrontPage: true }
    );
    return;
  }

  // Back page layout (keep previous wrapper SxS)
  injectResponsiveStyles();
  const elements = createMediaBlock();
  const mainContent = await waitForElement(".result.vocabulary .vbox.gap");
  document.body.style.maxWidth = "75rem";
  const wrapper = document.createElement("div");
  wrapper.id = "jpdb-media-wrapper";

  mainContent.parentNode.insertBefore(wrapper, mainContent);
  wrapper.appendChild(mainContent);
  mainContent.style.flex = "1";
  wrapper.appendChild(elements.mediaBlock);

  setupMediaBlock(vid, { cards: cardsMapping }, cardIds, elements, vidRecord, {
    isFrontPage: false,
  });
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
  const mainContent = await waitForElement(".subsection-meanings");

  const wrapper = document.createElement("div");
  wrapper.id = "jpdb-media-wrapper";

  mainContent.parentNode.insertBefore(wrapper, mainContent);
  wrapper.appendChild(elements.mediaBlock);
  wrapper.appendChild(mainContent);

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

    // Check if auto-sync is enabled and trigger it
    checkAndTriggerAutoSync();

    init();
  });
}

// Auto-sync functionality
let autoSyncCooldown = false;
const AUTO_SYNC_COOLDOWN_TIME = 30000; // 30 seconds

async function checkAndTriggerAutoSync() {
  if (autoSyncCooldown) return;

  try {
    const autoSyncEnabled = await getSetting("autoSync", false);
    if (!autoSyncEnabled) return;

    // Get auto-sync settings from background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAutoSyncSettings" }, resolve);
    });

    if (!response || !response.success || !response.result) return;

    const settings = response.result;

    // Validate required settings
    if (
      !settings.autoSyncEnabled ||
      !settings.deckName ||
      !settings.jpdbApiKey ||
      !settings.japaneseField
    ) {
      return;
    }

    // Trigger auto-sync in background
    chrome.runtime.sendMessage(
      {
        action: "performAutoSync",
        params: {
          deckName: settings.deckName,
          ankiUrl: settings.ankiUrl,
          jpdbApiKey: settings.jpdbApiKey,
          japaneseField: settings.japaneseField,
          englishField: settings.englishField,
          imageField: settings.imageField,
          audioField: settings.audioField,
          shouldFetchMedia: settings.shouldFetchMedia,
        },
      },
      (response) => {}
    );

    // Set cooldown to prevent frequent auto-syncs
    autoSyncCooldown = true;
    setTimeout(() => {
      autoSyncCooldown = false;
    }, AUTO_SYNC_COOLDOWN_TIME);
  } catch (error) {
    console.error("Auto-sync check failed:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIfEnabled);
} else {
  initIfEnabled();
}
