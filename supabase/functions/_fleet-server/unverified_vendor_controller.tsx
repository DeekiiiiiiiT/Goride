import * as kv from './kv_store.tsx';

/**
 * Phase 6: Unverified Vendor Management
 * 
 * Get all unverified vendors, optionally filtered by status
 * 
 * @param status - Optional status filter: 'pending' | 'resolved'
 * @returns List of unverified vendors
 */
export async function getUnverifiedVendors(status?: 'pending' | 'resolved'): Promise<any[]> {
  try {
    const allVendors = await kv.getByPrefix('unverified_vendor:');
    
    if (!status) {
      return allVendors;
    }
    
    return allVendors.filter((vendor: any) => vendor.status === status);
  } catch (error: any) {
    console.error('[UnverifiedVendors] Error fetching vendors:', error);
    throw new Error(`Failed to fetch unverified vendors: ${error.message}`);
  }
}

/**
 * Get a single unverified vendor by ID
 * 
 * @param vendorId - Vendor ID
 * @returns Vendor details with linked transactions
 */
export async function getUnverifiedVendorById(vendorId: string): Promise<any> {
  try {
    const vendor = await kv.get(`unverified_vendor:${vendorId}`);
    
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    // Fetch linked transactions
    const transactions = await Promise.all(
      (vendor.transactionIds || []).map(async (txId: string) => {
        return await kv.get(`transaction:${txId}`);
      })
    );
    
    // Fetch resolved transactions
    const resolvedTransactions = await Promise.all(
      (vendor.resolvedTransactionIds || []).map(async (txId: string) => {
        return await kv.get(`transaction:${txId}`);
      })
    );
    
    // Fetch rejected transactions
    const rejectedTransactions = await Promise.all(
      (vendor.rejectedTransactionIds || []).map(async (txId: string) => {
        return await kv.get(`transaction:${txId}`);
      })
    );
    
    return {
      ...vendor,
      transactions: transactions.filter(Boolean),
      resolvedTransactions: resolvedTransactions.filter(Boolean),
      rejectedTransactions: rejectedTransactions.filter(Boolean)
    };
  } catch (error: any) {
    console.error(`[UnverifiedVendors] Error fetching vendor ${vendorId}:`, error);
    throw new Error(`Failed to fetch vendor: ${error.message}`);
  }
}

/**
 * Create or update an unverified vendor for a transaction
 * 
 * @param transactionId - Transaction ID
 * @param vendorName - Vendor name from transaction/fuel log
 * @param sourceType - How was this created: 'no_gps' | 'unmatched_name' | 'manual_entry'
 * @returns Created or updated vendor
 */
