import type { GoogleGenAI } from "@google/genai";
import { Modality, Type } from "@google/genai";
import type { Board, CanvasElement, ImageElement, OrchestrationPlan, ImageAnalysis, TextAnalysis, ProductAnalysis } from '../types';
import { getGeminiClient } from '../../services/geminiService.ts';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

let cachedAi: GoogleGenAI | null = null;

const getAi = (): GoogleGenAI => {
    if (!cachedAi) {
        cachedAi = getGeminiClient();
    }
    return cachedAi;
};

const dataUrlToImageBytes = (dataUrl: string): { mimeType: string; data: string } => {
    const parts = dataUrl.split(',');
    if (parts.length < 2) throw new Error("Invalid data URL");
    const meta = parts[0];
    const data = parts[1];
    const mimeType = meta.split(':')[1].split(';')[0];
    return { mimeType, data };
};

const imageToPart = (src: string) => {
    const { mimeType, data } = dataUrlToImageBytes(src);
    return {
        inlineData: {
            data,
            mimeType,
        },
    };
};


const fetchAsDataURL = async (url: string): Promise<string> => {
    if (!API_KEY) {
        throw new Error("Gemini API key is not configured.");
    }
    const response = await fetch(`${url}&key=${API_KEY}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch data from ${url}, status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const analyzeImageContent = async (src: string): Promise<ImageAnalysis> => {
    try {
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    imageToPart(src),
                    { text: "Analyze this image. Describe its style, mood, dominant color palette (as hex codes), typography style, composition, and key objects." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        style: { type: Type.STRING, description: "e.g., Minimalist, futuristic, vintage, bohemian." },
                        mood: { type: Type.STRING, description: "e.g., Luxurious, energetic, calm, mysterious." },
                        colorPalette: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of dominant hex codes." },
                        typography: { type: Type.STRING, description: "e.g., elegant serif, bold sans-serif, handwritten script." },
                        composition: { type: Type.STRING, description: "e.g., Rule of thirds, symmetrical, asymmetrical, negative space." },
                        objects: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key objects in the image." }
                    }
                }
            }
        });
        const jsonStr = response.text?.trim();
        if (!jsonStr) {
            throw new Error('Image analysis response contained no text.');
        }
        return JSON.parse(jsonStr) as ImageAnalysis;
    } catch (error) {
        console.error("Error analyzing image:", error);
        return {}; // Return empty object on failure
    }
};

export const analyzeProductImageContent = async (src: string): Promise<ProductAnalysis> => {
    try {
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    imageToPart(src),
                    { text: "Analyze this product image. Identify the main product, its category (e.g., shoe, furniture), and list its key visual features. Ignore the background and focus only on the product." }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        productName: { type: Type.STRING, description: "The specific name of the product if identifiable, otherwise a general name." },
                        productType: { type: Type.STRING, description: "The category of the product, e.g., 'sneaker', 'chair', 'handbag'." },
                        keyFeatures: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of key visual features of the product." },
                    },
                    required: ["productName", "productType", "keyFeatures"],
                }
            }
        });
        const jsonStr = response.text?.trim();
        if (!jsonStr) {
            throw new Error('Product analysis response contained no text.');
        }
        return JSON.parse(jsonStr) as ProductAnalysis;
    } catch (error) {
        console.error("Error analyzing product image:", error);
        return {}; // Return empty object on failure
    }
};

export const removeImageBackground = async (src: string): Promise<string> => {
    try {
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    imageToPart(src),
                    { text: 'Remove the background from this image. The new background should be transparent. Output only the resulting image.' },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const candidates = response.candidates ?? [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts ?? [];
            for (const part of parts) {
                const inlineData = part.inlineData;
                if (inlineData?.data && inlineData.mimeType) {
                    const base64ImageBytes = inlineData.data;
                    const mimeType = inlineData.mimeType;
                    return `data:${mimeType};base64,${base64ImageBytes}`;
                }
            }
        }
        throw new Error("AI did not return an image with the background removed.");

    } catch (error) {
        console.error("Error removing image background:", error);
        throw new Error("Failed to remove background from image.");
    }
};


export const analyzeTextContent = async (text: string): Promise<TextAnalysis> => {
    try {
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze this text: "${text}". Describe its sentiment, key keywords, and writing style.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        sentiment: { type: Type.STRING, description: "e.g., Positive, urgent, professional." },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of key keywords." },
                        style: { type: Type.STRING, description: "e.g., Formal, casual, witty, technical." }
                    }
                }
            }
        });
        const jsonStr = response.text?.trim();
        if (!jsonStr) {
            throw new Error('Text analysis response contained no text.');
        }
        return JSON.parse(jsonStr) as TextAnalysis;
    } catch (error) {
        console.error("Error analyzing text:", error);
        return {}; // Return empty object on failure
    }
};

export const generateVideo = async (
    prompt: string,
    onProgress: (message: string) => void,
    imageSrc?: string
): Promise<{ videoUrl: string; posterUrl: string }> => {
    if (!API_KEY) {
        throw new Error("Gemini API key is not configured.");
    }

    try {
        onProgress('Initiating video generation...');
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoRequest: any = {
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: {
                numberOfVideos: 1
            }
        };

        if (imageSrc) {
            const { mimeType, data } = dataUrlToImageBytes(imageSrc);
            videoRequest.image = {
                imageBytes: data,
                mimeType: mimeType,
            };
        }

        let operation = await getAi().models.generateVideos(videoRequest);

        const reassuringMessages = [
            "Warming up the digital film crew...",
            "Rendering the first few frames...",
            "Applying cinematic magic...",
            "Syncing audio and video...",
            "This can take a moment, good things come to those who wait!",
            "Almost there, just polishing the final cut...",
        ];
        let messageIndex = 0;

        onProgress(reassuringMessages[messageIndex++]);

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await getAi().operations.getVideosOperation({ operation: operation });
            if (!operation.done) {
                 onProgress(reassuringMessages[messageIndex % reassuringMessages.length]);
                 messageIndex++;
            }
        }
        
        onProgress('Finalizing video...');

        if (operation.error) {
            throw new Error(`Video generation failed: ${operation.error.message}`);
        }

        const videoInfo = operation.response?.generatedVideos?.[0];
        const downloadLink = videoInfo?.video?.uri;

        if (!downloadLink) {
            throw new Error("Video generation completed, but no video data was returned.");
        }
        
        onProgress('Downloading video and preparing poster...');

        const [videoUrl, posterUrl] = await Promise.all([
            fetchAsDataURL(downloadLink),
            imageSrc ? Promise.resolve(imageSrc) : generateImage(prompt),
        ]);

        return { videoUrl, posterUrl };
    } catch (error) {
        console.error("Error generating video:", error);
        if (error instanceof Error && error.message.toLowerCase().includes('safety')) {
             throw new Error("Video generation was blocked for safety reasons. Please try a different prompt.");
        }
        throw new Error("Failed to generate video.");
    }
};

/**
 * The final "Assembler" agent. Takes assets and a specific, detailed instruction to create ONE final image.
 */
const assembleCreative = async (
    prompt: string, // This is now the hyper-detailed, specific prompt from the planner
    assets: {
        sourceElements: CanvasElement[],
    },
    brandInfo?: { colors?: string[]; logo?: ImageElement }
): Promise<string> => {
    try {
        const sourceImages = assets.sourceElements.filter(el => el.type === 'image') as ImageElement[];
        
        // Extract mentions from the detailed prompt to identify which specific assets to use
        const mentions = [...new Set(prompt.match(/@\w+/g) || [])].map(m => m.substring(1));

        let imagesToInclude: ImageElement[] = sourceImages;
        if (mentions.length > 0 && sourceImages.some(img => img.label && mentions.includes(img.label))) {
            imagesToInclude = sourceImages.filter(img => img.label && mentions.includes(img.label));
        }

        const logoPart = brandInfo?.logo ? [imageToPart(brandInfo.logo.src)] : [];
        const imageParts = imagesToInclude.map(el => imageToPart(el.src));

        // The prompt is now used directly as it contains the full, dynamic brief from the Creative Director AI.
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    ...logoPart,
                    ...imageParts,
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const finalImages: string[] = [];
        const candidates = response.candidates ?? [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts ?? [];
            for (const part of parts) {
                const inlineData = part.inlineData;
                if (inlineData?.data && inlineData.mimeType) {
                    const base64ImageBytes = inlineData.data;
                    const mimeType = inlineData.mimeType;
                    finalImages.push(`data:${mimeType};base64,${base64ImageBytes}`);
                }
            }
        }
        
        if (finalImages.length === 0) {
            throw new Error("The AI did not return any remixed images. This can happen due to safety filters. Please adjust your prompt.");
        }

        return finalImages[0];
    } catch (error) {
        console.error("Error assembling creative:", error);
        if (error instanceof Error && error.message.toLowerCase().includes('responsible ai')) {
            throw new Error("Image remixing was blocked for safety reasons. Please try a different prompt.");
        }
        throw new Error("Failed to remix content.");
    }
};

export const generateImage = async (prompt: string): Promise<string> => {
    try {
        let finalPrompt = prompt;
        const socialMediaKeywords = ['social media', 'instagram post', 'facebook ad', 'creative', 'post', 'ad'];
        if (socialMediaKeywords.some(keyword => prompt.toLowerCase().includes(keyword))) {
            finalPrompt = `Create a single, visually stunning, publication-ready social media post graphic for: "${prompt}". The image should be a complete, polished creative, not a collage or grid of multiple options. Focus on a professional and engaging composition.`;
        }

        const response = await getAi().models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: finalPrompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: '1:1',
            },
        });

        const firstImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
        if (firstImageBytes) {
            return `data:image/png;base64,${firstImageBytes}`;
        }
        throw new Error("The AI returned no images. This can happen due to safety filters. Please try rephrasing your prompt.");
    } catch (error) {
        console.error("Error generating image:", error);
        let errorMessage = "Failed to generate image. Please check your prompt or API key.";
        if (error instanceof Error) {
            if (error.message.toLowerCase().includes('responsible ai')) {
                errorMessage = "Image generation was blocked for safety reasons. Please try a different prompt.";
            } else {
                 try {
                    const errorJson = JSON.parse(error.message);
                    if (errorJson?.error?.status === 'RESOURCE_EXHAUSTED' || errorJson?.error?.code === 429) {
                        errorMessage = "API rate limit exceeded. Please wait a moment and try again.";
                    }
                } catch (e) {
                    // Not a JSON error message, proceed with the generic message.
                }
            }
        }
        throw new Error(errorMessage);
    }
};

export const generateTextVariations = async (prompt: string, style?: string): Promise<string[]> => {
    try {
        const fullPrompt = `You are a creative copywriter. Based on the theme "${prompt}"${style ? ` and the desired style "${style}"` : ''}, generate 4 distinct, short text variations. These could be headlines, slogans, or short descriptions. The tone should be creative and engaging. Return the result as a JSON array of strings.`;
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        variations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ["variations"],
                },
            },
        });
        const jsonStr = response.text?.trim();
        if (!jsonStr) {
            throw new Error('Text variation response contained no text.');
        }
        const result = JSON.parse(jsonStr);
        return result.variations as string[];
    } catch (error) {
        console.error("Error generating text variations:", error);
        if (error instanceof Error && error.message.toLowerCase().includes('safety')) {
            throw new Error("Text generation was blocked for safety reasons. Please try a different prompt.");
        }
        throw new Error("Failed to generate text variations.");
    }
};

const generateColorPalette = async (prompt: string): Promise<string[]> => {
    try {
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Generate a 5-color palette based on the theme: "${prompt}". Return the result as a JSON object containing an array of 5 hex color code strings.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        palette: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING, description: 'A hex color code string, e.g., "#RRGGBB"' },
                        },
                    },
                    required: ["palette"],
                },
            },
        });
        const jsonStr = response.text?.trim();
        if (!jsonStr) {
            throw new Error('Color palette response contained no text.');
        }
        const result = JSON.parse(jsonStr);
        return result.palette as string[];
    } catch (error) {
        console.error("Error generating color palette:", error);
        throw new Error("Failed to generate color palette.");
    }
};

export const generateBrandIdentity = async (
    brandConcept: string, 
    palettePrompt: string, 
    textStyle: string
): Promise<{ logoSrc: string; colors: string[]; texts: string[] }> => {
    try {
        const logoPrompt = `a minimalist flat vector logo for ${brandConcept}, on a plain white background`;
        
        const [logoSrc, colors, texts] = await Promise.all([
            generateImage(logoPrompt),
            generateColorPalette(palettePrompt),
            generateTextVariations(brandConcept, textStyle)
        ]);

        return { logoSrc, colors, texts };
    } catch (error) {
        console.error("Error generating brand identity:", error);
        throw new Error("Failed to generate the full brand identity kit.");
    }
};

/**
 * The "Creative Director" agent. Creates a plan to fulfill the user's prompt.
 */
export const orchestrateRemix = async (
    prompt: string,
    sourceBoards: Board[],
    brandInfo?: { colors?: string[]; logo?: ImageElement },
    onProgress?: (message: string) => void
): Promise<string[]> => {
    onProgress?.('Creative Director is analyzing the brief...');

    const allContentElements = sourceBoards.flatMap(b => b.elements);

    // 1. Asset Analysis Summary for the Creative Director
    const availableBoardsDescription = sourceBoards.map(board => {
        const elementSummaries = board.elements.map(el => {
            let analysisSummary = 'No analysis available.';
            // Fix: Check if 'analysis' property exists on the element, as it's not present on all CanvasElement types (e.g., GroupElement).
            if ('analysis' in el && el.analysis) {
                if (el.type === 'image') {
                    const analysis = el.analysis as ImageAnalysis | ProductAnalysis;
                     if ('productName' in analysis && analysis.productName) {
                        analysisSummary = `Analyzed as: Product: ${analysis.productName} (${analysis.productType}), Features: ${analysis.keyFeatures?.join(', ')}.`;
                    } else if ('style' in analysis) {
                        const a = analysis as ImageAnalysis;
                        analysisSummary = `Analyzed as: Style: ${a.style}, Mood: ${a.mood}, Colors: ${a.colorPalette?.join(', ')}, Typography: ${a.typography}.`;
                    }
                } else if (el.type === 'text') {
                    const a = el.analysis;
                    analysisSummary = `Analyzed as: Style: ${a.style}, Sentiment: ${a.sentiment}, Keywords: ${a.keywords?.join(', ')}.`;
                }
            }
            // Fix: Check if 'label' property exists on the element, as it's not present on all CanvasElement types (e.g., GroupElement).
            return `    - Element @${'label' in el && el.label ? el.label : el.id.substring(0, 4)}: ${analysisSummary}`;
        }).join('\n');
        
        return `- Board (Type: '${board.type}', Title: '${board.title}') contains:\n${elementSummaries}`;
    }).join('\n');

    const brandInfoDescription: string[] = [];
    if (brandInfo?.logo?.label) brandInfoDescription.push(`- A Brand Board with a logo (@${brandInfo.logo.label})`);
    if (brandInfo?.colors) brandInfoDescription.push(`- Brand Colors are available: ${brandInfo.colors.join(', ')}`);
    
    const imageElements = allContentElements.filter(el => el.type === 'image') as ImageElement[];

    const imageParts = imageElements.map(el => imageToPart(el.src));
    const logoPart = brandInfo?.logo ? [imageToPart(brandInfo.logo.src)] : [];
    
    // 2. Planning Phase with Enriched, Analyzed Context
    const plannerPrompt = `
      You are a world-class Creative Director AI. Your task is to generate a hyper-detailed creative brief for a junior designer AI based on a user's goal and a set of pre-analyzed assets.

      **User's High-Level Goal:** "${prompt}"

      **Available Boards & Pre-Analyzed Assets:**
      You have been provided with images and text from several boards. Each element has been pre-analyzed by another AI to extract key creative attributes. YOU MUST USE THIS ANALYSIS to inform your creative direction.
      ${availableBoardsDescription || 'No content boards provided.'}
      ${brandInfoDescription.join('\n') || ''}

      **CRITICAL INSTRUCTIONS:**
      1.  **Identify Roles using ANALYSIS:** Do not rely on board titles alone. Use the detailed analysis to determine which board provides the visual **STYLE/AESTHETIC** (e.g., analysis shows 'minimalist', 'moody') and which provides the core **PRODUCT/ASSET** (e.g., analysis shows 'product shot', 'villa').
      2.  **Synthesize Analyzed Attributes:** Your main task is to synthesize the analyzed attributes into a new, cohesive concept. For example, if one board's analysis shows a "moody, dark color palette" and another contains a "product shot of a sneaker," your creative brief should explicitly call for a "moody, dramatic shot of the sneaker using a dark color palette."
      3.  **Create a NEW, Cohesive Creative:** The goal is a new, professional social media post, NOT a collage. Your concept must merge the analyzed style and asset.
      4.  **Asset Referencing:** In your brief, if you need to use a specific photo, refer to it by its @label.

      **YOUR FINAL TASK: Generate FOUR Distinct, Detailed Briefs**
      You will create four separate creative briefs, each as a detailed prompt for a 'socialMediaTemplate' task. Each brief MUST:
      1.  Start with a system instruction: "You are an expert graphic designer executing a detailed creative brief. Your task is to combine various assets into a single, polished, and publication-ready image, following the brief precisely."
      2.  Explicitly reference the analyzed attributes (e.g., "Use a style with dominant colors #2C3E50 and #ECF0F1...").
      3.  Provide a unique creative direction for each brief, ensuring the four final outputs will be visually distinct. Use creative directions like 'A clean, minimalist design', 'A dynamic composition with geometric shapes', 'An elegant, magazine-style layout', 'A bold, full-bleed image'.
      4.  Contain a 'what to avoid' section to prevent common errors like garbled text or bad image compositions.
      
      Return a single JSON object with a 'tasks' array containing exactly four 'socialMediaTemplate' tasks, each with its own detailed prompt. Do not include any other task types.
    `;

    const planResponse = await getAi().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { text: plannerPrompt },
                ...logoPart,
                ...imageParts,
            ],
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    tasks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                type: { type: Type.STRING },
                                description: { type: Type.STRING },
                                prompt: { type: Type.STRING },
                                dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
                            },
                            required: ["id", "type", "description", "prompt", "dependencies"],
                        },
                    },
                },
                required: ["tasks"],
            },
        },
    });

    const planJson = planResponse.text?.trim();
    if (!planJson) {
        throw new Error('Planner response contained no text.');
    }

    const plan: OrchestrationPlan = JSON.parse(planJson);
    
    // 3. Execution Phase
    onProgress?.('Creative Director has prepared 4 creative briefs. Executing...');

    const socialMediaTasks = plan.tasks.filter(task => task.type === 'socialMediaTemplate');

    if (socialMediaTasks.length === 0) {
        throw new Error("The Creative Director AI did not provide any final image briefs. Please try a different prompt.");
    }
    
    const finalImagesPromises = socialMediaTasks.map((task, index) => {
        onProgress?.(`Generating variation ${index + 1} of ${socialMediaTasks.length}: ${task.description}...`);
        return assembleCreative(
            task.prompt, // Pass the detailed, dynamic prompt from the plan
            { sourceElements: allContentElements },
            brandInfo
        );
    });
    
    const finalImages = await Promise.all(finalImagesPromises);
    return finalImages;
};
