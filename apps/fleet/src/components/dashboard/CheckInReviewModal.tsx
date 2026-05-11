import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { WeeklyCheckIn } from '../../types/check-in';
import { Check, X, AlertTriangle, User, ExternalLink, ZoomIn } from "lucide-react";
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface CheckInReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    checkIn: WeeklyCheckIn;
    driverName: string;
    onReview: (id: string, status: 'approved' | 'rejected', notes?: string) => Promise<void>;
}

export function CheckInReviewModal({ isOpen, onClose, checkIn, driverName, onReview }: CheckInReviewModalProps) {
    const [notes, setNotes] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = async (status: 'approved' | 'rejected') => {
        setIsLoading(true);
        try {
            await onReview(checkIn.id, status, notes);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const difference = checkIn.aiReading ? Math.abs(checkIn.odometer - checkIn.aiReading) : 0;
    const isSignificantDiff = difference > 100;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Review Manual Check-In</DialogTitle>
                    <DialogDescription>
                        Review the driver's manual entry against the provided photo evidence.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    {/* Left: Photo Evidence */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-slate-500">Photo Evidence</h4>
                            {checkIn.photoUrl && (
                                <Button variant="link" size="sm" className="h-auto p-0 text-indigo-600" onClick={() => window.open(checkIn.photoUrl, '_blank')}>
                                    <ExternalLink className="w-3 h-3 mr-1" /> Open Original
                                </Button>
                            )}
                        </div>
                        
                        <div className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video flex items-center justify-center shadow-inner">
                            {checkIn.photoUrl ? (
                                <>
                                    <ImageWithFallback 
                                        src={checkIn.photoUrl} 
                                        alt="Odometer" 
                                        className="w-full h-full object-contain"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer" onClick={() => window.open(checkIn.photoUrl, '_blank')}>
                                        <div className="bg-white/90 text-slate-900 px-4 py-2 rounded-full font-medium text-sm flex items-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform">
                                            <ZoomIn className="w-4 h-4 mr-2" />
                                            View Full Size
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-slate-500 flex flex-col items-center">
                                    <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                                    No Photo Provided
                                </div>
                            )}
                        </div>
                         <div className="text-xs text-slate-400">
                            Uploaded: {new Date(checkIn.timestamp).toLocaleString()}
                        </div>
                    </div>

                    {/* Right: Details & Action */}
                    <div className="space-y-6">
                        
                        {/* Driver Info */}
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="h-12 w-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700">
                                <User className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 text-lg">{driverName}</h3>
                                <p className="text-sm text-slate-500 font-mono">ID: {checkIn.driverId.substring(0,8)}</p>
                            </div>
                        </div>

                        {/* Odometer Comparison */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className={`p-5 rounded-xl border ${isSignificantDiff ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-100'}`}>
                                <span className={`text-xs font-bold uppercase tracking-wider ${isSignificantDiff ? 'text-red-600' : 'text-amber-600'}`}>
                                    Manual Entry
                                </span>
                                <div className={`text-3xl font-bold mt-2 ${isSignificantDiff ? 'text-red-900' : 'text-slate-900'}`}>
                                    {checkIn.odometer.toLocaleString()} <span className="text-sm font-normal text-slate-500">km</span>
                                </div>
                            </div>
                             <div className="p-5 bg-white rounded-xl border border-slate-200">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Reading</span>
                                <div className="text-3xl font-bold text-slate-700 mt-2">
                                    {checkIn.aiReading ? checkIn.aiReading.toLocaleString() : 'N/A'} <span className="text-sm font-normal text-slate-400">km</span>
                                </div>
                                {isSignificantDiff && (
                                    <div className="mt-2 text-xs text-red-600 font-medium">
                                        Diff: {difference.toLocaleString()} km
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Reason */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                Override Reason
                            </h4>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 italic relative">
                                <span className="absolute top-2 left-2 text-slate-300 text-4xl font-serif leading-none">"</span>
                                <p className="pl-4 relative z-10">{checkIn.manualReadingReason || 'No reason provided.'}</p>
                            </div>
                        </div>

                        {/* Notes Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Manager Notes (Optional)</label>
                            <Textarea 
                                placeholder="Add notes about this decision..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="h-20 resize-none"
                            />
                        </div>

                    </div>
                </div>

                <DialogFooter className="mt-8 gap-3 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <Button 
                            variant="destructive" 
                            onClick={() => handleAction('rejected')}
                            disabled={isLoading}
                            className="flex-1 sm:flex-none"
                        >
                           <X className="h-4 w-4 mr-2" /> Reject
                        </Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none" 
                            onClick={() => handleAction('approved')}
                            disabled={isLoading}
                        >
                            <Check className="h-4 w-4 mr-2" /> Approve
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
