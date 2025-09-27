import type { GoogleGenAI } from "@google/genai";
import { Modality, Type } from "@google/genai";
import type { Board, CanvasElement, ImageElement, OrchestrationPlan, ImageAnalysis, TextAnalysis, ProductAnalysis } from '../types';
import { getGeminiClient } from '../../services/geminiService.ts';
import { buildWhiteboardContextSummary } from './contextBuilder.ts';
import { recordUsageEvent, type UsageEventStatus } from '../../services/usageLogger.ts';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

let cachedAi: GoogleGenAI | null = null;

const getAi = (): GoogleGenAI => {
    if (!cachedAi) {
        cachedAi = getGeminiClient();
    }
    return cachedAi;
};

const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const generateRequestId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Math.random().toString(36).slice(2, 10)}`;

const countInlineImages = (result: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> }): number => {
    if (!result?.candidates) return 0;
    return result.candidates.reduce((candidateTotal, candidate) => {
        const parts = candidate?.content?.parts ?? [];
        const inlineCount = parts.reduce((total, part) => (part?.inlineData?.data ? total + 1 : total), 0);
        return candidateTotal + inlineCount;
    }, 0);
};

const logGeminiUsage = (
    params: {
        actionType: string;
        modelUsed: string;
        result?: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
        imageCount?: number;
        status?: UsageEventStatus;
        latencyMs: number;
        error?: unknown;
        extra?: Record<string, unknown>;
        requestId?: string;
    }
): void => {
    const { actionType, modelUsed, result, imageCount, status = 'success', latencyMs, error, extra, requestId } = params;
    const usageMetadata = result?.usageMetadata;
    const errorCode = status === 'error'
        ? (error instanceof Error ? error.message : String(error ?? 'unknown'))
        : undefined;

    void recordUsageEvent({
        actionType,
        modelUsed,
        status,
        imageCount: typeof imageCount === 'number' ? imageCount : null,
        inputTokenCount: usageMetadata?.promptTokenCount ?? null,
        outputTokenCount: usageMetadata?.candidatesTokenCount ?? null,
        totalTokenCount: usageMetadata?.totalTokenCount ?? null,
        latencyMs,
        errorCode,
        extra,
        requestId,
    });
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
    const requestStartedAt = now();
    const requestId = generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
    try {
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;
        const jsonStr = apiResult.text?.trim();
        if (!jsonStr) {
            throw new Error('Image analysis response contained no text.');
        }
        const parsed = JSON.parse(jsonStr) as ImageAnalysis;
        logGeminiUsage({
            actionType: 'aiStudio.analyzeImageContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            requestId,
        });
        return parsed;
    } catch (error) {
        console.error("Error analyzing image:", error);
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.analyzeImageContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            requestId,
        });
        return {}; // Return empty object on failure
    }
};

export const analyzeProductImageContent = async (src: string): Promise<ProductAnalysis> => {
    const requestStartedAt = now();
    const requestId = generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
    try {
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;
        const jsonStr = apiResult.text?.trim();
        if (!jsonStr) {
            throw new Error('Product analysis response contained no text.');
        }
        const parsed = JSON.parse(jsonStr) as ProductAnalysis;
        logGeminiUsage({
            actionType: 'aiStudio.analyzeProductImageContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            requestId,
        });
        return parsed;
    } catch (error) {
        console.error("Error analyzing product image:", error);
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.analyzeProductImageContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            requestId,
        });
        return {}; // Return empty object on failure
    }
};

export const removeImageBackground = async (src: string): Promise<string> => {
    const requestStartedAt = now();
    const requestId = generateRequestId();
    let apiLatencyMs = 0;
    let apiResult: any;
    try {
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;

        const inlineImageCount = countInlineImages(apiResult);

        const candidates = apiResult.candidates ?? [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts ?? [];
            for (const part of parts) {
                const inlineData = part.inlineData;
                if (inlineData?.data && inlineData.mimeType) {
                    const base64ImageBytes = inlineData.data;
                    const mimeType = inlineData.mimeType;
                    logGeminiUsage({
                        actionType: 'aiStudio.removeImageBackground',
                        modelUsed: 'gemini-2.5-flash-image-preview',
                        result: apiResult,
                        imageCount: inlineImageCount,
                        latencyMs: apiLatencyMs,
                        requestId,
                    });
                    return `data:${mimeType};base64,${base64ImageBytes}`;
                }
            }
        }
        throw new Error("AI did not return an image with the background removed.");

    } catch (error) {
        console.error("Error removing image background:", error);
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.removeImageBackground',
            modelUsed: 'gemini-2.5-flash-image-preview',
            result: apiResult,
            imageCount: apiResult ? countInlineImages(apiResult) : 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            requestId,
        });
        throw new Error("Failed to remove background from image.");
    }
};


export const analyzeTextContent = async (text: string): Promise<TextAnalysis> => {
    const requestStartedAt = now();
    const requestId = generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
    try {
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;
        const jsonStr = apiResult.text?.trim();
        if (!jsonStr) {
            throw new Error('Text analysis response contained no text.');
        }
        const parsed = JSON.parse(jsonStr) as TextAnalysis;
        logGeminiUsage({
            actionType: 'aiStudio.analyzeTextContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            extra: { textLength: text.length },
            requestId,
        });
        return parsed;
    } catch (error) {
        console.error("Error analyzing text:", error);
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.analyzeTextContent',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            extra: { textLength: text.length },
            requestId,
        });
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

    const requestStartedAt = now();
    const requestId = generateRequestId();
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
            imageSrc ? Promise.resolve(imageSrc) : generateImage(prompt, { requestId }),
        ]);

        recordUsageEvent({
            actionType: 'aiStudio.generateVideo',
            modelUsed: 'veo-2.0-generate-001',
            imageCount: 1,
            latencyMs: now() - requestStartedAt,
            videoSeconds: videoInfo?.video?.duration ? Number(videoInfo.video.duration) : undefined,
            extra: {
                providedImage: Boolean(imageSrc),
            },
            requestId,
        });

        return { videoUrl, posterUrl };
    } catch (error) {
        console.error("Error generating video:", error);
        const latencyMs = now() - requestStartedAt;
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'unknown');
        const isSafety = error instanceof Error && error.message.toLowerCase().includes('safety');
        recordUsageEvent({
            actionType: 'aiStudio.generateVideo',
            modelUsed: 'veo-2.0-generate-001',
            status: 'error',
            latencyMs,
            errorCode: errorMessage,
            videoSeconds: videoInfo?.video?.duration ? Number(videoInfo.video.duration) : undefined,
            extra: {
                providedImage: Boolean(imageSrc),
            },
            requestId,
        });
        if (isSafety) {
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
    brandInfo?: { colors?: string[]; logo?: ImageElement },
    requestId?: string,
): Promise<string> => {
    const requestStartedAt = now();
    const localRequestId = requestId ?? generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
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
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;

        const finalImages: string[] = [];
        const candidates = apiResult.candidates ?? [];
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

        logGeminiUsage({
            actionType: 'aiStudio.assembleCreative',
            modelUsed: 'gemini-2.5-flash-image-preview',
            result: apiResult,
            imageCount: finalImages.length,
            latencyMs: apiLatencyMs,
            extra: {
                sourceImages: sourceImages.length,
                mentionsCount: mentions.length,
                hasBrandLogo: Boolean(brandInfo?.logo),
            },
            requestId: localRequestId,
        });

        return finalImages[0];
    } catch (error) {
        console.error("Error assembling creative:", error);
        if (error instanceof Error && error.message.toLowerCase().includes('responsible ai')) {
            throw new Error("Image remixing was blocked for safety reasons. Please try a different prompt.");
        }
        logGeminiUsage({
            actionType: 'aiStudio.assembleCreative',
            modelUsed: 'gemini-2.5-flash-image-preview',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs || (now() - requestStartedAt),
            status: 'error',
            error,
            requestId: localRequestId,
        });
        throw new Error("Failed to remix content.");
    }
};

export const generateImage = async (prompt: string, options?: { requestId?: string }): Promise<string> => {
    const requestStartedAt = now();
    const requestId = options?.requestId ?? generateRequestId();
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
            recordUsageEvent({
                actionType: 'aiStudio.generateImage',
                modelUsed: 'imagen-4.0-generate-001',
                imageCount: 1,
                latencyMs: now() - requestStartedAt,
                extra: {
                    promptLength: finalPrompt.length,
                },
                requestId,
            });
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
        recordUsageEvent({
            actionType: 'aiStudio.generateImage',
            modelUsed: 'imagen-4.0-generate-001',
            status: 'error',
            latencyMs: now() - requestStartedAt,
            errorCode: error instanceof Error ? error.message : String(error ?? 'unknown'),
            requestId,
        });
        throw new Error(errorMessage);
    }
};

export const generateTextVariations = async (
    prompt: string,
    style?: string,
    options?: { requestId?: string },
): Promise<string[]> => {
    const requestStartedAt = now();
    const requestId = options?.requestId ?? generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
    try {
        const fullPrompt = `You are a creative copywriter. Based on the theme "${prompt}"${style ? ` and the desired style "${style}"` : ''}, generate 4 distinct, short text variations. These could be headlines, slogans, or short descriptions. The tone should be creative and engaging. Return the result as a JSON array of strings.`;
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;
        const jsonStr = apiResult.text?.trim();
        if (!jsonStr) {
            throw new Error('Text variation response contained no text.');
        }
        const result = JSON.parse(jsonStr);
        logGeminiUsage({
            actionType: 'aiStudio.generateTextVariations',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            extra: {
                promptLength: prompt.length,
                styleProvided: Boolean(style),
            },
            requestId,
        });
        return result.variations as string[];
    } catch (error) {
        console.error("Error generating text variations:", error);
        if (error instanceof Error && error.message.toLowerCase().includes('safety')) {
            throw new Error("Text generation was blocked for safety reasons. Please try a different prompt.");
        }
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.generateTextVariations',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            extra: {
                promptLength: prompt.length,
                styleProvided: Boolean(style),
            },
            requestId,
        });
        throw new Error("Failed to generate text variations.");
    }
};

const generateColorPalette = async (prompt: string, requestId?: string): Promise<string[]> => {
    const requestStartedAt = now();
    const localRequestId = requestId ?? generateRequestId();
    let apiResult: any;
    let apiLatencyMs = 0;
    try {
        apiResult = await getAi().models.generateContent({
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
        apiLatencyMs = now() - requestStartedAt;
        const jsonStr = apiResult.text?.trim();
        if (!jsonStr) {
            throw new Error('Color palette response contained no text.');
        }
        const result = JSON.parse(jsonStr);
        logGeminiUsage({
            actionType: 'aiStudio.generateColorPalette',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            extra: { promptLength: prompt.length },
            requestId: localRequestId,
        });
        return result.palette as string[];
    } catch (error) {
        console.error("Error generating color palette:", error);
        if (apiLatencyMs === 0) {
            apiLatencyMs = now() - requestStartedAt;
        }
        logGeminiUsage({
            actionType: 'aiStudio.generateColorPalette',
            modelUsed: 'gemini-2.5-flash',
            result: apiResult,
            imageCount: 0,
            latencyMs: apiLatencyMs,
            status: 'error',
            error,
            extra: { promptLength: prompt.length },
            requestId: localRequestId,
        });
        throw new Error("Failed to generate color palette.");
    }
};

export const generateBrandIdentity = async (
    brandConcept: string, 
    palettePrompt: string, 
    textStyle: string
): Promise<{ logoSrc: string; colors: string[]; texts: string[] }> => {
    try {
        const requestId = generateRequestId();
        const logoPrompt = `a minimalist flat vector logo for ${brandConcept}, on a plain white background`;
        
        const [logoSrc, colors, texts] = await Promise.all([
            generateImage(logoPrompt, { requestId }),
            generateColorPalette(palettePrompt, requestId),
            generateTextVariations(brandConcept, textStyle, { requestId }),
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
    const requestId = generateRequestId();
    onProgress?.('Creative Director is analyzing the brief...');

    const allContentElements = sourceBoards.flatMap(b => b.elements);

    // 1. Asset Analysis Summary for the Creative Director
    const { availableBoardsDescription, brandInfoDescription } = buildWhiteboardContextSummary(sourceBoards, brandInfo);
    
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
      ${brandInfoDescription || ''}

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

    const plannerStartedAt = now();
    let plannerResult: any;
    let plannerLatencyMs = 0;
    try {
        plannerResult = await getAi().models.generateContent({
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
    } catch (error) {
        plannerLatencyMs = now() - plannerStartedAt;
        logGeminiUsage({
            actionType: 'aiStudio.orchestrateRemix.plan',
            modelUsed: 'gemini-2.5-flash',
            result: plannerResult,
            imageCount: 0,
            latencyMs: plannerLatencyMs,
            status: 'error',
            error,
            requestId,
        });
        throw error;
    }
    plannerLatencyMs = now() - plannerStartedAt;
    const planJson = plannerResult.text?.trim();
    if (!planJson) {
        throw new Error('Planner response contained no text.');
    }

    const plan: OrchestrationPlan = JSON.parse(planJson);
    logGeminiUsage({
        actionType: 'aiStudio.orchestrateRemix.plan',
        modelUsed: 'gemini-2.5-flash',
        result: plannerResult,
        imageCount: 0,
        latencyMs: plannerLatencyMs,
        extra: { tasksCount: plan.tasks?.length ?? 0 },
        requestId,
    });
    
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
            brandInfo,
            requestId,
        );
    });
    
    const finalImages = await Promise.all(finalImagesPromises);
    return finalImages;
};
