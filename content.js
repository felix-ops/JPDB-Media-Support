console.log("JPDB Content Script Loaded");

// ------------------------------
// URL Change Detection (Polling)
// ------------------------------
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    console.log("URL changed from", lastUrl, "to", location.href);
    lastUrl = location.href;
    init(); // re‑run init when URL changes
  }
}, 1000);

// ------------------------------
// Utility Functions
// ------------------------------

// For review page, extract vid from URL parameter "c"
function extractVidFromReviewUrl() {
  const params = new URLSearchParams(window.location.search);
  const cParam = params.get('c'); // e.g. "vf,1550190,2786244425"
  console.log("Parameter c:", cParam);
  if (cParam) {
    const parts = cParam.split(',');
    if (parts.length >= 2) {
      const vid = parts[1];
      console.log("Extracted vid from review URL:", vid);
      return vid;
    }
  }
  console.warn("Could not extract vid from URL.");
  return null;
}

// For vocabulary page, extract vid from the path
function extractVidFromVocabularyUrl() {
  const parts = location.pathname.split("/");
  // Expected pattern: /vocabulary/{vid}/...
  if (parts[1] === "vocabulary" && parts[2]) {
    console.log("Extracted vid from vocabulary URL:", parts[2]);
    return parts[2];
  }
  console.warn("Could not extract vid from vocabulary URL.");
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
  if (filename.match(/\.(jpg|jpeg)$/i)) return "image/jpeg";
  if (filename.match(/\.png$/i)) return "image/png";
  if (filename.match(/\.gif$/i)) return "image/gif";
  if (filename.match(/\.mp3$/i)) return "audio/mpeg";
  if (filename.match(/\.ogg$/i)) return "audio/ogg";
  return "application/octet-stream";
}

function getAnkiUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("ankiUrl", (data) => {
      resolve(data.ankiUrl || "http://localhost:8765");
    });
  });
}

async function fetchMediaFile(filename) {
  const ankiUrl = await getAnkiUrl();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "fetchMediaFile", filename: filename, ankiUrl: ankiUrl },
      (response) => {
        if (response && response.success) {
          console.log(`Fetched media file for "${filename}"`);
          resolve(response.result);
        } else {
          console.error("Error fetching media file for", filename, response ? response.error : "No response");
          resolve(null);
        }
      }
    );
  });
}

function base64ToBlob(base64, contentType = '', sliceSize = 512) {
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

// ------------------------------
// Hide native website content
// ------------------------------
function removeExistingContent() {
  const existingCardSentence = document.querySelector(".card-sentence");
  if (existingCardSentence) {
    const existingTranslation = existingCardSentence.nextElementSibling;
    if (existingTranslation && existingTranslation.querySelector(".sentence-translation")) {
      existingTranslation.remove();
    }
    existingCardSentence.remove();
  }
  const nativeAudioBtns = document.querySelectorAll("a.icon-link.example-audio:not(#jpdb-media-audio)");
  nativeAudioBtns.forEach(btn => btn.remove());
}

// ------------------------------
// Common Media Block Code (for both review & vocabulary pages)
// ------------------------------
function createMediaBlock() {
  // Create the media block container and inner elements (image container, controls, counter, context)
  const mediaBlock = document.createElement("div");
  mediaBlock.id = "jpdb-media-block";
  mediaBlock.style.marginTop = "10px";
  mediaBlock.style.display = "flex";
  mediaBlock.style.flexDirection = "column";
  mediaBlock.style.alignItems = "center";

  const imageContainer = document.createElement("div");
  imageContainer.style.position = "relative";
  imageContainer.style.display = "flex";
  imageContainer.style.justifyContent = "center";
  imageContainer.style.alignItems = "center";
  imageContainer.style.width = "100%";

  const imgElem = document.createElement("img");
  imgElem.alt = "Vocabulary Image";
  imgElem.style.maxWidth = "64%";
  imgElem.style.transition = "opacity 0.3s";
  // For smooth transitions, hide only on first load.
  imgElem.style.display = "none";

  const btnStyle = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "#007BFF",
    fontSize: "24px",
    cursor: "pointer",
    boxShadow: "none",
    outline: "none"
  };

  const leftButton = document.createElement("button");
  leftButton.innerHTML = "&#9664;";
  Object.assign(leftButton.style, btnStyle, { left: "10px" });

  const rightButton = document.createElement("button");
  rightButton.innerHTML = "&#9654;";
  Object.assign(rightButton.style, btnStyle, { right: "10px" });

  // If only one card, disable buttons.
  // (This logic can be reused for both pages.)
  // Counter element:
  const cardCountElem = document.createElement("div");
  cardCountElem.id = "card-count";
  cardCountElem.style.position = "absolute";
  cardCountElem.style.bottom = "5px";
  cardCountElem.style.left = "50%";
  cardCountElem.style.transform = "translateX(-50%)";
  cardCountElem.style.backgroundColor = "rgba(0,0,0,0.6)"; // your updated style
  cardCountElem.style.color = "#bbbbbb"; // your updated style
  cardCountElem.style.padding = "2px 5px";
  cardCountElem.style.borderRadius = "3px";
  cardCountElem.style.fontSize = "14px";
  cardCountElem.style.zIndex = "10";
  // Initially hide the counter until first image loads.
  cardCountElem.style.display = "none";
  cardCountElem.innerText = `1/0`; // will update later

  imageContainer.appendChild(cardCountElem);
  imageContainer.appendChild(leftButton);
  imageContainer.appendChild(imgElem);
  imageContainer.appendChild(rightButton);

  const contextElem = document.createElement("div");
  contextElem.style.display = "flex";
  contextElem.style.flexDirection = "column";
  contextElem.style.marginTop = "10px";

  mediaBlock.appendChild(imageContainer);
  mediaBlock.appendChild(contextElem);

  return { mediaBlock, imageContainer, imgElem, leftButton, rightButton, cardCountElem, contextElem };
}

