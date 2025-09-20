


import { GoogleGenAI, Modality, Type } from "@google/genai";
import { BrandAsset, Mark } from '../core/types/shared.ts';
import { ALL_TAGS } from "../constants.ts";

// Prefer Vite-style env var; fall back to legacy define for compatibility.
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI. Check if API key is valid.", error);
  }
} else {
  console.warn("GEMINI_API_KEY environment variable not set. App is in demo mode. AI features will be disabled.");
}

const getAi = (): GoogleGenAI => {
    if (!ai) {
        throw new Error("Gemini API is not configured. An API_KEY must be provided for AI features to work.");
    }
    return ai;
}

export interface EditToggles {
  [markId: string]: boolean;
}

export interface ChatEditOptions {
    brandColors?: string[];
    newAspectRatio?: string;
    mentions?: string[];
}


export const generateCreative = async (
  originalTemplateBase64: string,
  originalTemplateMimeType: string,
  basePrompt: string,
  textFields: Record<string, string>,
  imageAssets: Record<string, BrandAsset | null>,
  imagePrompts: Record<string, string>,
  imageModes: Record<string, 'upload' | 'describe'>,
  enabledMarks: Record<string, boolean>,
  aspectRatio: string,
  marks: Mark[],
  initialMarks: Mark[]
): Promise<string> => {
  const ai = getAi();
  const promptParts: any[] = [];
  
  promptParts.push({
    inlineData: {
      data: originalTemplateBase64,
      mimeType: originalTemplateMimeType,
    },
  });

  // Add all enabled user-provided images (product image, logo, etc.)
  for (const markId in imageAssets) {
    const asset = imageAssets[markId];
    const mode = imageModes[markId] || 'upload';
    if (asset && enabledMarks[markId] && mode === 'upload') {
      const markLabel = marks.find(m => m.id === markId)?.label || markId;
       promptParts.push({ text: `This is the user's new '${markLabel}' image.` });
       promptParts.push({
        inlineData: {
          data: asset.base64,
          mimeType: asset.file.type,
        },
      });
    }
  }

  const editInstructions: string[] = [];
  const initialMarkIds = new Set(initialMarks.map(m => m.id));

  marks.forEach(mark => {
    if (!enabledMarks[mark.id]) return;

    const isExistingMark = initialMarkIds.has(mark.id);

    if (mark.type === 'text') {
      const newText = textFields[mark.id];
      if (newText) {
          if (isExistingMark) {
            const originalText = initialMarks.find(m => m.id === mark.id)?.text;
            if (originalText && originalText.trim() !== '') {
              editInstructions.push(`- Find the text "${originalText}" and replace it with: "${newText}". The new text must perfectly replicate the font family, weight, size, color, style, and any effects (like shadows or outlines) of the original text.`);
            } else {
              editInstructions.push(`- Replace the text labeled '${mark.label}' with: "${newText}". The new text must perfectly replicate the font family, weight, size, color, style, and any effects (like shadows or outlines) of the original text.`);
            }
          } else {
            // New logic for adding text
            editInstructions.push(`- Add new text: "${newText}". Critical instructions: Place this text ON TOP of the existing template canvas. The coordinates for the center of this new text are (x: ${mark.x.toFixed(2)}, y: ${mark.y.toFixed(2)}). It is absolutely forbidden to alter the original template's dimensions or aspect ratio to fit this new text. The new text must be placed ENTIRELY within the original boundaries. The text's style, font, and color should match the overall aesthetic of the template.`);
          }
      }
    } else if (mark.type === 'image') {
       const mode = imageModes[mark.id] || 'upload';
       const asset = imageAssets[mark.id];
       const description = (imagePrompts[mark.id] || '').trim();
       const sizeInstruction = mark.scale ? `It should occupy about ${Math.round(mark.scale * 100)}% of the image's width.` : `Its size should be appropriate for its context (e.g., a small logo).`;
       if (mode === 'upload' && asset) {
         if (isExistingMark) {
           editInstructions.push(`- Replace the image labeled '${mark.label}' with the user's new provided '${mark.label}' image. The new image's lighting, shadows, perspective, and reflections MUST perfectly match the surrounding scene.`);
         } else {
            editInstructions.push(`- Add a new image for '${mark.label}'. Critical instructions: Place this image ON TOP of the existing template canvas. The coordinates for the center of this new image are (x: ${mark.x.toFixed(2)}, y: ${mark.y.toFixed(2)}). ${sizeInstruction} It is absolutely forbidden to alter the original template's dimensions or aspect ratio to fit this new image. The new image must be placed ENTIRELY within the original boundaries. Adjust the new image's lighting, shadows, and perspective to perfectly match the surrounding scene.`);
         }
       } else if (mode === 'describe' && description) {
         if (isExistingMark) {
            editInstructions.push(`- Replace the image labeled '${mark.label}' with a new image that matches this description: ${description}. Ensure lighting, shadows, and perspective align perfectly with the existing design.`);
         } else {
            editInstructions.push(`- Add a new image for '${mark.label}' based on this description: ${description}. Place it ON TOP of the existing template canvas at coordinates (x: ${mark.x.toFixed(2)}, y: ${mark.y.toFixed(2)}). ${sizeInstruction} Do not alter the template dimensions; keep the new element entirely within the original boundaries and match the surrounding lighting and perspective.`);
         }
       }
    }
  });


  const aspectRatioInstruction = aspectRatio === 'original'
    ? "The output image's aspect ratio and dimensions MUST EXACTLY match the original template's."
    : `The output image MUST have a final aspect ratio of ${aspectRatio}. Adapt the template's layout to fit this new aspect ratio gracefully.`;

  const textPrompt = `
    You are a precise and expert creative director AI. Your task is to perform specific in-place edits on a template image. You must follow all instructions exactly.

    **CRITICAL DIRECTIVES - READ AND FOLLOW STRICTLY:**
    1.  **DO NOT RECREATE:** You are only modifying small, specified parts of the template. The rest of the image MUST remain identical to the original.
    2.  **ABSOLUTE DIMENSION LOCK:** It is absolutely forbidden to alter the original template's dimensions or aspect ratio unless an explicit 'Aspect Ratio Requirement' is given below. Do NOT expand, crop, or change the canvas size to fit new elements. New elements are always placed ON TOP of the existing canvas, within its original boundaries. This is the most important rule.
    3.  **SEAMLESS INTEGRATION:** All new or replaced elements (text and images) must be perfectly integrated. Match the original template's lighting, perspective, style, and quality.

    **Task Description from Original Brief:** ${basePrompt}
        
    **Aspect Ratio Requirement**: ${aspectRatioInstruction}

    **SPECIFIC EDITING TASKS:**
    ${editInstructions.length > 0 ? editInstructions.join('\n') : "No specific edits requested. Generate the creative based on the original brief and aspect ratio."}
    ---
  `;
  
  promptParts.unshift({ text: textPrompt });

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: { parts: promptParts },
    config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        temperature: 0.4,
    },
  });

  if (!result.candidates || result.candidates.length === 0 || !result.candidates[0].content || !result.candidates[0].content.parts) {
    const blockReason = result.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Generation failed due to: ${blockReason}. Please adjust your inputs.`);
    }
    throw new Error("No content was generated by the API. The response was empty.");
  }

  for (const part of result.candidates[0].content.parts) {
    const data = part.inlineData?.data;
    if (data) {
      return data;
    }
  }

  throw new Error("No image was found in the generated content.");
};


export const editCreativeWithChat = async (
  baseImageBase64: string,
  baseImageMimeType: string,
  prompt: string,
  referenceImage?: { base64: string; mimeType: string },
  editOptions: ChatEditOptions = {},
): Promise<string> => {
  const ai = getAi();
  let instructionPrompt = `You are a helpful and expert creative assistant. The user has provided an image they want to edit. Follow their text instructions precisely to modify the image. You can also take stylistic cues from the optional reference image if one is provided.
  
  **Core Directives:**
  1. **Modify, Don't Recreate:** You are editing specific parts of the image, not creating a new image from scratch.
  2. **Preserve Integrity:** The majority of the image must remain UNCHANGED unless the user explicitly asks for a broad change.
  3. **Seamless Integration:** All new elements or changes must be seamlessly integrated, matching the original image's lighting, perspective, and style.
  `;

  if (editOptions.brandColors && editOptions.brandColors.length > 0) {
    instructionPrompt += `\n- **Color Palette Constraint:** The final image must strictly adhere to this color palette: ${editOptions.brandColors.join(', ')}. Use these colors intelligently to theme the creative. The primary color is ${editOptions.brandColors[0]}.`;
  }

  if (editOptions.newAspectRatio && editOptions.newAspectRatio !== 'original') {
     instructionPrompt += `\n- **Aspect Ratio Requirement:** The output image MUST have a final aspect ratio of ${editOptions.newAspectRatio}. Adapt the image's layout to fit this new aspect ratio gracefully, preserving the key elements.`;
  }

  if (editOptions.mentions && editOptions.mentions.length > 0) {
     instructionPrompt += `\n- **Targeted Hotspots:** The user referenced these editable regions: ${editOptions.mentions.join(', ')}. Prioritize edits that affect only these regions unless the user explicitly reports otherwise.`;
  }

  const promptParts: any[] = [
    { text: instructionPrompt },
    { text: "This is the image to edit:" },
    { inlineData: { data: baseImageBase64, mimeType: baseImageMimeType } },
  ];

  if (referenceImage) {
    promptParts.push({ text: "Use this image as a style reference:" });
    promptParts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
  }

  promptParts.push({ text: `User's instruction: "${prompt}"` });

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: { parts: promptParts },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
      temperature: 0.4,
    },
  });

  if (!result.candidates || result.candidates.length === 0 || !result.candidates[0].content || !result.candidates[0].content.parts) {
    const blockReason = result.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Editing failed due to: ${blockReason}. Please modify your request.`);
    }
    throw new Error("AI failed to edit the image. The response was empty.");
  }

  for (const part of result.candidates[0].content.parts) {
    const data = part.inlineData?.data;
    if (data) {
      return data; // Return the base64 of the edited image
    }
  }

  throw new Error("No edited image was found in the response.");
};

export const detectEditableRegions = async (imageBase64: string, mimeType: string): Promise<Mark[]> => {
    const ai = getAi();
    const prompt = `
        Analyze the provided creative template. Your task is to identify ALL distinct editable regions and extract their content. This includes logos, product images, headlines, body text, and other fields.
        
        For each region, you must provide:
        1.  A machine-friendly 'id' in camelCase (e.g., 'mainHeadline', 'contactEmail', 'logo'). The ID for the main brand logo should always be 'logo'.
        2.  A human-friendly 'label' (e.g., 'Main Headline', 'Contact Email', 'Logo').
        3.  The 'type' of the region, which MUST be either "text" or "image".
        4.  For regions of type "text", you MUST perform OCR and return the exact 'text' content you see. This field should be omitted for image regions.
        5.  The normalized center point coordinates (x, y) and dimensions (width, height), all between 0 and 1, where (0,0) is top-left.
        
        Only identify elements that are clearly intended to be replaced by a user. Be precise with the bounding boxes and text extraction.
    `;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { data: imageBase64, mimeType: mimeType } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    regions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING, description: "Unique ID in camelCase (e.g., mainHeadline). Use 'logo' for the primary brand logo." },
                                label: { type: Type.STRING, description: 'Human-friendly label (e.g., Main Headline).' },
                                type: { type: Type.STRING, description: 'Must be "text" or "image".' },
                                text: { type: Type.STRING, description: "The OCR-extracted text content. Only for type 'text'." },
                                x: { type: Type.NUMBER, description: 'Normalized center X coordinate (0-1).' },
                                y: { type: Type.NUMBER, description: 'Normalized center Y coordinate (0-1).' },
                                width: { type: Type.NUMBER, description: 'Normalized width (0-1).' },
                                height: { type: Type.NUMBER, description: 'Normalized height (0-1).' },
                            },
                            propertyOrdering: ["id", "label", "type", "text", "x", "y", "width", "height"],
                        }
                    }
                },
                propertyOrdering: ["regions"],
            }
        }
    });
    
    const jsonString = result.text;
    if (!jsonString) {
        const blockReason = result.promptFeedback?.blockReason;
        if (blockReason) {
            throw new Error(`Region detection failed due to: ${blockReason}.`);
        }
        // FIX: Throw error on empty response instead of failing silently.
        // This prevents the UI from getting stuck in an "analyzing" state if the API returns an empty response.
        throw new Error("Region detection failed: The API returned no content.");
    }
    
    const parsed = JSON.parse(jsonString.trim());

    if (parsed && parsed.regions && Array.isArray(parsed.regions)) {
        // The AI might return invalid data, so we filter to be safe
        return parsed.regions.filter((r: any) => 
            typeof r.id === 'string' &&
            typeof r.label === 'string' &&
            (r.type === 'text' || r.type === 'image') &&
            typeof r.x === 'number' &&
            typeof r.y === 'number' &&
            typeof r.width === 'number' &&
            typeof r.height === 'number'
        );
    }
    return [];
};

export const generateTemplateMetadata = async (
    imageBase64: string,
    mimeType: string
): Promise<{ title: string; prompt: string; tags: string[]; useCases: string[] }> => {
    const ai = getAi();
    const prompt = `
        You are an expert creative director and marketing analyst. Analyze the provided image, which is a creative template. Your task is to generate metadata that will help designers and users understand and use this template effectively.

        Provide the following in a JSON object:
        1.  **title**: A concise, descriptive, and SEO-friendly title for the template (max 10 words).
        2.  **prompt**: A detailed "AI Prompt" for end-users. This prompt should describe the template's scene, style, mood, composition, and key elements. It must guide the AI in maintaining the template's aesthetic when a user adds their own content.
        3.  **tags**: An array of 3-5 relevant keywords from the master list. The tags should accurately describe the template's style, use case, and industry.
        4.  **useCases**: An array of 3 highly practical recommendations, each no longer than 12 words. Focus on crisp distribution or activation ideas (e.g., "WhatsApp festival greeting for premium clients").
            - Master Tag List: ${ALL_TAGS.join(', ')}
    `;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "A concise, SEO-friendly title." },
                    prompt: { type: Type.STRING, description: "A detailed AI prompt for creative generation." },
                    tags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING, description: "A relevant tag from the master list." }
                    },
                    useCases: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING, description: "A concise, actionable use case for the template." }
                    }
                },
                propertyOrdering: ["title", "prompt", "tags", "useCases"],
            }
        }
    });

    const jsonString = result.text;
    if (!jsonString) {
        throw new Error("Metadata generation failed: The API returned no content.");
    }
    
    const parsed = JSON.parse(jsonString.trim());

    if (
        parsed &&
        typeof parsed.title === 'string' &&
        typeof parsed.prompt === 'string' &&
        Array.isArray(parsed.tags) &&
        Array.isArray(parsed.useCases)
    ) {
        return {
            title: parsed.title,
            prompt: parsed.prompt,
            tags: parsed.tags.filter((t: any) => typeof t === 'string' && ALL_TAGS.includes(t)),
            useCases: parsed.useCases
                .filter((u: any) => typeof u === 'string')
                .map((u: string) => u.trim())
                .filter((u: string) => u.length > 0)
                .map((u: string) => {
                    const words = u.split(/\s+/).filter(Boolean);
                    const limit = 12;
                    if (words.length <= limit) return u;
                    return words.slice(0, limit).join(' ');
                })
        };
    }

    throw new Error("Metadata generation failed: The API response was not in the expected format.");
};


export const extractColorsFromImage = async (imageBase64: string, mimeType: string): Promise<string[]> => {
    const ai = getAi();
    const prompt = `
        You are an expert brand designer. Analyze the provided logo image and identify its primary color palette.
        
        Return a JSON object containing an array of the 4 most prominent and representative colors as hex codes.
        The colors should be ordered from most dominant to least dominant.
    `;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { data: imageBase64, mimeType: mimeType } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    colors: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                            description: "A hex color code string (e.g., '#FFFFFF')."
                        }
                    }
                },
                propertyOrdering: ["colors"],
            }
        }
    });
    
    const jsonString = result.text;
    if (!jsonString) {
        const blockReason = result.promptFeedback?.blockReason;
        if (blockReason) {
            throw new Error(`Color extraction failed due to: ${blockReason}.`);
        }
        throw new Error("Color extraction failed: The API returned no candidates.");
    }
    
    const parsed = JSON.parse(jsonString.trim());

    if (parsed && parsed.colors && Array.isArray(parsed.colors)) {
        return parsed.colors.filter((c: any) => typeof c === 'string' && c.startsWith('#'));
    }

    throw new Error("Color extraction failed: The API response was not in the expected format.");
};

export const getTagsForSearchQuery = async (query: string): Promise<string[]> => {
    const ai = getAi();
    const prompt = `
        You are an expert creative director's assistant. A user is searching for a template with the following "wish": "${query}".
        
        Your task is to analyze this request and return a JSON array of 3-5 relevant keywords or tags that can be used to filter a library of creative templates.
        
        The available tags are: ${ALL_TAGS.join(', ')}. You can also generate other relevant keywords.
        
        Only return the JSON array of strings.
    `;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    tags: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                            description: "A relevant tag or keyword."
                        }
                    }
                },
                propertyOrdering: ["tags"],
            }
        }
    });

    const jsonString = result.text;
    if (!jsonString) {
        const blockReason = result.promptFeedback?.blockReason;
        if (blockReason) {
            throw new Error(`Tag generation failed due to: ${blockReason}.`);
        }
        return [];
    }
    
    const parsed = JSON.parse(jsonString.trim());
    if (parsed && parsed.tags && Array.isArray(parsed.tags)) {
        return parsed.tags.filter((t: any) => typeof t === 'string');
    }
    return [];
};


export const isApiConfigured = () => !!ai;
