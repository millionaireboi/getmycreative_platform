
import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { LoadingSpinner, CloseIcon, UploadIcon } from './icons.tsx';

export interface BrandAssetData {
    brandName: string;
    logoSrc: string | null;
    colors: string[];
    textStyle: string;
}

interface UploadBrandAssetsModalProps {
    onSubmit: (data: BrandAssetData) => void;
    onClose: () => void;
    isLoading: boolean;
}

// Helper function to convert RGB to Hex
const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const UploadBrandAssetsModal: React.FC<UploadBrandAssetsModalProps> = ({ onSubmit, onClose, isLoading }) => {
    const [brandName, setBrandName] = useState('');
    const [logoSrc, setLogoSrc] = useState<string | null>(null);
    const [colors, setColors] = useState<string[]>(['#000000']);
    const [textStyle, setTextStyle] = useState('');
    const [show, setShow] = useState(false);
    const [autoExtract, setAutoExtract] = useState(true);
    const [isExtracting, setIsExtracting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setShow(true);
        inputRef.current?.focus();
    }, []);
    
    const handleClose = () => {
        if (isLoading || isExtracting) return;
        setShow(false);
        setTimeout(onClose, 300);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!brandName.trim() || isLoading) return;
        onSubmit({ brandName, logoSrc, colors, textStyle });
    };

    const handleColorChange = (index: number, value: string) => {
        const newColors = [...colors];
        newColors[index] = value;
        setColors(newColors);
    };

    const addColor = () => setColors([...colors, '#FFFFFF']);
    const removeColor = (index: number) => setColors(colors.filter((_, i) => i !== index));

    const extractColorsFromImage = async (imageSrc: string): Promise<string[]> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDimension = 100; // Scale down for performance
                const scale = Math.min(maxDimension / img.width, maxDimension / img.height, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const colorCounts: { [key: string]: number } = {};
                
                for (let i = 0; i < imageData.length; i += 4) {
                    const r = imageData[i];
                    const g = imageData[i+1];
                    const b = imageData[i+2];
                    const a = imageData[i+3];

                    // Ignore transparent, near-white, and near-black pixels
                    if (a < 128 || (r > 250 && g > 250 && b > 250) || (r < 10 && g < 10 && b < 10)) {
                        continue;
                    }

                    const rgb = `${r},${g},${b}`;
                    colorCounts[rgb] = (colorCounts[rgb] || 0) + 1;
                }

                const sortedColors = Object.keys(colorCounts)
                    .sort((a, b) => colorCounts[b] - colorCounts[a])
                    .slice(0, 5) // Get top 5 colors
                    .map(rgbStr => {
                        const [r, g, b] = rgbStr.split(',').map(Number);
                        return rgbToHex(r, g, b);
                    });
                
                resolve(sortedColors.length > 0 ? sortedColors : ['#000000']);
            };
            img.onerror = () => reject(new Error('Failed to load image for color extraction.'));
            img.src = imageSrc;
        });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const src = event.target?.result as string;
                setLogoSrc(src);

                if (autoExtract && src) {
                    setIsExtracting(true);
                    try {
                        const extracted = await extractColorsFromImage(src);
                        setColors(extracted);
                    } catch (error) {
                        console.error(error);
                        setColors(['#000000']);
                    } finally {
                        setIsExtracting(false);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const canSubmit = brandName.trim() && logoSrc;

    return (
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
        >
            <div 
                className={`w-full max-w-3xl transform rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[var(--ai-shadow-strong)] transition-all duration-300 ${show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">Upload Brand Assets</h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors" disabled={isLoading || isExtracting}>
                        <CloseIcon />
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-6">Define your brand kit by uploading your logo and specifying your colors.</p>
                
                <input type="file" ref={fileInputRef} onChange={handleLogoUpload} style={{display: 'none'}} accept="image/png, image/jpeg, image/webp"/>

                <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
                    <div>
                        <label htmlFor="brand-name" className="mb-1 block text-sm font-medium text-slate-600">Brand Name</label>
                        <input
                            ref={inputRef} id="brand-name" type="text" value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder="e.g., 'Solstice Coffee Roasters'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                    </div>
                    
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-600">Logo</label>
                        <div onClick={() => !isExtracting && fileInputRef.current?.click()} className={`mt-1 flex justify-center rounded-2xl border-2 border-dashed border-slate-200 px-6 pt-5 pb-6 ${isExtracting ? 'cursor-wait bg-slate-50' : 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30'} transition`}>
                            {logoSrc ? (
                                <img src={logoSrc} alt="Logo preview" className="max-h-28 object-contain"/>
                            ) : (
                                <div className="space-y-1 text-center">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                        <UploadIcon />
                                    </div>
                                    <p className="text-sm font-medium text-slate-700">Upload a file</p>
                                    <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 10MB</p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex items-center">
                        <input
                          id="auto-extract-colors"
                          name="auto-extract-colors"
                          type="checkbox"
                          checked={autoExtract}
                          onChange={(e) => setAutoExtract(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                        />
                        <label htmlFor="auto-extract-colors" className="ml-2 block text-sm font-medium text-slate-600">
                          Automatically extract palette from logo
                        </label>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center space-x-2">
                            <label className="block text-sm font-medium text-slate-600">Brand Colors</label>
                            {isExtracting && <LoadingSpinner />}
                        </div>
                        <div className="space-y-2">
                        {colors.map((color, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <input type="color" value={color} onChange={e => handleColorChange(index, e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-slate-200" disabled={isExtracting}/>
                                <input type="text" value={color} onChange={e => handleColorChange(index, e.target.value)} className="flex-grow rounded-md border border-slate-200 bg-white py-1 px-2 font-mono text-slate-800" disabled={isExtracting}/>
                                <button type="button" onClick={() => removeColor(index)} className="text-red-400 hover:text-red-600 text-2xl" disabled={isExtracting}>&times;</button>
                            </div>
                        ))}
                        </div>
                        <button type="button" onClick={addColor} className="mt-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700" disabled={isExtracting}>+ Add Color</button>
                    </div>

                    <div>
                        <label htmlFor="text-style-upload" className="mb-1 block text-sm font-medium text-slate-600">Text & Copywriting Style (Optional)</label>
                        <textarea
                            id="text-style-upload" rows={2} value={textStyle}
                            onChange={(e) => setTextStyle(e.target.value)}
                            placeholder="e.g., 'friendly, rustic, and artisanal'"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                            disabled={isLoading}
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !canSubmit || isExtracting}
                            className="w-full flex items-center justify-center rounded-xl bg-emerald-500 py-3 text-lg font-semibold text-white transition-all duration-200 hover:bg-emerald-600 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {isLoading || isExtracting ? <LoadingSpinner /> : 'Create Brand Kit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UploadBrandAssetsModal;