export async function createOrUpdateUnverifiedVendor(
  transactionId: string,
  vendorName: string,
  sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry' | 'legacy_migration' = 'manual_entry'
): Promise<any> {
  try {
    const transaction = await kv.get(`transaction:${transactionId}`);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    // Check if vendor already exists for this name
    const allVendors = await kv.getByPrefix('unverified_vendor:');
    let existingVendor = allVendors.find((v: any) => 
      v.name.toLowerCase() === vendorName.toLowerCase() && v.status === 'pending'
    );
    
    const now = new Date().toISOString();
    
    if (existingVendor) {
      // Update existing vendor
      if (!existingVendor.transactionIds.includes(transactionId)) {
        existingVendor.transactionIds.push(transactionId);
      }
      
      // Update metadata
      existingVendor.metadata = existingVendor.metadata || {};
      existingVendor.metadata.transactionCount = existingVendor.transactionIds.length;
      existingVendor.metadata.totalAmount = (existingVendor.metadata.totalAmount || 0) + Math.abs(transaction.amount || 0);
      existingVendor.metadata.lastSeen = now;
      
      if (transaction.driverId && !existingVendor.metadata.submittedBy.includes(transaction.driverId)) {
        existingVendor.metadata.submittedBy.push(transaction.driverId);
      }
      
      if (transaction.vehicleId && !existingVendor.metadata.vehicles.includes(transaction.vehicleId)) {
        existingVendor.metadata.vehicles.push(transaction.vehicleId);
      }
      
      await kv.set(`unverified_vendor:${existingVendor.id}`, existingVendor);
      
      console.log(`[UnverifiedVendors] Updated existing vendor ${existingVendor.id} with transaction ${transactionId}`);
      
      return existingVendor;
    } else {
      // Create new vendor
      const vendorId = `unverified_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newVendor = {
        id: vendorId,
        name: vendorName,
        status: 'pending',
        createdAt: now,
        transactionIds: [transactionId],
        sourceType,
        metadata: {
          totalAmount: Math.abs(transaction.amount || 0),
          transactionCount: 1,
          firstSeen: now,
          lastSeen: now,
          submittedBy: transaction.driverId ? [transaction.driverId] : [],
          vehicles: transaction.vehicleId ? [transaction.vehicleId] : []
        }
      };
      
      await kv.set(`unverified_vendor:${vendorId}`, newVendor);
      
      console.log(`[UnverifiedVendors] Created new vendor ${vendorId} for transaction ${transactionId}`);
      
      return newVendor;
    }
  } catch (error: any) {
    console.error('[UnverifiedVendors] Error creating/updating vendor:', error);
    throw new Error(`Failed to create/update vendor: ${error.message}`);
  }
}

/**
 * Resolve an unverified vendor by matching to an existing station
 * 
 * @param vendorId - Unverified vendor ID
 * @param stationId - Station to match to
 * @param resolvedBy - Admin user ID
 * @returns Updated vendor and transactions
 */
export async function resolveVendorToStation(
  vendorId: string,
  stationId: string,
  resolvedBy: string
): Promise<any> {
  try {
    const vendor = await kv.get(`unverified_vendor:${vendorId}`);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    const station = await kv.get(`station:${stationId}`);
    if (!station) {
      throw new Error('Station not found');
    }
    
    const now = new Date().toISOString();
    
    // Update vendor status
    vendor.status = 'resolved';
    vendor.resolvedAt = now;
    vendor.resolvedBy = resolvedBy;
    vendor.resolvedStationId = stationId;
    
    await kv.set(`unverified_vendor:${vendorId}`, vendor);
    
    // Update all linked transactions
    for (const txId of vendor.transactionIds || []) {
      const transaction = await kv.get(`transaction:${txId}`);
      if (transaction) {
        transaction.stationId = stationId;
        transaction.station = station.name;
        transaction.location = station.name;
        transaction.vendor = station.name;
        transaction.unverifiedVendorResolved = true;
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.stationGateHold = false;
        transaction.metadata.matchedStationId = stationId;
        transaction.metadata.vendorVerificationStatus = 'verified';
        transaction.metadata.vendorResolvedAt = now;
        transaction.metadata.vendorResolvedBy = resolvedBy;
        transaction.metadata.vendorMatchedAt = now;
        transaction.metadata.locationStatus = 'verified';
        transaction.metadata.verificationMethod = 'admin_vendor_resolution';
        transaction.metadata.gateReason = undefined;
        
        await kv.set(`transaction:${txId}`, transaction);
      }
    }
    
    console.log(`[UnverifiedVendors] Resolved vendor ${vendorId} to station ${stationId}`);
    
    return {
      vendor,
      station,
      summary: {
        transactionsUpdated: vendor.transactionIds.length
      }
    };
  } catch (error: any) {
    console.error('[UnverifiedVendors] Error resolving vendor:', error);
    throw new Error(`Failed to resolve vendor: ${error.message}`);
  }
}

/**
 * Reject an unverified vendor
 * 
 * @param vendorId - Unverified vendor ID
 * @param reason - Rejection reason
 * @param rejectedBy - Admin user ID
 * @returns Updated vendor
 */
export async function rejectVendor(
  vendorId: string,
  reason: string,
  rejectedBy: string
): Promise<any> {
  try {
    const vendor = await kv.get(`unverified_vendor:${vendorId}`);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    const now = new Date().toISOString();
    
    vendor.status = 'resolved'; // Mark as resolved but with rejection
    vendor.rejectedAt = now;
    vendor.rejectedBy = rejectedBy;
    vendor.rejectionReason = reason;
    
    await kv.set(`unverified_vendor:${vendorId}`, vendor);
    
    // Flag all linked transactions
    for (const txId of vendor.transactionIds || []) {
      const transaction = await kv.get(`transaction:${txId}`);
      if (transaction) {
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.vendorRejected = true;
        transaction.metadata.vendorRejectionReason = reason;
        transaction.metadata.vendorRejectedAt = now;
        transaction.metadata.flagged = true;
        transaction.metadata.flagReason = `Vendor rejected: ${reason}`;
        
        await kv.set(`transaction:${txId}`, transaction);
      }
    }
    
    console.log(`[UnverifiedVendors] Rejected vendor ${vendorId}: ${reason}`);
    
    return vendor;
  } catch (error: any) {
    console.error('[UnverifiedVendors] Error rejecting vendor:', error);
    throw new Error(`Failed to reject vendor: ${error.message}`);
  }
}

/**
 * Create a new station from an unverified vendor
 * 
 * @param vendorId - Unverified vendor ID
 * @param stationData - New station details
 * @param resolvedBy - Admin user ID
 * @returns Created station and resolution summary
 */
export async function createStationFromVendor(
  vendorId: string,
  stationData: { name: string; brand?: string; address?: string },
  resolvedBy: string
): Promise<any> {
  try {
    const vendor = await kv.get(`unverified_vendor:${vendorId}`);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    const now = new Date().toISOString();
    
    // Create new station
    const stationId = `station_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newStation = {
      id: stationId,
      name: stationData.name,
      brand: stationData.brand || stationData.name,
      address: stationData.address || 'Address to be updated',
      createdAt: now,
      createdFrom: 'unverified_vendor',
      sourceVendorId: vendorId,
      verified: true,
      active: true,
      metadata: {
        createdBy: resolvedBy,
        createdFromUnverifiedVendor: true
      }
    };
    
    await kv.set(`station:${stationId}`, newStation);
    
    // Update vendor status
    vendor.status = 'resolved';
    vendor.resolvedAt = now;
    vendor.resolvedBy = resolvedBy;
    vendor.resolvedStationId = stationId;
    vendor.createdStationId = stationId;
    
    await kv.set(`unverified_vendor:${vendorId}`, vendor);
    
    // Update all linked transactions
    let transactionsUpdated = 0;
    for (const txId of vendor.transactionIds || []) {
      const transaction = await kv.get(`transaction:${txId}`);
      if (transaction) {
        transaction.stationId = stationId;
        transaction.station = newStation.name;
        transaction.location = newStation.name;
        transaction.vendor = newStation.name;
        transaction.unverifiedVendorResolved = true;
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.stationGateHold = false;
        transaction.metadata.matchedStationId = stationId;
        transaction.metadata.vendorVerificationStatus = 'verified';
        transaction.metadata.vendorResolvedAt = now;
        transaction.metadata.vendorResolvedBy = resolvedBy;
        transaction.metadata.vendorMatchedAt = now;
        transaction.metadata.stationCreated = true;
        transaction.metadata.locationStatus = 'verified';
        transaction.metadata.verificationMethod = 'admin_vendor_resolution';
        transaction.metadata.gateReason = undefined;
        
        await kv.set(`transaction:${txId}`, transaction);
        transactionsUpdated++;
      }
    }
    
    console.log(`[UnverifiedVendors] Created station ${stationId} from vendor ${vendorId}, updated ${transactionsUpdated} transactions`);
    
    return {
      station: newStation,
      vendor,
      summary: {
        transactionsUpdated
      }
    };
  } catch (error: any) {
    console.error('[UnverifiedVendors] Error creating station from vendor:', error);
    throw new Error(`Failed to create station: ${error.message}`);
  }
}

/**
 * Phase 8: Legacy Data Migration
 * 
 * Scan for orphaned transactions and fuel logs that should have unverified vendors
 * but were created before the vendor gating system was implemented.
 * 
 * @param dryRun - If true, only preview what would be migrated without making changes
 * @returns Migration preview or execution results
 */
export async function migrateLegacyVendors(dryRun: boolean = true): Promise<any> {
  try {
    console.log(`[Migration] Starting legacy vendor migration (dryRun: ${dryRun})`);
    
    // Step 1: Discover orphaned transactions
    const allTransactions = await kv.getByPrefix('transaction:');
    const allFuelEntries = await kv.getByPrefix('fuel_entry:');
    
    // Criteria for orphaned transactions:
    // 1. Category is 'Fuel' or 'Fuel Reimbursement'
    // 2. vendor/merchant is "Unspecified Vendor" OR vendor is missing/empty
    // 3. No matchedStationId OR stationId
    // 4. Status is 'Pending' (not yet approved/rejected)
    
    const orphanedTransactions = allTransactions.filter((tx: any) => {
      const isFuelCategory = tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement';
      const hasUnspecifiedVendor = 
        !tx.vendor || 
        !tx.merchant ||
        tx.vendor === 'Unspecified Vendor' || 
        tx.merchant === 'Unspecified Vendor' ||
        tx.vendor.toLowerCase().includes('unspecified') ||
        tx.merchant?.toLowerCase().includes('unspecified');
      const hasNoVerifiedStation = !tx.matchedStationId && !tx.stationId && !tx.metadata?.matchedStationId;
      const isPending = tx.status === 'Pending' || !tx.status;
      
      return isFuelCategory && hasUnspecifiedVendor && hasNoVerifiedStation && isPending;
    });

    // Step 2: Discover orphaned fuel logs
    // Criteria:
    // 1. No matchedStationId
    // 2. No GPS coordinates (geofenceMetadata is missing or has no lat/lng)
    // 3. Has a location/vendor name
    // 4. Has a transactionId (linked to financial ledger)
    
    const orphanedFuelLogs = allFuelEntries.filter((log: any) => {
      const hasNoVerifiedStation = !log.matchedStationId;
      const hasNoGPS = !log.geofenceMetadata || 
                       !log.geofenceMetadata.lat || 
                       !log.geofenceMetadata.lng;
      const hasVendorName = log.location && log.location.trim() !== '';
      const hasTransaction = !!log.transactionId;
      
      return hasNoVerifiedStation && hasNoGPS && hasVendorName && hasTransaction;
    });

    console.log(`[Migration] Found ${orphanedTransactions.length} orphaned transactions`);
    console.log(`[Migration] Found ${orphanedFuelLogs.length} orphaned fuel logs`);

    // Step 3: Build individual transaction review list
    // Each item represents a single transaction that needs manual review
    const reviewQueue = orphanedTransactions.map((tx: any) => {
      // Find associated fuel log if exists
      const fuelLog = orphanedFuelLogs.find((log: any) => log.transactionId === tx.id);
      
      return {
        transactionId: tx.id,
        transaction: {
          id: tx.id,
          date: tx.date || tx.createdAt,
          amount: tx.amount,
          vendor: tx.vendor || tx.merchant || 'Unspecified Vendor',
          category: tx.category,
          description: tx.description,
          driverId: tx.driverId,
          driverName: tx.driverName,
          vehicleId: tx.vehicleId,
          vehicleName: tx.vehicleName,
          status: tx.status
        },
        fuelLog: fuelLog ? {
          id: fuelLog.id,
          location: fuelLog.location,
          litersFilled: fuelLog.litersFilled,
          odometerReading: fuelLog.odometerReading,
          date: fuelLog.date,
          gallons: fuelLog.gallons,
          pricePerGallon: fuelLog.pricePerGallon,
          pricePerLiter: fuelLog.pricePerLiter,
          totalAmount: fuelLog.totalAmount || fuelLog.amount,
          fuelType: fuelLog.fuelType,
          notes: fuelLog.notes,
          timestamp: fuelLog.timestamp
        } : null,
        suggestedVendorName: tx.vendor || tx.merchant || fuelLog?.location || 'Unspecified Vendor - Legacy',
        needsResolution: true
      };
    });

    const migrationSummary = {
      totalOrphanedTransactions: orphanedTransactions.length,
      totalOrphanedFuelLogs: orphanedFuelLogs.length,
      reviewQueueCount: reviewQueue.length,
      totalAmountAffected: reviewQueue.reduce((sum, item) => sum + Math.abs(item.transaction.amount || 0), 0),
      transactions: reviewQueue
    };

    console.log(`[Migration] Review queue: ${reviewQueue.length} transactions need individual review`);
    console.log(`[Migration] Total amount affected: $${migrationSummary.totalAmountAffected.toFixed(2)}`);

    // Always return individual transactions for review (no auto-creation)
    return {
      dryRun: true, // Always preview mode - no bulk actions
      preview: migrationSummary,
      message: `Found ${reviewQueue.length} transactions requiring individual review.`
    };
    
  } catch (error: any) {
    console.error('[Migration] Error during legacy vendor scan:', error);
    throw new Error(`Migration scan failed: ${error.message}`);
  }
}

/**
 * Process a single transaction from the migration queue
 * Creates an unverified vendor and links the transaction
 * 
 * @param transactionId - Transaction to process
 * @param action - How to handle: 'create_vendor' | 'match_station' | 'skip' | 'reject'
 * @param data - Additional data based on action type
 * @returns Processing result
 */
export async function processMigrationTransaction(
  transactionId: string,
  action: 'create_vendor' | 'match_station' | 'skip' | 'reject',
  data?: {
    stationId?: string;
    vendorName?: string;
    resolvedBy?: string;
    reason?: string;
  }
): Promise<any> {
  try {
    console.log(`[Migration] Processing transaction ${transactionId} with action: ${action}`);
    
    const transaction = await kv.get(`transaction:${transactionId}`);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    const now = new Date().toISOString();

    switch (action) {
      case 'create_vendor': {
        // Create unverified vendor for this transaction
        const vendorName = data?.vendorName || transaction.vendor || 'Unspecified Vendor - Legacy';
        const vendor = await createOrUpdateUnverifiedVendor(
          transactionId,
          vendorName,
          'manual_entry'
        );
        
        return {
          success: true,
          action: 'create_vendor',
          vendor,
          message: `Created unverified vendor "${vendorName}"`
        };
      }

      case 'match_station': {
        // Directly match to existing station
        if (!data?.stationId || !data?.resolvedBy) {
          throw new Error('Station ID and resolvedBy are required for match_station action');
        }

        const station = await kv.get(`station:${data.stationId}`);
        if (!station) {
          throw new Error(`Station not found: ${data.stationId}`);
        }

        // Update transaction directly
        transaction.stationId = data.stationId;
        transaction.station = station.name;
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.migratedAt = now;
        transaction.metadata.migrationAction = 'matched_station';
        transaction.metadata.resolvedBy = data.resolvedBy;
        transaction.metadata.locationStatus = 'verified';

        await kv.set(`transaction:${transactionId}`, transaction);

        return {
          success: true,
          action: 'match_station',
          station,
          transaction,
          message: `Matched to station "${station.name}"`
        };
      }

      case 'skip': {
        // Mark as deferred for later review
        transaction.metadata = transaction.metadata || {};
        transaction.metadata.migrationSkipped = true;
        transaction.metadata.migrationSkippedAt = now;
        transaction.metadata.migrationSkippedBy = data?.resolvedBy;
        
        await kv.set(`transaction:${transactionId}`, transaction);

        return {
          success: true,
          action: 'skip',
          message: 'Transaction skipped for later review'
        };
      }

      case 'reject': {
        // Mark as invalid/rejected
        if (!data?.reason) {
          throw new Error('Reason is required for reject action');
        }

        transaction.metadata = transaction.metadata || {};
        transaction.metadata.migrationRejected = true;
        transaction.metadata.migrationRejectedAt = now;
        transaction.metadata.migrationRejectedBy = data?.resolvedBy;
        transaction.metadata.migrationRejectionReason = data.reason;
        transaction.metadata.flagged = true;
        transaction.metadata.flagReason = `Migration rejected: ${data.reason}`;
        
        await kv.set(`transaction:${transactionId}`, transaction);

        return {
          success: true,
          action: 'reject',
          message: `Transaction rejected: ${data.reason}`
        };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error(`[Migration] Error processing transaction ${transactionId}:`, error);
    throw new Error(`Failed to process transaction: ${error.message}`);
  }
}