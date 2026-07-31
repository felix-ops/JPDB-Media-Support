import { getSetting, getMediaForCard, fetchMediaFile, toggleFavoriteCard } from "../shared/messaging.js";
import { getTokensForContext } from "../api/jpdb.js";
import { formatTranslatedText, pauseOtherAudios } from "./dom-utils.js";
import { getMimeType } from "../shared/utils.js";

async function dataToBlob(data, mimeType) {
  const response = await fetch(
    data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`,
  );
  return await response.blob();
}

export function removeExistingContent({ isFrontPage }) {
  const settingKey = isFrontPage
    ? "hideNativeSentenceFront"
    : "hideNativeSentence";
  getSetting(settingKey, false).then((hide) => {
    if (hide !== false) {
      const existingCardSentence = document.querySelector(
        ".card-sentence:not(.jpdb-inserted)",
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
          "a.icon-link.example-audio:not(#jpdb-media-audio)",
        );
        if (audioBtn) {
          audioBtn.remove();
        }
      }
    }
  });
}

export function createMediaBlock() {
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
  imgElem.style.display = "none";

  imgElem.addEventListener("click", () => {
    const audioElem = document.getElementById("jpdb-audio");
    if (audioElem) {
      pauseOtherAudios(audioElem);
      audioElem.currentTime = 0;
      audioElem.play().catch(() => {});
    }
  });

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

  const favoriteButton = document.createElement("button");
  favoriteButton.id = "jpdb-favorite-button";
  favoriteButton.innerHTML = "☆"; 
  favoriteButton.style.background = "rgba(0, 0, 0, 0)";
  favoriteButton.style.color = "#bbbbbb";

  Object.assign(favoriteButton.style, btnStyle, {
    left: "auto", 
    right: "auto", 
    position: "relative", 
    top: "auto", 
    transform: "none", 
    fontSize: "22px",
    padding: "5px",
    lineHeight: "0",
  });

  imageContainer.appendChild(cardCountElem);
  imageContainer.appendChild(leftButton);
  imageContainer.appendChild(imgElem);
  imageContainer.appendChild(rightButton);

  const contextElem = document.createElement("div");
  contextElem.style.display = "flex";
  contextElem.style.flexDirection = "column";
  contextElem.style.marginTop = "10px";

  const audioElem = document.createElement("audio");
  audioElem.id = "jpdb-audio";
  audioElem.style.display = "none";

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

export async function setupMediaBlock(
  vid,
  jpdbData,
  cardIds,
  elements,
  vidRecord,
  options = {},
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

  const mediaCache = {}; 
  let currentCardIndex = 0;
  let favCards = vidRecord.favCards || [];

  const processAndCacheCard = async (cardId) => {
    if (mediaCache[cardId] || !cardId) return; 

    const cardData = jpdbData.cards[cardId];
    if (!cardData) return;

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

    mediaCache[cardId] = {
      imageURL: imageBlob ? URL.createObjectURL(imageBlob) : null,
      audioURL: audioBlob ? URL.createObjectURL(audioBlob) : null,
    };

    if (
      currentCardIndex < cardIds.length &&
      cardIds[currentCardIndex] === cardId
    ) {
      loadMediaContent(cardId);
    }
  };

  function preloadSurroundingCards(currentIndex) {
    const PRELOAD_WINDOW = 10;
    const totalCards = cardIds.length;
    if (totalCards <= 1) return;

    const cardIdsToPreload = [];

    for (let i = 1; i <= PRELOAD_WINDOW; i++) {
      const forwardIndex = (currentIndex + i) % totalCards;
      const forwardCardId = cardIds[forwardIndex];
      if (forwardCardId && !mediaCache[forwardCardId]) {
        cardIdsToPreload.push(forwardCardId);
      }

      const backwardIndex = (currentIndex - i + totalCards) % totalCards;
      const backwardCardId = cardIds[backwardIndex];
      if (backwardCardId && !mediaCache[backwardCardId]) {
        cardIdsToPreload.push(backwardCardId);
      }
    }

    for (const cardId of cardIdsToPreload) {
      processAndCacheCard(cardId).catch(console.error);
    }
  }

  async function displayCard(index) {
    const cardId = cardIds[index];
    if (!cardId) return;

    const cardData = jpdbData.cards[cardId];
    loadTextContent(cardData, index);

    if (!mediaCache[cardId]) {
      await processAndCacheCard(cardId);
    } else {
      loadMediaContent(cardId);
    }

    preloadSurroundingCards(index);
  }

  function loadTextContent(cardData, index) {
    if (!cardData) return;

    currentCardIndex = index;
    elements.cardCountElem.innerText = `${index + 1}/${cardIds.length}`;
    elements.cardCountElem.style.display = "block";

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

    getSetting("jpdbApiKey", null).then(apiKey => {
      if (apiKey) {
        getTokensForContext(vid, japaneseText, apiKey).then(data => {
          if (!data) return;
          let newHtml = "";
          let lastIndex = 0;
          data.tokens
            .sort((a, b) => a[1] - b[1])
            .forEach(([vocabIndex, start, length]) => {
              newHtml += japaneseText.substring(lastIndex, start);
              const link = document.createElement("a");
              link.href = `/vocabulary/${data.vocabulary[vocabIndex][0]}/${data.vocabulary[vocabIndex][1]}`;
              link.style.color = "inherit";
              link.innerText = japaneseText.substring(start, start + length);
              newHtml += link.outerHTML;
              lastIndex = start + length;
            });
          newHtml += japaneseText.substring(lastIndex);
          jpSentence.innerHTML = newHtml;
        });
      }
    });

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

  elements.favoriteButton.addEventListener("click", () => {
    const currentCardId = cardIds[currentCardIndex];
    if (!currentCardId) return;

    const isCurrentlyFavorite = favCards.includes(currentCardId);
    elements.favoriteButton.innerHTML = isCurrentlyFavorite ? "☆" : "★";
    elements.favoriteButton.style.color = isCurrentlyFavorite
      ? "#bbbbbb"
      : "#4b8dff";

    toggleFavoriteCard(vid, currentCardId)
      .then(isFavorite => {
        if (isFavorite) {
          if (!favCards.includes(currentCardId)) {
            favCards.unshift(currentCardId);
          }
        } else {
          favCards = favCards.filter((id) => id !== currentCardId);
        }
      })
      .catch(error => {
        const isNowFavorite = favCards.includes(currentCardId);
        elements.favoriteButton.innerHTML = isNowFavorite ? "★" : "☆";
        elements.favoriteButton.style.color = isNowFavorite
          ? "#4b8dff"
          : "#bbbbbb";
        console.error("Failed to toggle favorite:", error);
      });
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
