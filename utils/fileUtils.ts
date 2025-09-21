import { Mark, BrandAsset } from '../core/types/shared.ts';
import { storage } from '../firebase/config.ts';
// FIX: Import directly from the official 'firebase/storage' package. This
// change is part of the core fix to resolve the module shadowing issue that was
// causing the application to fail at runtime.
import { ref, getDownloadURL } from "firebase/storage";


export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove the "data:image/jpeg;base64," part
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
};

export const downloadImage = (imageUrl: string, fileName: string, watermarkText?: string) => {
  if (!watermarkText) {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous'; // Important for data URLs or CORS-enabled images
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Watermark styling
    const padding = 20;
    const fontSize = Math.max(18, Math.min(img.width / 30, 40));
    ctx.font = `bold ${fontSize}px Poppins, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    // Draw text
    ctx.fillText(watermarkText, canvas.width - padding, canvas.height - padding);

    // Trigger download
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  img.src = imageUrl;
};


export const imageUrlToBase64 = async (url: string): Promise<{ base64: string; mimeType: string; width: number; height: number }> => {
  // This is a robust function to convert any image URL (blob, data, https) to base64.
  return new Promise((resolve, reject) => {
    const img = new Image();

    // CORS is only needed for remote HTTPS URLs. It's not needed and can cause issues with blob/data URLs.
    if (url.startsWith('http')) {
      img.crossOrigin = 'Anonymous';
    }

    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error("Failed to get canvas context."));
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0);

      // Determine MIME type. Default to png.
      let mimeType = 'image/png';
      if (url.startsWith('data:image/')) {
        mimeType = url.substring(5, url.indexOf(';'));
      } else if (/\.(jpe?g|webp)/i.test(url)) {
        // Use jpeg for jpg/webp for better compression on photos
        mimeType = 'image/jpeg'; 
      }

      const dataUrl = canvas.toDataURL(mimeType);
      const base64 = dataUrl.split(',')[1];
      
      resolve({ base64, mimeType, width, height });
    };

    img.onerror = (errorEvent) => {
      console.error("Image loading failed:", errorEvent, "URL:", url);
      reject(new Error(
        'Failed to load image for processing. This may be due to a browser security policy (CORS) or an invalid URL. ' +
        'If using Firebase Storage, ensure CORS is configured correctly on your bucket.'
      ));
    };

    // If it's a gs:// URL, we must get a download URL first.
    // Otherwise, we can use the URL directly (this handles blob:, data:, and https:).
    if (url.startsWith('gs://')) {
        (async () => {
            try {
                const storageRef = ref(storage, url);
                const downloadUrl = await getDownloadURL(storageRef);
                img.src = downloadUrl; // Set src to the HTTPS download URL
            } catch (error: any) {
                console.error("Failed to get download URL from gs:// path:", error);
                reject(new Error(`Failed to resolve Firebase Storage URL. Details: ${error.message || error.code}`));
            }
        })();
    } else {
        // This directly handles blob:, data:, and https: URLs.
        img.src = url;
    }
  });
};


/**
 * Converts a base64 string into a Blob object.
 * This is necessary to upload AI-generated images to Firebase Storage.
 * @param base64 The base64 encoded string.
 * @param mimeType The MIME type of the data (e.g., 'image/png').
 * @returns A Blob object.
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};
