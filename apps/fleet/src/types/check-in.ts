export interface WeeklyCheckIn {
    id: string;
    driverId: string;
    vehicleId: string;
    timestamp: string; // ISO Date
    odometer: number;
    photoUrl?: string;
    verified: boolean;
    weekStart: string; // The Monday date string this check-in belongs to

    // New fields for AI verification
    method?: 'ai_verified' | 'manual_override';
    reviewStatus?: 'auto_approved' | 'pending_review' | 'approved' | 'rejected';
    aiReading?: number | null;
    manualReadingReason?: string;
    managerNotes?: string;
    reviewedAt?: string;
}