// The bulk of your media block code (preloading images/audio, toggling, smooth transitions)
// is the same for both pages. For brevity, we encapsulate it in a common function.
function setupMediaBlock(vid, jpdbData, cardIds, elements) {
  // Cache objects for images and audio.
  const preloadedImages = {};
  const preloadedAudios = {};
  // Preload images
  async function preloadImages() {
    for (const cardId of cardIds) {
      const cardData = jpdbData.cards[cardId];
      if (cardData && cardData.image) {
        try {
          const imageData = await fetchMediaFile(cardData.image);
          if (imageData) {
            const mimeImg = getMimeType(cardData.image);
            const blob = base64ToBlob(imageData, mimeImg);
            const objectUrl = URL.createObjectURL(blob);
            preloadedImages[cardId] = objectUrl;
          }
        } catch (error) {
          console.error("Error preloading image for card", cardId, error);
        }
      }
    }
  }
  preloadImages();

  // Preload audios
  async function preloadAudios() {
    for (const cardId of cardIds) {
      const cardData = jpdbData.cards[cardId];
      if (cardData && cardData.audio) {
        try {
          const audioData = await fetchMediaFile(cardData.audio);
          if (audioData) {
            preloadedAudios[cardId] = audioData;
          }
        } catch (error) {
          console.error("Error preloading audio for card", cardId, error);
        }
      }
    }
  }
  preloadAudios();

  removeExistingContent();

  // Set up button disable if only one card.
  if (cardIds.length < 2) {
    elements.leftButton.style.color = "grey";
    elements.rightButton.style.color = "grey";
    elements.leftButton.style.cursor = "default";
    elements.rightButton.style.cursor = "default";
    elements.leftButton.style.pointerEvents = "none";
    elements.rightButton.style.pointerEvents = "none";
  }

  // Flag variables for smooth transitions.
  let counterShown = false;
  let imageLoadedOnce = false;
  let currentCardIndex = 0;

  async function getTokensForContext(contextText) {
    const apiKey = await new Promise((resolve, reject) => {
      chrome.storage.local.get("jpdbApiKey", (data) => {
        if (data.jpdbApiKey) {
          resolve(data.jpdbApiKey);
        } else {
          reject(new Error("JPDB API key not found in storage."));
        }
      });
    }).catch((error) => {
      console.error(error);
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
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
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
      return { tokens: data.tokens || [], vocabulary: data.vocabulary || [] };
    } catch (error) {
      console.error("Error fetching tokens from JPDB API:", error);
      return { tokens: [], vocabulary: [] };
    }
  }

  async function loadCard(index) {
    elements.cardCountElem.innerText = `${index + 1}/${cardIds.length}`;
    if (!counterShown) {
      elements.cardCountElem.style.display = "none";
    }

    let existingAudio = document.getElementById("jpdb-audio");
    if (existingAudio) {
      existingAudio.pause();
      existingAudio.currentTime = 0;
    }

    const cardId = cardIds[index];
    if (!jpdbData.cards || !jpdbData.cards[cardId]) {
      console.warn("No card data for card", cardId);
      return;
    }

    const cardData = jpdbData.cards[cardId];
    console.log("Loading card data for vid", vid, "card", cardId, "at index", index);

    const contextText = cardData.context;

    let tokenData = { tokens: [], vocabulary: [] };
    if (contextText) {
      tokenData = await getTokensForContext(contextText);
    }
    const tokens = tokenData.tokens;
    const vocabulary = tokenData.vocabulary;

    let newContextHtml = "";
    if (contextText) {
      if (tokens.length > 0) {
        for (let token of tokens) {
          const startPos = token[1];
          const tokenLength = token[2];
          const tokenText = contextText.substring(startPos, startPos + tokenLength);
          if (token[3] !== null) {
            const vocabEntry = vocabulary[token[0]];
            if (vocabEntry) {
              const tokenVid = String(vocabEntry[0]);
              newContextHtml += (tokenVid === String(vid))
                ? `<span style="color: #4b8dff; font-weight: bold;">${tokenText}</span>`
                : tokenText;
            } else {
              newContextHtml += tokenText;
            }
          } else {
            newContextHtml += tokenText;
          }
        }
      } else {
        newContextHtml = contextText;
      }
    }

    const jpContainer = document.createElement("div");
    jpContainer.style.display = "flex";
    jpContainer.style.alignItems = "baseline";
    jpContainer.style.columnGap = "0.25rem";
    jpContainer.className = "card-sentence";

    const audioFilename = cardData.audio;
    if (audioFilename) {
      let audioData;
      if (preloadedAudios[cardId]) {
        audioData = preloadedAudios[cardId];
      } else {
        audioData = await fetchMediaFile(audioFilename);
        if (audioData) {
          preloadedAudios[cardId] = audioData;
        }
      }
      if (audioData) {
        let audioElem = document.getElementById("jpdb-audio");
        if (!audioElem) {
          audioElem = document.createElement("audio");
          audioElem.id = "jpdb-audio";
          audioElem.style.display = "none";
        } else {
          audioElem.pause();
          audioElem.currentTime = 0;
        }
        const mimeAudio = getMimeType(audioFilename);
        audioElem.src = `data:${mimeAudio};base64,${audioData}`;

        let audioBtn = document.getElementById("jpdb-media-audio");
        if (!audioBtn) {
          audioBtn = document.createElement("a");
          audioBtn.id = "jpdb-media-audio";
          audioBtn.className = "icon-link example-audio";
          audioBtn.href = "#";
          audioBtn.innerHTML = '<i class="ti ti-volume" style="color: #4b8dff;"></i>';
          audioBtn.addEventListener("click", (e) => {
            e.preventDefault();
            audioElem.currentTime = 0;
            audioElem.play().catch(error => console.error("Audio play error:", error));
          });
        }

        const spacer = document.createElement("div");
        spacer.style.width = "0.5rem";
        spacer.style.display = "inline-block";

        jpContainer.appendChild(audioBtn);
        jpContainer.appendChild(spacer);
        jpContainer.appendChild(audioElem);

        chrome.storage.local.get("autoPlayAudio", (settings) => {
          if (settings.autoPlayAudio && audioElem.paused) {
            audioElem.play().catch((error) => {
              if (error.name === "NotAllowedError") {
                const playAfterInteraction = function() {
                  audioElem.play().catch(err => console.error("Auto-play after interaction failed:", err));
                  document.removeEventListener("click", playAfterInteraction);
                };
                document.addEventListener("click", playAfterInteraction);
                console.warn("Auto-play prevented; waiting for user interaction.");
              } else {
                console.error("Audio play error:", error);
              }
            });
          }
        });
      }
    }

    const jpSentence = document.createElement("div");
    jpSentence.className = "sentence";
    jpSentence.style.marginLeft = "0.3rem";
    jpSentence.innerHTML = newContextHtml;
    jpContainer.appendChild(jpSentence);

    elements.contextElem.innerHTML = "";
    elements.contextElem.appendChild(jpContainer);

    let englishText = "";
    if (contextText) {
      const englishMatches = contextText.match(/[^\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]+/g);
      englishText = englishMatches ? englishMatches.join(" ") : "";
      englishText = englishText.replace(/<br>/g, " ").trim();
    }

    if (englishText) {
      const translationContainer = document.createElement("div");
      translationContainer.style.display = "flex";
      translationContainer.style.justifyContent = "center";

      const translationDiv = document.createElement("div");
      translationDiv.className = "sentence-translation";
      translationDiv.innerText = englishText;

      translationContainer.appendChild(translationDiv);
      elements.contextElem.appendChild(translationContainer);
    }

    // --- Image Section ---
    const imageFilename = cardData.image;
    if (imageFilename) {
      // For first load, hide image and counter until loaded.
      if (!imageLoadedOnce) {
        elements.imgElem.style.display = "none";
        elements.cardCountElem.style.display = "none";
      }
      if (preloadedImages[cardId]) {
        if (!imageLoadedOnce) {
          elements.imgElem.onload = function() {
            elements.imgElem.style.display = "";
            if (!counterShown) {
              elements.cardCountElem.style.display = "";
              counterShown = true;
            }
            imageLoadedOnce = true;
          };
          elements.imgElem.onerror = function() {
            elements.imgElem.style.display = "none";
            if (!counterShown) elements.cardCountElem.style.display = "none";
          };
          elements.imgElem.src = preloadedImages[cardId];
          elements.imgElem.style.opacity = 1;
        } else {
          let tempImg = new Image();
          tempImg.onload = function() {
            elements.imgElem.src = preloadedImages[cardId];
            elements.imgElem.style.opacity = 1;
          };
          tempImg.onerror = function() {
            // Leave current image unchanged.
          };
          tempImg.src = preloadedImages[cardId];
        }
      } else {
        const imageData = await fetchMediaFile(imageFilename);
        if (imageData) {
          const mimeImg = getMimeType(imageFilename);
          const blob = base64ToBlob(imageData, mimeImg);
          const objectUrl = URL.createObjectURL(blob);
          if (!imageLoadedOnce) {
            elements.imgElem.onload = function() {
              elements.imgElem.style.display = "";
              if (!counterShown) {
                elements.cardCountElem.style.display = "";
                counterShown = true;
              }
              imageLoadedOnce = true;
              URL.revokeObjectURL(objectUrl);
            };
            elements.imgElem.onerror = function() {
              elements.imgElem.style.display = "none";
              if (!counterShown) elements.cardCountElem.style.display = "none";
            };
            elements.imgElem.src = objectUrl;
            elements.imgElem.style.opacity = 1;
          } else {
            let tempImg = new Image();
            tempImg.onload = function() {
              elements.imgElem.src = objectUrl;
              elements.imgElem.style.opacity = 1;
              URL.revokeObjectURL(objectUrl);
            };
            tempImg.onerror = function() {
              // Do nothing.
            };
            tempImg.src = objectUrl;
          }
        } else {
          elements.imgElem.src = "";
          elements.imgElem.style.display = "none";
          if (!counterShown) elements.cardCountElem.style.display = "none";
        }
      }
    } else {
      elements.imgElem.src = "";
      elements.imgElem.style.display = "none";
      if (!counterShown) elements.cardCountElem.style.display = "none";
    }
  }

  // Initial load.
  loadCard(currentCardIndex);

  elements.leftButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex - 1 + cardIds.length) % cardIds.length;
    loadCard(currentCardIndex);
  });
  elements.rightButton.addEventListener("click", () => {
    currentCardIndex = (currentCardIndex + 1) % cardIds.length;
    loadCard(currentCardIndex);
  });
}

