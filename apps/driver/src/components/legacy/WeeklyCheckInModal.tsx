// cache-bust: force recompile — 2026-02-10
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Camera, Upload, RefreshCw, CheckCircle, AlertTriangle, XCircle, ChevronRight, ScanLine } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { api } from '../../services/api';
import { motion, AnimatePresence } from 'motion/react';

type CheckInStep = 'CAPTURE' | 'ANALYZING' | 'CONFIRM_AI' | 'MANUAL_ENTRY' | 'SUBMITTING';

interface WeeklyCheckInModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (
        odometer: number, 
        photo: File | null,
        method: 'ai_verified' | 'manual_override',
        reviewStatus: 'auto_approved' | 'pending_review',
        aiReading: number | null,
        manualReadingReason?: string
    ) => Promise<void>;
    isLoading: boolean;
    isForced?: boolean;
}

export function WeeklyCheckInModal({ isOpen, onClose, onSubmit, isLoading, isForced = false }: WeeklyCheckInModalProps) {
    const [step, setStep] = useState<CheckInStep>('CAPTURE');
    const [odometer, setOdometer] = useState<string>('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [scanResult, setScanResult] = useState<{ reading: number | null, confidence: string } | null>(null);
    const [manualReason, setManualReason] = useState<string>('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStep('CAPTURE');
            setOdometer('');
            setPhoto(null);
            setPhotoPreview(null);
            setRetryCount(0);
            setScanResult(null);
            setManualReason('');
            setErrorMsg(null);
        }
    }, [isOpen]);

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

    const handleConfirmAI = async () => {
        setStep('SUBMITTING');
        await onSubmit(
            parseFloat(odometer),
            photo,
            'ai_verified',
            'auto_approved',
            scanResult?.reading || null,
            undefined
        );
    };

    const handleManualSubmit = async () => {
        if (!odometer) return;
        setStep('SUBMITTING');
        await onSubmit(
            parseFloat(odometer),
            photo,
            'manual_override',
            'pending_review',
            scanResult?.reading || null,
            manualReason || 'User manual override'
        );
    };

    const renderContent = () => {
        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="min-h-[300px]"
                >
                    {step === 'CAPTURE' && (
                        <div className="space-y-4 py-4">
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
                                <div className="bg-white p-2 rounded-lg shadow-sm">
                                    <ScanLine className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div className="text-xs text-indigo-900 leading-relaxed">
                                    <p className="font-bold mb-1 uppercase tracking-wider">Weekly Business Baseline</p>
                                    <p className="opacity-80">Every Monday, we establish a verified anchor to separate platform trips from personal mileage. Photo must be clear.</p>
                                </div>
                            </div>
                            <div 
                                className="bg-slate-50 p-8 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors text-center space-y-4 cursor-pointer"
                                onClick={() => document.getElementById('odo-photo-step')?.click()}
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
                                >
                                    <Camera className="w-4 h-4 mr-2" />
                                    Open Camera
                                </Button>
                                <Input 
                                    id="odo-photo-step" 
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
                            {retryCount > 0 && (
                                <p className="text-xs text-center text-slate-400">
                                    Attempt {retryCount + 1}/3
                                </p>
                            )}
                        </div>
                    )}

                    {step === 'ANALYZING' && (
                        <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center">
                            <div className="relative w-32 h-32">
                                    {/* Pulse Effect */}
                                    <div className="absolute inset-0 bg-indigo-500 rounded-full opacity-20 animate-ping"></div>
                                    
                                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                                    
                                    {/* Scanning Line */}
                                    <motion.div 
                                        className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-20"
                                        animate={{ top: ['0%', '100%', '0%'] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    />

                                    {photoPreview && (
                                    <div className="absolute inset-2 overflow-hidden rounded-full border-4 border-white shadow-lg bg-slate-100 z-10">
                                        <img src={photoPreview} className="w-full h-full object-cover opacity-80" />
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
                        <div className="space-y-6 py-4">
                            <div className="aspect-video w-full bg-slate-900 rounded-xl overflow-hidden relative group">
                                    {photoPreview && <img src={photoPreview} className="w-full h-full object-contain" />}
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
                            
                            <p className="text-center text-sm text-slate-500">
                                Please verify this matches the dashboard display exactly.
                            </p>
                        </div>
                    )}

                    {step === 'MANUAL_ENTRY' && (
                        <div className="space-y-6 py-4">
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
                                </div>

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
                        </div>
                    )}
                    
                    {step === 'SUBMITTING' && (
                        <div className="py-20 flex flex-col items-center justify-center space-y-6">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                            </div>
                            <div className="text-center">
                                <h3 className="font-medium text-lg text-slate-900">Submitting Check-In</h3>
                                <p className="text-slate-500 mt-1">Uploading photo and data...</p>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isForced && !open && onClose()}>
            <DialogContent className="sm:max-w-md" hideCloseButton={isForced} onPointerDownOutside={(e) => (isForced || step === 'ANALYZING' || step === 'SUBMITTING') && e.preventDefault()} onEscapeKeyDown={(e) => isForced && e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Weekly Odometer Check-In</DialogTitle>
                    <DialogDescription>
                        {step === 'CAPTURE' && "Step 1: Photo Verification"}
                        {step === 'ANALYZING' && "Step 2: Processing"}
                        {step === 'CONFIRM_AI' && "Step 3: Confirm Reading"}
                        {step === 'MANUAL_ENTRY' && "Manual Override"}
                    </DialogDescription>
                </DialogHeader>

                {renderContent()}

                <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                    {step === 'CAPTURE' && !isForced && (
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    )}
                    
                    {step === 'CONFIRM_AI' && (
                        <>
                            <Button variant="outline" onClick={() => setStep('MANUAL_ENTRY')}>
                                No, it's wrong
                            </Button>
                            <Button onClick={handleConfirmAI}>
                                Yes, Confirm
                            </Button>
                        </>
                    )}

                    {step === 'MANUAL_ENTRY' && (
                        <>
                            <Button variant="ghost" onClick={() => setStep('CAPTURE')}>Retake Photo</Button>
                            <Button onClick={handleManualSubmit} disabled={!odometer}>
                                Submit for Review
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}