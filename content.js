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
// Main Insertion Function
// ------------------------------

async function insertMediaInReview() {
  const vid = extractVidFromUrl();
  if (!vid) {
    console.warn("No vocabulary id found in URL; aborting insertion.");
    return;
  }
  
  chrome.storage.local.get("jpdbData", async (data) => {
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
    
    const cardId = cardIds[0];
    if (!jpdbData.cards || !jpdbData.cards[cardId]) {
      console.warn("No card data for card", cardId);
      return;
    }
    
    const cardData = jpdbData.cards[cardId];
    console.log("Retrieved card data for vid", vid, ":", cardData);
    
    const contextText = cardData.context;
    const rawImage = cardData.image;
    const rawAudio = cardData.audio;
    
    // Normalize filenames in case they include HTML tags or [sound:...] markers.
    const imageFilename = normalizeFilename(rawImage);
    const audioFilename = normalizeFilename(rawAudio);
    
    // Fetch media files via the background service worker.
    const imageData = imageFilename ? await fetchMediaFile(imageFilename) : null;
    const audioData = audioFilename ? await fetchMediaFile(audioFilename) : null;
    
    // Build the media block container.
    const mediaBlock = document.createElement("div");
    mediaBlock.id = "jpdb-media-block";
    mediaBlock.style.marginTop = "10px";
    mediaBlock.style.display = "flex";
    mediaBlock.style.flexDirection = "column";
    mediaBlock.style.alignItems = "center";
    
    // Create a container for the context sentence and the audio button.
    if (contextText) {
      // Filter context text to extract only Japanese characters.
      const matches = contextText.match(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]+/g);
      const filteredContext = matches ? matches.join(" ") : contextText;
      
      const contextContainer = document.createElement("div");
      contextContainer.style.display = "flex";
      contextContainer.style.alignItems = "center";
      contextContainer.style.marginTop = "10px";
      
      // Create the context text element with the site's sentence style.
      const contextElem = document.createElement("div");
      contextElem.className = "sentence"; // assumes website styles this class appropriately
      contextElem.style.flex = "1";
      contextElem.innerText = filteredContext;
      contextContainer.appendChild(contextElem);
      
      // If audio data exists, create a button next to the context.
      if (audioData) {
        // Create hidden audio element if not already created.
        let audioElem = document.getElementById("jpdb-audio");
        if (!audioElem) {
          audioElem = document.createElement("audio");
          audioElem.id = "jpdb-audio";
          const mimeAudio = getMimeType(audioFilename);
          audioElem.src = `data:${mimeAudio};base64,${audioData}`;
          audioElem.style.display = "none";
          mediaBlock.appendChild(audioElem);
        }
        
        // Clone an existing audio button from the page for styling, or create one.
        let templateBtn = document.querySelector("a.icon-link.vocabulary-audio");
        let audioBtn;
        if (templateBtn) {
          audioBtn = templateBtn.cloneNode(true);
        } else {
          audioBtn = document.createElement("a");
          audioBtn.className = "icon-link vocabulary-audio";
          audioBtn.innerHTML = '<i class="ti ti-volume"></i>';
        }
        audioBtn.style.marginLeft = "10px";
        audioBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const audio = document.getElementById("jpdb-audio");
          if (audio) {
            audio.play();
          }
        });
        contextContainer.appendChild(audioBtn);
      }
      
      mediaBlock.appendChild(contextContainer);
    }
    
    // Insert the image (with reduced size) below the context.
    if (imageData) {
      const mimeImg = getMimeType(imageFilename);
      const imgElem = document.createElement("img");
      imgElem.src = `data:${mimeImg};base64,${imageData}`;
      imgElem.alt = "Vocabulary Image";
      imgElem.style.maxWidth = "80%"; // reduced size
      imgElem.style.marginTop = "10px";
      mediaBlock.appendChild(imgElem);
    }
    
    // Insert the media block into the review page.
    let vocabElem = document.querySelector("div.plain a.plain[href*='/vocabulary/']");
    if (vocabElem && vocabElem.parentElement && vocabElem.parentElement.parentElement) {
      vocabElem.parentElement.parentElement.insertBefore(
        mediaBlock,
        vocabElem.parentElement.nextSibling
      );
      console.log("Media block inserted into review page.");
    } else {
      console.warn("Vocabulary element not found; appending media block to body.");
      document.body.appendChild(mediaBlock);
    }
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