// ------------------------------
// Insert Media Block in Review Page
// ------------------------------
async function insertMediaInReview() {
  const vid = extractVidFromReviewUrl();
  if (!vid) return;
  chrome.storage.local.get("jpdbData", async (data) => {
    if (!data.jpdbData) return;
    const jpdbData = data.jpdbData;
    if (!jpdbData.vid || !jpdbData.vid[vid]) return;
    const cardIds = jpdbData.vid[vid].cards;
    if (!cardIds || cardIds.length === 0) return;

    // Create the media block elements.
    const elements = createMediaBlock();
    // Insert the block into the page.
    // (Assuming review page insertion logic already exists.)
    let vocabElem = document.querySelector("div.plain a.plain[href*='/vocabulary/']");
    if (vocabElem && vocabElem.parentElement && vocabElem.parentElement.parentElement) {
      const targetParent = vocabElem.parentElement.parentElement;
      targetParent.insertBefore(elements.mediaBlock, vocabElem.parentElement.nextSibling);
    } else {
      document.body.appendChild(elements.mediaBlock);
    }
    // Set up the media block behavior.
    setupMediaBlock(vid, jpdbData, cardIds, elements);
  });
}

// ------------------------------
// Insert Media Block in Vocabulary Page
// ------------------------------
async function insertMediaInVocabularyPage() {
  const vid = extractVidFromVocabularyUrl();
  if (!vid) return;
  chrome.storage.local.get("jpdbData", async (data) => {
    if (!data.jpdbData) return;
    const jpdbData = data.jpdbData;
    if (!jpdbData.vid || !jpdbData.vid[vid]) return;
    const cardIds = jpdbData.vid[vid].cards;
    if (!cardIds || cardIds.length === 0) return;

    const elements = createMediaBlock();
    // For vocabulary page, insert the media block above the meanings section.
    const meaningsElem = document.querySelector(".subsection-meanings");
    if (meaningsElem && meaningsElem.parentElement) {
      meaningsElem.parentElement.insertBefore(elements.mediaBlock, meaningsElem);
    } else {
      document.body.appendChild(elements.mediaBlock);
    }
    setupMediaBlock(vid, jpdbData, cardIds, elements);
  });
}

// ------------------------------
// Init: Determine which page we are on and insert the media block accordingly
// ------------------------------
function init() {
  console.log("Running init() for JPDB content script.");
  // If URL path contains "/vocabulary/" but not the review page indicator, assume vocabulary page.
  if (location.pathname.includes("/vocabulary/") && !location.search.includes("c=")) {
    insertMediaInVocabularyPage();
  } else {
    insertMediaInReview();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
