export const auditLogic = {
    /**
     * Determines if a new Immutable Anchor Point should be triggered based on usage.
     * Logic: Every 1,000km or 30 days.
     */
    shouldTriggerAnchor: (lastAnchor: any, currentReading: any): boolean => {
        if (!lastAnchor) return true;

        const distanceDelta = Math.abs(currentReading.value - lastAnchor.value);
        const timeDeltaDays = (new Date(currentReading.date).getTime() - new Date(lastAnchor.date).getTime()) / (1000 * 60 * 60 * 24);

        return distanceDelta >= 1000 || timeDeltaDays >= 30;
    },

    /**
     * Generates a forensic SHA-256 hash of the record data for tamper-evidence.
     * Binding spatial evidence and predictive leakage alerts to the record identity.
     */
    generateRecordHash: async (data: any): Promise<string> => {
        // Create a forensic bundle to ensure all integrity markers are signed
        const forensicBundle = {
            id: data.id,
            vehicleId: data.vehicleId,
            date: data.date,
            liters: data.liters,
            odometer: data.odometer,
            amount: data.amount,
            stationId: data.matchedStationId,
            // Spatial Binding
            geofence: {
                isInside: data.metadata?.geofenceMetadata?.isInside,
                distance: data.metadata?.geofenceMetadata?.distanceMeters,
                radius: data.metadata?.geofenceMetadata?.radiusAtTrigger
            },
            // Predictive Binding
            integrity: {
                status: data.metadata?.integrityStatus,
                leakageRisk: data.metadata?.leakageRisk,
                cycleId: data.metadata?.cycleId
            }
        };

        const msgUint8 = new TextEncoder().encode(JSON.stringify(forensicBundle));
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Verifies if a record has been tampered with by comparing its current hash
     * with the stored signature.
     */
    verifyRecordIntegrity: async (record: any, storedSignature: string): Promise<boolean> => {
        const currentData = { ...record };
        delete currentData.signature;
        delete currentData.verifiedAt;
        
        const currentHash = await auditLogic.generateRecordHash(currentData);
        return currentHash === storedSignature;
    }
};
