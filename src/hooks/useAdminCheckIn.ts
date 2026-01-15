import { useState } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { WeeklyCheckIn } from '../types/check-in';

export function useAdminCheckIn() {
    const [isReviewing, setIsReviewing] = useState(false);

    const reviewCheckIn = async (checkInId: string, status: 'approved' | 'rejected', notes?: string) => {
        setIsReviewing(true);
        try {
            const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/check-ins/review`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ checkInId, status, managerNotes: notes })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Review failed");
            }
            return true;
        } catch (e) {
            console.error("Error reviewing check-in:", e);
            throw e;
        } finally {
            setIsReviewing(false);
        }
    };

    return { reviewCheckIn, isReviewing };
}
