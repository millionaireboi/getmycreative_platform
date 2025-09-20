// This file acts as a proxy to the real 'firebase/storage' module.
// It exists to resolve module path conflicts caused by this file's name shadowing the npm package.
// By using the full CDN URL, we break the circular dependency and allow the module resolver to find the correct package.
// FIX: Use the official Firebase CDN URL to ensure correct module exports.
// FIX: Replaced wildcard export with named exports to ensure functions are correctly exposed.
import {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

export {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable
};
