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
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    initIfEnabled(); // re-run if enabled when URL changes
  }
}, 1000);

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

function base64ToBlob(base64, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
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

  const imgElem = document.createElement("img");
  imgElem.alt = "Vocabulary Image";
  imgElem.style.maxWidth = "500px";
  imgElem.style.transition = "opacity 0.3s";
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

  imageContainer.appendChild(cardCountElem);
  imageContainer.appendChild(leftButton);
  imageContainer.appendChild(imgElem);
  imageContainer.appendChild(rightButton);
  // imageContainer.appendChild(deckNameElem); //uncomment to show deck name on cards

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
  };
}

// ------------------------------
// Setup Media Block (Navigation, etc.)
// ------------------------------
function setupMediaBlock(vid, jpdbData, cardIds, elements) {
  // Obsolete preloading functions have been removed. Media is now loaded
  // directly inside loadCard() for instant performance.
  removeExistingContent();

  if (cardIds.length < 2) {
    elements.leftButton.style.color = "grey";
    elements.rightButton.style.color = "grey";
    elements.leftButton.style.cursor = "default";
    elements.rightButton.style.cursor = "default";
    elements.leftButton.style.pointerEvents = "none";
    elements.rightButton.style.pointerEvents = "none";
  }

  let currentCardIndex = 0;

  async function getTokensForContext(contextText) {
    const apiKey = await getSetting("jpdbApiKey", null).catch((error) => {
      return null;
    });
    if (!apiKey) {
      return { tokens: [], vocabulary: [] };
    }
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
            "meanings",
          ],
        }),
      });
      const data = await response.json();
      return { tokens: data.tokens || [], vocabulary: data.vocabulary || [] };
    } catch (error) {
      return { tokens: [], vocabulary: [] };
    }
  }

  async function loadCard(index) {
    elements.cardCountElem.innerText = `${index + 1}/${cardIds.length}`;
    elements.cardCountElem.style.display = "block";

    // The audio element is now persistent. Get a direct reference.
    const audioElem = elements.audioElem;

    // Pause and reset the single audio element before loading new content.
    audioElem.pause();
    audioElem.currentTime = 0;
    audioElem.src = "";

    const cardId = cardIds[index];
    if (!jpdbData.cards || !jpdbData.cards[cardId]) {
      return;
    }
    const cardData = jpdbData.cards[cardId];

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

    // --- AUDIO HANDLING (Simplified) ---
    // Remove the audio button if it exists from a previous card
    const oldAudioBtn = document.getElementById("jpdb-media-audio-btn");
    if (oldAudioBtn) oldAudioBtn.remove();

    if (cardData.audio) {
      const audioBtn = document.createElement("a");
      audioBtn.id = "jpdb-media-audio-btn"; // Give button a unique ID
      audioBtn.className = "icon-link example-audio";
      audioBtn.href = "#";
      audioBtn.innerHTML =
        '<i class="ti ti-volume" style="color: #4b8dff;"></i>';
      audioBtn.addEventListener("click", (e) => {
        e.preventDefault();
        // The audio element is persistent, so this always works
        pauseOtherAudios(audioElem);
        audioElem.currentTime = 0;
        audioElem.play();
      });
      jpContainer.appendChild(audioBtn);

      // No need to create the audio element; we just use it.
      const playAudio = () => {
        getSetting("autoPlayAudio", false).then((autoPlay) => {
          if (autoPlay && audioElem.paused) {
            pauseOtherAudios(audioElem);
            audioElem.play().catch((error) => {});
          }
        });
      };

      if (cardData.mediaData && cardData.mediaData.audio) {
        const mimeAudio = getMimeType(cardData.audio);
        const blob = base64ToBlob(cardData.mediaData.audio, mimeAudio);
        audioElem.src = URL.createObjectURL(blob);
        playAudio();
      } else {
        fetchMediaFile(cardData.audio).then((audioData) => {
          if (audioData) {
            const mimeAudio = getMimeType(cardData.audio);
            audioElem.src = `data:${mimeAudio};base64,${audioData}`;
            playAudio();
          }
        });
      }
    }

    const jpSentence = document.createElement("div");
    jpSentence.className = "sentence";
    jpSentence.style.marginLeft = "0.3rem";
    jpSentence.style.fontSize = "22px";
    jpSentence.style.textAlign = "center";
    jpSentence.innerText = japaneseText;
    jpContainer.appendChild(jpSentence);

    // Clear the old text content and append the new
    elements.contextElem.innerHTML = "";
    elements.contextElem.appendChild(jpContainer);

    // --- Tokenizer and other logic remains the same ---
    if (japaneseText) {
      getTokensForContext(japaneseText).then((tokenData) => {
        const tokens = tokenData.tokens;
        const vocabulary = tokenData.vocabulary;
        let newContextHtml = "";
        let lastIndex = 0;
        tokens.sort((a, b) => a[1] - b[1]);
        tokens.forEach((token) => {
          const tokenStart = token[1];
          const tokenLength = token[2];
          const tokenEnd = tokenStart + tokenLength;
          newContextHtml += japaneseText.substring(lastIndex, tokenStart);
          const tokenText = japaneseText.substring(tokenStart, tokenEnd);
          if (token[3] !== null) {
            const vocabEntry = vocabulary[token[0]];
            if (vocabEntry && String(vocabEntry[0]) === String(vid)) {
              newContextHtml += `<span style="color: #4b8dff; font-weight: bold;">${tokenText}</span>`;
            } else {
              newContextHtml += tokenText;
            }
          } else {
            newContextHtml += tokenText;
          }
          lastIndex = tokenEnd;
        });
        newContextHtml += japaneseText.substring(lastIndex);
        jpSentence.innerHTML = newContextHtml;
      });
    }

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

    if (cardData.image) {
      elements.imgElem.style.height = "275px";
      elements.imgElem.style.objectFit = "contain";
      elements.imgElem.style.maxWidth = "100%";
      elements.imgElem.style.maxHeight = "100%";

      if (cardData.mediaData && cardData.mediaData.image) {
        const mimeImg = getMimeType(cardData.image);
        const blob = base64ToBlob(cardData.mediaData.image, mimeImg);
        elements.imgElem.src = URL.createObjectURL(blob);
        elements.imgElem.style.opacity = 1;
        elements.imgElem.style.display = "";
      } else {
        fetchMediaFile(cardData.image).then((imageData) => {
          if (imageData) {
            const mimeImg = getMimeType(cardData.image);
            const blob = base64ToBlob(imageData, mimeImg);
            elements.imgElem.src = URL.createObjectURL(blob);
            elements.imgElem.style.opacity = 1;
            elements.imgElem.style.display = "";
          } else {
            elements.imgElem.src = "";
            elements.imgElem.style.display = "none";
          }
        });
      }
    } else {
      elements.imgElem.src = "";
      elements.imgElem.style.display = "none";
    }
  }

  loadCard(currentCardIndex);

  elements.leftButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex - 1 + cardIds.length) % cardIds.length;
    loadCard(currentCardIndex);
  });
  elements.rightButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex + 1) % cardIds.length;
    loadCard(currentCardIndex);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      elements.leftButton.click();
    } else if (event.key === "ArrowRight") {
      elements.rightButton.click();
    }
  });
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

