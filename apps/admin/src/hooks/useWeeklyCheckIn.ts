import { useState, useEffect } from 'react';
import { WeeklyCheckIn } from '../types/check-in';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function useWeeklyCheckIn(driverId: string | undefined) {
    const [needsCheckIn, setNeedsCheckIn] = useState(false);
    const [lastCheckIn, setLastCheckIn] = useState<WeeklyCheckIn | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const getWeekStart = () => {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(now.setDate(diff));
        monday.setHours(0,0,0,0);
        return monday.toISOString().split('T')[0];
    };

    const checkStatus = async () => {
        if (!driverId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const weekStart = getWeekStart();
            
            // Fetch check-ins
            const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/check-ins?driverId=${driverId}&weekStart=${weekStart}`, {
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            });
            const data = await response.json();
            
            if (data && Array.isArray(data) && data.length > 0) {
                setNeedsCheckIn(false);
                setLastCheckIn(data[0]);
            } else {
                setNeedsCheckIn(true);
            }
        } catch (e) {
            console.error("Error checking weekly status:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkStatus();
    }, [driverId]);

    const submitCheckIn = async (
        odometer: number, 
        photo: File | null, 
        vehicleId: string,
        method: 'ai_verified' | 'manual_override' = 'manual_override',
        reviewStatus: 'auto_approved' | 'pending_review' | 'approved' | 'rejected' = 'pending_review',
        aiReading: number | null = null,
        manualReadingReason?: string
    ) => {
        if (!driverId) return;
        
        // upload photo if exists
        let photoUrl = '';
        if (photo) {
             const formData = new FormData();
             formData.append('file', photo);
             const uploadRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/upload`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${publicAnonKey}` },
                 body: formData
             });
             const uploadData = await uploadRes.json();
             if (uploadData.url) photoUrl = uploadData.url;
        }
        
        const weekStart = getWeekStart();

        const payload: WeeklyCheckIn = {
            id: crypto.randomUUID(),
            driverId,
            vehicleId,
            timestamp: new Date().toISOString(),
            odometer,
            photoUrl,
            verified: reviewStatus === 'auto_approved' || reviewStatus === 'approved',
            weekStart,
            method,
            reviewStatus,
            aiReading,
            manualReadingReason,
            // Add metadata for unified timeline
            source: 'Weekly Check-in',
            isVerified: reviewStatus === 'auto_approved' || reviewStatus === 'approved'
        } as any;

        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/check-ins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        await checkStatus();
    };

    return { needsCheckIn, lastCheckIn, isLoading, submitCheckIn, refresh: checkStatus };
}
