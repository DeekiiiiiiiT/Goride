import { projectId, publicAnonKey } from '../utils/supabase/info';

export interface AIReceiptResult {
    odometer: number | null;
    liters: number | null;
    amount: number | null;
    pricePerLiter: number | null;
    date: string | null;
    stationName: string | null;
    confidence: number;
    correctionSuggested?: boolean;
    suggestedValue?: number;
    reason?: string;
}

export const aiVerificationService = {
    /**
     * Sends a receipt image to the AI for processing.
     */
    async processReceipt(imageBase64: string): Promise<AIReceiptResult> {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/ai/process-fuel-receipt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({ imageBase64 })
        });

        if (!response.ok) {
            throw new Error(`AI processing failed: ${response.statusText}`);
        }

        return await response.json();
    },

    /**
     * Performs a "Sense Check" on an odometer value against historical data.
     */
    async verifyOdometer(
        currentOdo: number, 
        previousOdo: number, 
        tripsDistance: number,
        previousDate?: string,
        currentDate?: string
    ): Promise<{
        isValid: boolean;
        confidence: number;
        correction?: number;
        message: string;
    }> {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/ai/verify-odometer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({ currentOdo, previousOdo, tripsDistance, previousDate, currentDate })
        });

        if (!response.ok) {
            throw new Error(`Odometer verification failed: ${response.statusText}`);
        }

        return await response.json();
    }
};