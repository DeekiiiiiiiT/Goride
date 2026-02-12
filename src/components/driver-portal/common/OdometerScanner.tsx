// cache-bust: force recompile — 2026-02-10
import React, { useState, useRef } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Camera, AlertTriangle, ScanLine, CheckCircle, RotateCcw } from 'lucide-react';
import { api } from '../../../services/api';
import { motion, AnimatePresence } from 'motion/react';

export interface ScanResult {
    reading: number;
    photo: File;
    method: 'ai_verified' | 'manual_override';
    confidence?: string;
    manualReason?: string;
}

interface OdometerScannerProps {
    onScanComplete: (result: ScanResult) => void;
    onCancel: () => void;
    lastOdometer?: number; // Added for verification
    className?: string;
}

type ScannerStep = 'CAPTURE' | 'ANALYZING' | 'CONFIRM_AI' | 'MANUAL_ENTRY';

export function OdometerScanner({ onScanComplete, onCancel, lastOdometer = 0, className }: OdometerScannerProps) {
    const [step, setStep] = useState<ScannerStep>('CAPTURE');
    const [odometer, setOdometer] = useState<string>('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [scanResult, setScanResult] = useState<{ reading: number | null, confidence: string } | null>(null);
    const [manualReason, setManualReason] = useState<string>('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const odometerValue = parseFloat(odometer) || 0;
    const isDecreasing = lastOdometer > 0 && odometerValue > 0 && odometerValue < lastOdometer;
    const isHighJump = lastOdometer > 0 && odometerValue > (lastOdometer + 1500); // Flag > 1500km since last entry

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhoto(file);
            
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
                setStep('ANALYZING'); // Trigger analysis
                analyzePhoto(file);
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzePhoto = async (file: File) => {
        setErrorMsg(null);
        try {
            const res = await api.scanOdometerWithAI(file);
            if (res.data && res.data.reading !== null) {
                setScanResult(res.data);
                setOdometer(res.data.reading.toString());
                setStep('CONFIRM_AI');
            } else {
                handleScanFailure("Could not detect a clear odometer reading.");
            }
        } catch (err) {
            handleScanFailure("AI Analysis failed. Please try again.");
        }
    };

    const handleScanFailure = (msg: string) => {
        if (retryCount >= 1) {
            // Second failure (or more), force manual
            setErrorMsg("AI Verification failed multiple times. Please enter manually.");
            setManualReason("AI Verification Failed: " + msg);
            setStep('MANUAL_ENTRY');
        } else {
            // First failure, allow retry
            setErrorMsg(msg + " Please ensure the odometer is clearly visible.");
            setRetryCount(prev => prev + 1);
            setStep('CAPTURE');
        }
    };

    const handleConfirmAI = () => {
        if (!photo) return;
        onScanComplete({
            reading: parseFloat(odometer),
            photo: photo,
            method: 'ai_verified',
            confidence: scanResult?.confidence
        });
    };

    const handleManualSubmit = async () => {
        if (!odometer || !photo) return;
        
        // Final sanity check before AI verification
        if (isDecreasing) return;

        setIsVerifying(true);
        try {
            // Call the AI verification endpoint to check if the manual entry is a typo
            const verification = await api.verifyOdometerWithAI(
                odometerValue, 
                lastOdometer || 0,
                0 // distance placeholder
            );

            if (!verification.isValid && verification.confidence > 0.8) {
                setErrorMsg(`AI Audit: ${verification.message}`);
                if (verification.correction) {
                    setOdometer(verification.correction.toString());
                    setErrorMsg(`${verification.message}. We've suggested a correction.`);
                }
                setIsVerifying(false);
                return;
            }
        } catch (err) {
            console.error("Verification failed", err);
        }

        setIsVerifying(false);
        onScanComplete({
            reading: parseFloat(odometer),
            photo: photo,
            method: 'manual_override',
            manualReason: manualReason || 'User manual override'
        });
    };

    return (
        <div className={`w-full max-w-md mx-auto ${className}`}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {step === 'CAPTURE' && (
                        <div className="space-y-4">
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
                                <div className="bg-white p-2 rounded-lg shadow-sm">
                                    <ScanLine className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div className="text-xs text-indigo-900 leading-relaxed">
                                    <p className="font-bold mb-1 uppercase tracking-wider">Odometer Verification</p>
                                    <p className="opacity-80">Please capture a clear photo of your dashboard odometer to verify mileage.</p>
                                </div>
                            </div>

                            <div 
                                className="bg-slate-50 p-8 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors text-center space-y-4 cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                                    <Camera className="w-10 h-10 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg text-slate-900">Take Photo</h3>
                                    <p className="text-sm text-slate-500 mt-1">Capture the dashboard with clear mileage</p>
                                </div>
                                <Button 
                                    variant="default" 
                                    className="w-full max-w-xs mx-auto mt-4 bg-indigo-600 hover:bg-indigo-700"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                    }}
                                >
                                    <Camera className="w-4 h-4 mr-2" />
                                    Open Camera
                                </Button>
                                <Input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment"
                                    className="hidden" 
                                    onChange={handlePhotoChange}
                                />
                            </div>

                            {errorMsg && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100"
                                >
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    {errorMsg}
                                </motion.div>
                            )}

                            <Button variant="ghost" className="w-full" onClick={onCancel}>
                                Cancel
                            </Button>
                        </div>
                    )}

                    {step === 'ANALYZING' && (
                        <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div className="relative w-32 h-32">
                                <div className="absolute inset-0 bg-indigo-500 rounded-full opacity-20 animate-ping"></div>
                                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                                <motion.div 
                                    className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-20"
                                    animate={{ top: ['0%', '100%', '0%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                />
                                {photoPreview && (
                                    <div className="absolute inset-2 overflow-hidden rounded-full border-4 border-white shadow-lg bg-slate-100 z-10">
                                        <img src={photoPreview} className="w-full h-full object-cover opacity-80" alt="Preview" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <h3 className="font-semibold text-xl text-slate-900">Analyzing Image</h3>
                                <p className="text-sm text-slate-500 mt-1 flex items-center justify-center gap-2">
                                    <ScanLine className="w-4 h-4 animate-pulse" />
                                    Extracting odometer reading...
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'CONFIRM_AI' && (
                        <div className="space-y-6">
                            <div className="aspect-video w-full bg-slate-900 rounded-xl overflow-hidden relative group">
                                {photoPreview && <img src={photoPreview} className="w-full h-full object-contain" alt="Captured" />}
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                                    <p className="text-white text-xs font-medium opacity-80">Captured Image</p>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 flex flex-col items-center gap-3 shadow-sm">
                                <div className="bg-white p-2 rounded-full shadow-sm">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-green-800 font-medium uppercase tracking-wide">AI Detected Reading</p>
                                    <p className="text-4xl font-bold text-slate-900 tracking-tight mt-1">
                                        {parseInt(odometer).toLocaleString()} <span className="text-lg font-normal text-slate-500">km</span>
                                    </p>
                                    {scanResult?.confidence && (
                                        <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            {scanResult.confidence === 'high' ? 'High Confidence' : 'Low Confidence'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Verification Nudges */}
                            {isDecreasing && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 items-start animate-shake">
                                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-red-900">
                                        <p className="font-bold">Impossible Reading</p>
                                        <p className="opacity-80">This reading ({odometerValue} km) is lower than your last recorded mileage ({lastOdometer} km). Please verify and retake the photo.</p>
                                    </div>
                                </div>
                            )}

                            {isHighJump && (
                                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex gap-3 items-start">
                                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-orange-900">
                                        <p className="font-bold">Significant Mileage Jump</p>
                                        <p className="opacity-80">You've logged over 1,500km since your last entry. If this is correct, please proceed. Otherwise, please check for typos.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button variant="outline" className="flex-1" onClick={() => setStep('MANUAL_ENTRY')}>
                                    No, it's wrong
                                </Button>
                                <Button className="flex-1" onClick={handleConfirmAI} disabled={isDecreasing}>
                                    Yes, Confirm
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'MANUAL_ENTRY' && (
                        <div className="space-y-6">
                            <div className="flex items-start gap-4 p-4 bg-amber-50 text-amber-900 text-sm rounded-xl border border-amber-200 shadow-sm">
                                <div className="bg-amber-100 p-2 rounded-full shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-amber-800 mb-1">Manual Override Required</p>
                                    <p className="opacity-90 leading-relaxed">This reading will require manager approval. Please verify your entry carefully against the photo.</p>
                                </div>
                            </div>

                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="manual-odo" className="text-slate-700">Odometer Reading (km)</Label>
                                    <div className="relative">
                                        <Input
                                            id="manual-odo"
                                            type="number"
                                            value={odometer}
                                            onChange={(e) => setOdometer(e.target.value)}
                                            placeholder="e.g. 45200"
                                            className="pl-4 text-lg font-medium"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">km</div>
                                    </div>
                                    {lastOdometer > 0 && (
                                        <p className="text-[10px] text-slate-500 font-medium">Last recorded: {lastOdometer.toLocaleString()} km</p>
                                    )}
                                </div>

                                {/* Verification Nudges */}
                                {isDecreasing && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-3 items-start">
                                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-red-900 leading-tight">
                                            <b>Mileage cannot decrease.</b> Current entry is less than last recorded ({lastOdometer} km).
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="manual-reason" className="text-slate-700">Reason for Override</Label>
                                    <Textarea
                                        id="manual-reason"
                                        value={manualReason}
                                        onChange={(e) => setManualReason(e.target.value)}
                                        placeholder="Why is the AI reading incorrect? (e.g. blurry, glare, dirt)"
                                        className="resize-none"
                                        rows={3}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button variant="ghost" className="flex-1" onClick={() => setStep('CAPTURE')}>
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Retake Photo
                                </Button>
                                <Button className="flex-1" onClick={handleManualSubmit} disabled={!odometer || isDecreasing || isVerifying}>
                                    {isVerifying ? (
                                        <>
                                            <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : 'Submit'}
                                </Button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}