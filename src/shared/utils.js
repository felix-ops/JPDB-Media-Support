export function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export function base64ToBlob(base64, contentType = "", sliceSize = 512) {
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

export function getMimeType(filename) {
  if (!filename) return "application/octet-stream";
  if (filename.match(/\.(jpg|jpeg)$/i)) return "image/jpeg";
  if (filename.match(/\.png$/i)) return "image/png";
  if (filename.match(/\.gif$/i)) return "image/gif";
  if (filename.match(/\.mp3$/i)) return "audio/mpeg";
  if (filename.match(/\.ogg$/i)) return "audio/ogg";
  return "application/octet-stream";
}

export function extractImageFilenameUsingDOMParser(imageHTML) {
  if (!imageHTML) return "";
  if (typeof document === "undefined") {
    // For background script context, use regex-based extraction
    const imgMatch = imageHTML.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return imgMatch ? imgMatch[1] : imageHTML;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(imageHTML, "text/html");
  const img = doc.querySelector("img");
  return img ? img.getAttribute("src") : imageHTML;
}

export function extractAudioFilename(audioText) {
  if (!audioText) return "";
  if (audioText.startsWith("[sound:") && audioText.endsWith("]")) {
    return audioText.slice(7, -1);
  }
  return audioText;
}

export function stripJapaneseHtml(html) {
  if (typeof document === "undefined") {
    // For background script context, use simple regex-based stripping
    return html.replace(/<[^>]*>/g, "");
  }
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.innerText;
}

export function stripEnglishHtml(html) {
  if (typeof document === "undefined") {
    // For background script context, use simple regex-based stripping
    return html.replace(/<br\s*\/?>/g, " ").replace(/<[^>]*>/g, "");
  }
  let tempDiv = document.createElement("div");
  tempDiv.innerHTML = html.replace(/<br\s*\/?>/g, " ");
  return tempDiv.innerText;
}

export function normalizeForComparison(text) {
  if (!text) return "";
  let normalized = text;
  // Handle explicit &nbsp; and unicode nbsp
  normalized = normalized.replace(/&nbsp;/gi, " ").replace(/\u00A0/g, " ");
  // Decode common entities ensuring consistency between regex-strip and innerText
  const replacements = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#039;": "'",
  };
  normalized = normalized.replace(
    /&[a-z0-9#]+;/gi,
    (entity) => replacements[entity] || entity,
  );
  // Collapse whitespace and trim
  return normalized.replace(/\s+/g, " ").trim();
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}
