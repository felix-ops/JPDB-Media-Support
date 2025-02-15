console.log("JPDB Content Script Loaded");

// ------------------------------
// URL Change Detection (Polling)
// ------------------------------
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    console.log("URL changed from", lastUrl, "to", location.href);
    lastUrl = location.href;
    insertMediaInReview();
  }
}, 1000);

// ------------------------------
// Utility Functions
// ------------------------------

// Extract the vocabulary id (vid) from the URL parameter "c"
// Expected format: c=vf,1550190,2786244425 so we split by comma.
function extractVidFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cParam = params.get('c'); // e.g. "vf,1550190,2786244425"
  console.log("Parameter c:", cParam);
  if (cParam) {
    const parts = cParam.split(',');
    if (parts.length >= 2) {
      const vid = parts[1];
      console.log("Extracted vid:", vid);
      return vid;
    }
  }
  console.warn("Could not extract vid from URL.");
  return null;
}

// Wait for an element to appear in the DOM (polling method)
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

// Determine MIME type based on filename extension
function getMimeType(filename) {
  if (filename.match(/\.(jpg|jpeg)$/i)) return "image/jpeg";
  if (filename.match(/\.png$/i)) return "image/png";
  if (filename.match(/\.gif$/i)) return "image/gif";
  if (filename.match(/\.mp3$/i)) return "audio/mpeg";
  if (filename.match(/\.ogg$/i)) return "audio/ogg";
  return "application/octet-stream";
}

// Retrieve the Anki Connect URL from storage or use default.
function getAnkiUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("ankiUrl", (data) => {
      if (data.ankiUrl) {
        resolve(data.ankiUrl);
      } else {
        resolve("http://localhost:8765");
      }
    });
  });
}

// Fetch a media file using background messaging (to bypass CORS).
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
          console.error(
            "Error fetching media file for",
            filename,
            response ? response.error : "No response"
          );
          resolve(null);
        }
      }
    );
  });
}

// ------------------------------
// Hide native website content (sentence, audio, translation)
// ------------------------------
function removeExistingContent() {
  // Remove native sentence and translation if present.
  const existingCardSentence = document.querySelector(".card-sentence");
  if (existingCardSentence) {
    const existingTranslation = existingCardSentence.nextElementSibling;
    if (existingTranslation && existingTranslation.querySelector(".sentence-translation")) {
      existingTranslation.remove();
    }
    existingCardSentence.remove();
  }
  // Remove native audio button(s) that are not ours.
  const nativeAudioBtns = document.querySelectorAll("a.icon-link.example-audio:not(#jpdb-media-audio)");
  nativeAudioBtns.forEach(btn => btn.remove());
}