async function insertMediaInReview() {
  let vid = extractVidFromReviewUrl();
  if (!vid) {
    vid = extractVidFromPlainHtml();
  }
  if (!vid) return;

  const vidRecord = await getVidRecord(vid);
  if (!vidRecord || !vidRecord.cards || vidRecord.cards.length === 0) return;

  const cardIds = vidRecord.cards;
  const elements = createMediaBlock();
  const mainContent = document.querySelector(".result.vocabulary .vbox.gap");
  document.body.style.maxWidth = "75rem";
  if (mainContent) {
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
  } else {
    document.body.appendChild(elements.mediaBlock);
  }

  const cardsMapping = await getCardsMapping(cardIds);

  cardIds.sort((a, b) => {
    const cardA = cardsMapping[a];
    const cardB = cardsMapping[b];
    const isAPriority = cardA && cardA.deckName === "JPDB Media";
    const isBPriority = cardB && cardB.deckName === "JPDB Media";
    if (isAPriority && !isBPriority) return -1;
    if (!isAPriority && isBPriority) return 1;
    return 0;
  });

  setupMediaBlock(vid, { cards: cardsMapping }, cardIds, elements);
}

async function insertMediaInVocabularyPage() {
  const vid = extractVidFromVocabularyUrl();
  if (!vid) return;

  const vidRecord = await getVidRecord(vid);
  if (!vidRecord || !vidRecord.cards || vidRecord.cards.length === 0) return;

  const cardIds = vidRecord.cards;
  const elements = createMediaBlock();
  const meaningsElem = document.querySelector(".subsection-meanings");
  if (meaningsElem && meaningsElem.parentElement) {
    meaningsElem.parentElement.insertBefore(elements.mediaBlock, meaningsElem);
  } else {
    document.body.appendChild(elements.mediaBlock);
  }

  const cardsMapping = await getCardsMapping(cardIds);

  cardIds.sort((a, b) => {
    const cardA = cardsMapping[a];
    const cardB = cardsMapping[b];
    const isAPriority = cardA && cardA.deckName === "JPDB Media";
    const isBPriority = cardB && cardB.deckName === "JPDB Media";
    if (isAPriority && !isBPriority) return -1;
    if (!isAPriority && isBPriority) return 1;
    return 0;
  });

  setupMediaBlock(vid, { cards: cardsMapping }, cardIds, elements);
}

function init() {
  if (
    location.pathname.includes("/vocabulary/") &&
    !location.search.includes("c=")
  ) {
    insertMediaInVocabularyPage();
  } else {
    insertMediaInReview();
  }
}

function initIfEnabled() {
  getSetting("extensionEnabled", true).then((enabled) => {
    if (enabled === false) {
      // If extension is disabled, ensure no media block is present.
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
