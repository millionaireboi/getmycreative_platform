import React, { useState, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { XIcon, UploadCloudIcon, SparklesIcon, PaletteIcon } from './icons.tsx';
import { BrandAsset } from '../types.ts';
import { fileToBase64 } from '../utils/fileUtils.ts';
import { extractColorsFromImage, isApiConfigured } from '../services/geminiService.ts';

interface BrandKitSetupModalProps {
  onClose: () => void;
}

type SetupStep = 'upload' | 'analyzing' | 'confirm';

export const BrandKitSetupModal = ({ onClose }: BrandKitSetupModalProps) => {
    const { setBrandColors, appUser } = useAuth();
    const [step, setStep] = useState<SetupStep>('upload');
    const [logoAsset, setLogoAsset] = useState<BrandAsset | null>(null);
    const [extractedColors, setExtractedColors] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || !event.target.files[0] || !isApiConfigured()) return;
        
        setError(null);
        setStep('analyzing');
        const file = event.target.files[0];
        
        try {
            const base64 = await fileToBase64(file);
            const asset = { file, previewUrl: `data:${file.type};base64,${base64}` , base64 };
            setLogoAsset(asset);

            const colors = await extractColorsFromImage(base64, file.type);
            setExtractedColors(colors);
            setStep('confirm');

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setError(`Failed to analyze logo: ${errorMessage}`);
            setStep('upload');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            await setBrandColors(extractedColors);
            onClose();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setError(`Failed to save brand kit: ${errorMessage}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartOver = () => {
        setStep('upload');
        setLogoAsset(null);
        setExtractedColors([]);
        setError(null);
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <PaletteIcon className="w-6 h-6 text-emerald-600" />
                            <h2 className="text-2xl font-bold text-gray-800 font-display">
                                My Brand Kit
                            </h2>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-slate-100">
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        Upload your logo to automatically extract your brand colors.
                    </p>
                </div>
                
                <div className="p-6">
                   {appUser?.brandColors && appUser.brandColors.length > 0 && step === 'upload' && (
                       <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                           <h3 className="font-semibold text-gray-800">Current Brand Colors</h3>
                           <div className="flex gap-2 mt-2">
                               {appUser.brandColors.map(color => (
                                   <div key={color} className="w-8 h-8 rounded-full border border-slate-200" style={{ backgroundColor: color }} title={color} />
                               ))}
                           </div>
                           <p className="text-xs text-gray-500 mt-2">Upload a new logo to replace these colors.</p>
                       </div>
                   )}
                   
                   {step === 'upload' && (
                        <div>
                            <label htmlFor="logo-upload" className="w-full flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
                                <UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400" />
                                <span className="mt-2 block text-sm font-medium text-gray-900">Upload your logo</span>
                                <span className="text-xs text-gray-500">PNG or JPG</span>
                            </label>
                            <input id="logo-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg" disabled={!isApiConfigured()} />
                            {!isApiConfigured() && <p className="text-xs text-center text-red-600 mt-2">Color extraction is disabled. Set API_KEY to enable.</p>}
                        </div>
                   )}

                   {step === 'analyzing' && (
                        <div className="text-center py-10">
                            <SparklesIcon className="w-10 h-10 text-emerald-500 mx-auto animate-spin mb-4" />
                            <h3 className="text-lg font-semibold text-gray-800">Analyzing your logo...</h3>
                            <p className="text-gray-500">Extracting your brand palette.</p>
                        </div>
                   )}

                   {step === 'confirm' && logoAsset && (
                        <div>
                            <div className="flex items-center gap-6">
                                <img src={logoAsset.previewUrl} alt="Logo Preview" className="w-24 h-24 object-contain rounded-lg bg-slate-50 p-2 border" />
                                <div>
                                    <h3 className="font-semibold text-gray-800">Here's your extracted palette:</h3>
                                    <div className="flex gap-2 mt-2">
                                        {extractedColors.map(color => (
                                            <div key={color} className="w-8 h-8 rounded-full border border-slate-200" style={{ backgroundColor: color }} title={color} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button onClick={handleStartOver} className="px-4 py-2 text-sm font-medium text-gray-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                                    Upload New Logo
                                </button>
                                <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:bg-emerald-300">
                                    {isSaving ? "Saving..." : "Save Brand Kit"}
                                </button>
                            </div>
                        </div>
                   )}

                   {error && <p className="text-sm text-red-600 mt-4 text-center">{error}</p>}
                </div>
            </div>
        </div>
    );
};
