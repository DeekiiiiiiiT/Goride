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
     * HMAC-SHA256 of the forensic bundle (Wave 1C).
     * Requires AUDIT_HMAC_SECRET — bare SHA-256 is forgeable without a server-side key.
     */
    generateRecordHash: async (data: any): Promise<string> => {
        const secret = Deno.env.get("AUDIT_HMAC_SECRET");
        if (!secret || !secret.trim()) {
            throw new Error("AUDIT_HMAC_SECRET is required for tamper-evident audit hashing");
        }

        const forensicBundle = {
            id: data.id,
            vehicleId: data.vehicleId,
            date: data.date,
            liters: data.liters,
            odometer: data.odometer,
            amount: data.amount,
            stationId: data.matchedStationId,
            geofence: {
                isInside: data.metadata?.geofenceMetadata?.isInside,
                distance: data.metadata?.geofenceMetadata?.distanceMeters,
                radius: data.metadata?.geofenceMetadata?.radiusAtTrigger
            },
            integrity: {
                status: data.metadata?.integrityStatus,
                leakageRisk: data.metadata?.leakageRisk,
                cycleId: data.metadata?.cycleId
            }
        };

        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(forensicBundle)));
        return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    },

    /**
     * Verifies if a record has been tampered with by comparing its current HMAC
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
