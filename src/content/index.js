import { extractVidFromReviewUrl, extractVidFromVocabularyUrl, waitForElement } from "./dom-utils.js";
import { createMediaBlock, setupMediaBlock } from "./media-block.js";
import { getVidRecord, getCardsMapping, getSetting, performAutoSyncMsg } from "../shared/messaging.js";

// Polling for URL changes since JPDB is an SPA sometimes
let lastHref = document.location.href;
const observer = new MutationObserver(() => {
  if (lastHref !== document.location.href) {
    lastHref = document.location.href;
    initIfEnabled();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

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

  const isFrontPage =
    !new URLSearchParams(window.location.search).has("c") &&
    !document.querySelector(".subsection-meanings");

  if (isFrontPage) {
    const [showImg, showSentence] = await Promise.all([
      getSetting("showImageOnFront", false),
      getSetting("showSentenceOnFront", false),
    ]);
    if (!showImg && !showSentence) {
      return;
    }

    const elements = createMediaBlock();
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
      { isFrontPage: true },
    );
    return;
  }

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

export function init() {
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

let autoSyncCooldown = false;
const AUTO_SYNC_COOLDOWN_TIME = 30000;

async function checkAndTriggerAutoSync() {
  if (autoSyncCooldown) return;
  try {
    const autoSyncEnabled = await getSetting("autoSync", false);
    if (!autoSyncEnabled) return;

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAutoSyncSettings" }, resolve);
    });

    if (!response || !response.success || !response.result) return;
    const settings = response.result;

    if (
      !settings.autoSyncEnabled ||
      !settings.deckName ||
      !settings.jpdbApiKey ||
      !settings.japaneseField
    ) {
      return;
    }

    performAutoSyncMsg({
      deckName: settings.deckName,
      ankiUrl: settings.ankiUrl,
      jpdbApiKey: settings.jpdbApiKey,
      japaneseField: settings.japaneseField,
      englishField: settings.englishField,
      imageField: settings.imageField,
      audioField: settings.audioField,
      shouldFetchMedia: settings.shouldFetchMedia,
    }).catch(() => {});

    autoSyncCooldown = true;
    setTimeout(() => {
      autoSyncCooldown = false;
    }, AUTO_SYNC_COOLDOWN_TIME);
  } catch (error) {
    console.error("Auto-sync check failed:", error);
  }
}

export function initIfEnabled() {
  getSetting("extensionEnabled", true).then((enabled) => {
    if (enabled === false) {
      const existingBlock = document.getElementById("jpdb-media-block");
      if (existingBlock) existingBlock.remove();
      return;
    }

    checkAndTriggerAutoSync();
    init();
  });
}
