// Wrapper functions for sending messages to the background script

export function getSetting(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getSetting", key: key },
      (response) => {
        resolve(
          response && response.value !== undefined
            ? response.value
            : defaultValue,
        );
      },
    );
  });
}

export function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "saveSetting", key: key, value: value },
      (response) => {
        resolve(response && response.success);
      },
    );
  });
}

export function getVidRecord(vid) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getVidRecord", vid: vid },
      (response) => {
        resolve(response && response.success ? response.result : null);
      },
    );
  });
}

export function getCardsMapping(cardIds) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getCardsMapping", cardIds: cardIds },
      (response) => {
        resolve(response && response.success ? response.result : {});
      },
    );
  });
}

export function getMediaForCard(cardId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getMediaForCard", cardId: cardId },
      (response) => {
        resolve(response && response.success ? response.mediaData : null);
      },
    );
  });
}

export function fetchMediaFile(filename, ankiUrl) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "fetchMediaFile", filename: filename, ankiUrl: ankiUrl },
      (response) => {
        if (response && response.success) {
          resolve(response.result);
        } else {
          resolve(null);
        }
      },
    );
  });
}

export function toggleFavoriteCard(vid, cardId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "toggleFavoriteCard", vid, cardId },
      (response) => {
        if (response && response.success) {
          resolve(response.isFavorite);
        } else {
          reject(new Error(response ? response.error : "Unknown error"));
        }
      },
    );
  });
}

export function clearAllCards() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "clearAllCards" }, (response) => {
      if (response && response.success) {
        resolve();
      } else {
        reject(new Error(response ? response.error : "Unknown error"));
      }
    });
  });
}

export function clearAllMedia() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "clearAllMedia" }, (response) => {
      if (response && response.success) {
        resolve();
      } else {
        reject(new Error(response ? response.error : "Unknown error"));
      }
    });
  });
}

export function getCardCount() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getCardCount" }, (response) => {
      resolve(response && response.success ? response.count : 0);
    });
  });
}

export function performAutoSyncMsg(params) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "performAutoSync", params }, (response) => {
      if (response && response.success) {
        resolve(response.result);
      } else {
        reject(new Error(response ? response.error : "Unknown error"));
      }
    });
  });
}

export function restoreFromConfigMsg(data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "restoreFromConfig", data }, (response) => {
      if (response && response.success) {
        resolve();
      } else {
        reject(new Error(response ? response.error : "Unknown error"));
      }
    });
  });
}
