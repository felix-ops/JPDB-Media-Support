export function waitForElement(selector, timeout = 5000) {
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

export function pauseOtherAudios(currentAudio) {
  const allAudios = document.querySelectorAll("audio");
  allAudios.forEach((audio) => {
    if (audio !== currentAudio && !audio.paused) {
      audio.pause();
    }
  });
}

export function extractVidFromReviewUrl() {
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
    const plain = document.querySelector(".answer-box .plain");
    if (plain) {
      const link = plain.querySelector('a[href^="/vocabulary/"]');
      if (link && link.getAttribute("href")) {
        const m = link.getAttribute("href").match(/\/vocabulary\/(\d+)\//);
        if (m) return m[1];
      }
    }
    const prefetch = document.querySelector('link[rel="prefetch"][href*="/review?"]');
    if (prefetch) {
      const href = prefetch.getAttribute("href");
      const url = new URL(href, location.origin);
      const c = url.searchParams.get("c");
      if (c) {
        const parts2 = c.split(",");
        if (parts2.length >= 2) return parts2[1];
      }
    }
    const anyVocab = document.querySelector('a[href^="/vocabulary/"]');
    if (anyVocab) {
      const m2 = anyVocab.getAttribute("href").match(/\/vocabulary\/(\d+)\//);
      if (m2) return m2[1];
    }
  } catch {}
  return null;
}

export function extractVidFromVocabularyUrl() {
  const parts = location.pathname.split("/");
  if (parts[1] === "vocabulary" && parts[2]) {
    return parts[2];
  }
  return null;
}

export function formatTranslatedText(text) {
  if (!text) return "";
  const tempElement = document.createElement("div");
  tempElement.innerHTML = text;
  let decodedText = tempElement.innerText;
  return decodedText.replace(/\s+/g, " ").trim();
}