// ------------------------------
// Main Insertion Function with Card Toggle and Preloading Images
// ------------------------------
async function insertMediaInReview() {
  const vid = extractVidFromUrl();
  if (!vid) {
    console.warn("No vocabulary id found in URL; aborting insertion.");
    return;
  }
  
  chrome.storage.local.get("jpdbData", async (data) => {
    // If there's no local data for this vocabulary, let the website render its content.
    if (!data.jpdbData) {
      console.warn("No JPDB data found in storage");
      return;
    }
    const jpdbData = data.jpdbData;
    if (!jpdbData.vid || !jpdbData.vid[vid]) {
      console.warn("No data for vid", vid);
      return;
    }
    
    const cardIds = jpdbData.vid[vid].cards;
    if (!cardIds || cardIds.length === 0) {
      console.warn("No cards associated with vid", vid);
      return;
    }
    
    // Preloaded images cache (keyed by cardId)
    const preloadedImages = {};
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
    // Start preloading images in the background without waiting for completion.
    preloadImages();
    
    // Hide native content from the website.
    removeExistingContent();
    
    // Remove any existing media block (if reloading)
    const existingMediaBlock = document.getElementById("jpdb-media-block");
    if (existingMediaBlock) {
      existingMediaBlock.remove();
    }
    
    // Create the media block container
    const mediaBlock = document.createElement("div");
    mediaBlock.id = "jpdb-media-block";
    mediaBlock.style.marginTop = "10px";
    mediaBlock.style.display = "flex";
    mediaBlock.style.flexDirection = "column";
    mediaBlock.style.alignItems = "center";
    
    // Create an image container for the image and toggle buttons
    const imageContainer = document.createElement("div");
    imageContainer.style.position = "relative";
    imageContainer.style.display = "flex";
    imageContainer.style.justifyContent = "center";
    imageContainer.style.alignItems = "center";
    imageContainer.style.width = "100%";
    
    // Create the image element and reduce its size by 20%
    const imgElem = document.createElement("img");
    imgElem.alt = "Vocabulary Image";
    // Previously maxWidth was "80%"; reducing by 20% gives "64%"
    imgElem.style.maxWidth = "64%";
    imgElem.style.transition = "opacity 0.3s";
    
    // Create left and right toggle buttons with triangle icons.
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
    leftButton.innerHTML = "&#9664;"; // left-pointing triangle
    Object.assign(leftButton.style, btnStyle, { left: "10px" });
    
    const rightButton = document.createElement("button");
    rightButton.innerHTML = "&#9654;"; // right-pointing triangle
    Object.assign(rightButton.style, btnStyle, { right: "10px" });
    
    // If there's only one card, grey out the buttons and disable clicking.
    if (cardIds.length < 2) {
      leftButton.style.color = "grey";
      rightButton.style.color = "grey";
      leftButton.style.cursor = "default";
      rightButton.style.cursor = "default";
      leftButton.style.pointerEvents = "none";
      rightButton.style.pointerEvents = "none";
    }
    
    imageContainer.appendChild(leftButton);
    imageContainer.appendChild(imgElem);
    imageContainer.appendChild(rightButton);
    
    // Create a container for the context (Japanese and English text, audio)
    const contextElem = document.createElement("div");
    contextElem.style.display = "flex";
    contextElem.style.flexDirection = "column";
    contextElem.style.marginTop = "10px";
    
    // Append image container and context element to the media block
    mediaBlock.appendChild(imageContainer);
    mediaBlock.appendChild(contextElem);
    
    // Find insertion point and insert the media block
    let vocabElem = document.querySelector("div.plain a.plain[href*='/vocabulary/']");
    if (vocabElem && vocabElem.parentElement && vocabElem.parentElement.parentElement) {
      const targetParent = vocabElem.parentElement.parentElement;
      targetParent.insertBefore(mediaBlock, vocabElem.parentElement.nextSibling);
      console.log("Media block inserted into review page.");
    } else {
      console.warn("Vocabulary element not found; appending media block to body.");
      document.body.appendChild(mediaBlock);
    }
    
    // Set up card toggling
    let currentCardIndex = 0;
    
    async function getTokensForContext(contextText) {
      // Retrieve the API key from chrome.storage.
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
        // Return empty tokens if no API key is found.
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

    // Helper: Convert a base64 string to a Blob.
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

    async function loadCard(index) {
      // Stop any previous audio playback.
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
      
      // Extract full context text.
      const contextText = cardData.context;
      
      // Fetch token data for highlighting, if available.
      let tokenData = { tokens: [], vocabulary: [] };
      if (contextText) {
        tokenData = await getTokensForContext(contextText);
      }
      const tokens = tokenData.tokens;
      const vocabulary = tokenData.vocabulary;
      
      // Build the highlighted context HTML offscreen.
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
      
      // Prepare a container for context and audio.
      const jpContainer = document.createElement("div");
      jpContainer.style.display = "flex";
      jpContainer.style.alignItems = "baseline";
      jpContainer.style.columnGap = "0.25rem";
      jpContainer.className = "card-sentence";
      
      // --- Audio Section ---
      const audioFilename = cardData.audio;
      if (audioFilename) {
        const audioData = await fetchMediaFile(audioFilename);
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
          // Update the source for the current card.
          audioElem.src = `data:${mimeAudio};base64,${audioData}`;
          
          // Create the audio button if it doesn't exist.
          let audioBtn = document.getElementById("jpdb-media-audio");
          if (!audioBtn) {
            audioBtn = document.createElement("a");
            audioBtn.id = "jpdb-media-audio";
            audioBtn.className = "icon-link example-audio";
            audioBtn.href = "#";
            audioBtn.innerHTML = '<i class="ti ti-volume" style="color: #4b8dff;"></i>';
            // Clicking the button restarts audio.
            audioBtn.addEventListener("click", (e) => {
              e.preventDefault();
              audioElem.currentTime = 0;
              audioElem.play().catch(error => console.error("Audio play error:", error));
            });
          }
          
          const spacer = document.createElement("div");
          spacer.style.width = "0.5rem";
          spacer.style.display = "inline-block";
          
          // Add the audio controls to our container.
          jpContainer.appendChild(audioBtn);
          jpContainer.appendChild(spacer);
          jpContainer.appendChild(audioElem);
          
          // Attempt auto-play if the setting is enabled.
          chrome.storage.local.get("autoPlayAudio", (settings) => {
            if (settings.autoPlayAudio && audioElem.paused) {
              audioElem.play().catch((error) => {
                if (error.name === "NotAllowedError") {
                  // If autoplay is blocked, add a one-time click listener to resume playback.
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
      
      // --- Japanese Context Sentence ---
      const jpSentence = document.createElement("div");
      jpSentence.className = "sentence";
      jpSentence.style.marginLeft = "0.3rem";
      jpSentence.innerHTML = newContextHtml;
      jpContainer.appendChild(jpSentence);
      
      // Update the visible context element.
      contextElem.innerHTML = "";
      contextElem.appendChild(jpContainer);
      
      // --- English Translation ---
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
        contextElem.appendChild(translationContainer);
      }
      
      // --- Image Section ---
      const imageFilename = cardData.image;
      if (imageFilename) {
        // Use the preloaded image if available.
        if (preloadedImages[cardId]) {
          imgElem.src = preloadedImages[cardId];
          imgElem.style.opacity = 1;
        } else {
          // Fallback if image wasn't preloaded.
          const imageData = await fetchMediaFile(imageFilename);
          if (imageData) {
            const mimeImg = getMimeType(imageFilename);
            const blob = base64ToBlob(imageData, mimeImg);
            const objectUrl = URL.createObjectURL(blob);
            imgElem.src = objectUrl;
            imgElem.style.opacity = 1;
            imgElem.onload = () => {
              URL.revokeObjectURL(objectUrl);
            };
          } else {
            imgElem.src = "";
          }
        }
      } else {
        imgElem.src = "";
      }
    }
    
    // Initial load of the first card
    loadCard(currentCardIndex);
    
    // Set up button event listeners for toggling
    leftButton.addEventListener("click", () => {
      currentCardIndex = (currentCardIndex - 1 + cardIds.length) % cardIds.length;
      loadCard(currentCardIndex);
    });
    rightButton.addEventListener("click", () => {
      currentCardIndex = (currentCardIndex + 1) % cardIds.length;
      loadCard(currentCardIndex);
    });
  });
}

// Run on initial load.
function init() {
  console.log("Running init() for JPDB content script.");
  insertMediaInReview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
