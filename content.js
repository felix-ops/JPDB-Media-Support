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

// Normalize the stored filename.
// If it contains an <img> tag, extract its src attribute.
// If it starts with "[sound:" and ends with "]", strip those markers.
function normalizeFilename(filename) {
  if (!filename) return filename;
  
  if (filename.includes("<img")) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = filename;
    const img = tempDiv.querySelector('img');
    if (img) {
      const src = img.getAttribute('src');
      console.log("Normalized image filename from HTML:", src);
      return src;
    }
  }
  
  if (filename.startsWith("[sound:") && filename.endsWith("]")) {
    const clean = filename.slice(7, -1);
    console.log("Normalized audio filename from [sound:]:", clean);
    return clean;
  }
  
  console.log("Filename already normalized:", filename);
  return filename;
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
// Main Insertion Function with Card Toggle
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
    
    // Since local card data exists, hide the website's native sentence, audio, and translation.
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
    // They have no extra shadow, only the triangle.
    const btnStyle = {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      background: "transparent",
      border: "none",
      color: "#007BFF", // blue same as the audio button when active
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
    
    // Function to load and display a card based on the current index
    async function loadCard(index) {
      const cardId = cardIds[index];
      if (!jpdbData.cards || !jpdbData.cards[cardId]) {
        console.warn("No card data for card", cardId);
        return;
      }
      
      const cardData = jpdbData.cards[cardId];
      console.log("Loading card data for vid", vid, "card", cardId, "at index", index);
      
      // Update context text
      const contextText = cardData.context;
      let japaneseText = "";
      let englishText = "";
      if (contextText) {
        // Extract Japanese text
        const japaneseMatches = contextText.match(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]+/g);
        japaneseText = japaneseMatches ? japaneseMatches.join(" ") : "";
        
        // Extract English text
        const englishMatches = contextText.match(/[^\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]+/g);
        englishText = englishMatches ? englishMatches.join(" ") : "";
        englishText = englishText.replace(/<br>/g, " ").trim();
      }
      
      // Clear previous context and rebuild it
      contextElem.innerHTML = "";
      const jpContainer = document.createElement("div");
      jpContainer.style.display = "flex";
      jpContainer.style.alignItems = "baseline";
      jpContainer.style.columnGap = "0.25rem";
      jpContainer.className = "card-sentence";
      
      // Audio: normalize and fetch if available
      const rawAudio = cardData.audio;
      const audioFilename = normalizeFilename(rawAudio);
      if (audioFilename) {
        const audioData = await fetchMediaFile(audioFilename);
        if (audioData) {
          let audioElem = document.getElementById("jpdb-audio");
          if (!audioElem) {
            audioElem = document.createElement("audio");
            audioElem.id = "jpdb-audio";
            const mimeAudio = getMimeType(audioFilename);
            audioElem.src = `data:${mimeAudio};base64,${audioData}`;
            audioElem.style.display = "none";
          }
          
          // Create audio button (blue icon) and mark it with an ID so it won't be removed later
          const audioBtn = document.createElement("a");
          audioBtn.id = "jpdb-media-audio";
          audioBtn.className = "icon-link example-audio";
          audioBtn.href = "#";
          audioBtn.innerHTML = '<i class="ti ti-volume"></i>';
          audioBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const audio = document.getElementById("jpdb-audio");
            if (audio) {
              audio.play();
            }
          });
          
          const spacer = document.createElement("div");
          spacer.style.width = "0.5rem";
          spacer.style.display = "inline-block";
          
          jpContainer.appendChild(audioBtn);
          jpContainer.appendChild(spacer);
          jpContainer.appendChild(audioElem);
        }
      }
      
      const jpSentence = document.createElement("div");
      jpSentence.className = "sentence";
      jpSentence.style.marginLeft = "0.3rem";
      jpSentence.innerText = japaneseText;
      jpContainer.appendChild(jpSentence);
      contextElem.appendChild(jpContainer);
      
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
      
      // Update the image
      const rawImage = cardData.image;
      const imageFilename = normalizeFilename(rawImage);
      if (imageFilename) {
        const imageData = await fetchMediaFile(imageFilename);
        if (imageData) {
          const mimeImg = getMimeType(imageFilename);
          // Optionally add a fade transition when updating the image
          imgElem.style.opacity = 0;
          setTimeout(() => {
            imgElem.src = `data:${mimeImg};base64,${imageData}`;
            imgElem.style.opacity = 1;
          }, 150);
        } else {
          imgElem.src = "";
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
