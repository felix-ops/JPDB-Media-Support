chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchMediaFile") {
      const ankiUrl = message.ankiUrl || "http://localhost:8765";
      const filename = message.filename;
      // Perform fetch from background, which is exempt from the page's CORS restrictions.
      fetch(ankiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retrieveMediaFile",
          version: 6,
          params: { filename: filename }
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.result) {
            sendResponse({ success: true, result: data.result });
          } else {
            sendResponse({ success: false, error: data.error });
          }
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      // Return true to indicate asynchronous sendResponse.
      return true;
    }
  });

