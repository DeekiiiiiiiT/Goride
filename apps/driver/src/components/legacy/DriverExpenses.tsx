// cache-bust: force recompile — 2026-02-10
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@roam/ui';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Textarea } from '@roam/ui';
import { Calendar } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@roam/ui';
import { Badge } from '@roam/ui';
import { 
  Calendar as CalendarIcon, 
  Loader2, 
  Receipt, 
  Fuel, 
  Wrench, 
  CheckCircle2,
  Check,
  Clock,
  XCircle,
  Plus,
  Ticket,
  Camera,
  X,
  ChevronLeft,
  Search,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { format, isValid, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { cn } from '@roam/ui';
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
import { resolveVehicleIdForDriver } from '../../utils/resolveDriverVehicleId';
import { resolveCanonicalDriverIdentity } from '@roam/types/driverIdentity';
import { toast } from "sonner";
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { EvidenceRetentionNotice } from '../evidence/EvidenceRetentionNotice';
import { FinancialTransaction, TransactionCategory } from '../../types/data';
import { StationProfile } from '../../types/station';
import { DriverClaims } from './DriverClaims';
import { DriverFuelStats } from './DriverFuelStats';
import { PortalHome } from './views/PortalHome';
import { ReimbursementMenu } from './views/ReimbursementMenu';
import { DriverHeader } from './ui/DriverHeader';
import { PaymentMethodSelector } from './expenses/PaymentMethodSelector';
import { GasCardSummary } from './expenses/GasCardSummary';
import { FuelCashInputs } from './expenses/FuelCashInputs';
import { ReceiptUploader } from './expenses/ReceiptUploader';
import { OdometerScanner } from './common/OdometerScanner';
import { useOffline } from '../providers/OfflineProvider';
import { offlineBlobStore } from '../../services/offlineBlobStore';

interface ExpenseLoggerProps {
  defaultOpen?: boolean;
  onBack?: () => void;
}

type ViewState =
  | 'list'
  | 'category_select'
  | 'odometer_scan'
  | 'fuel_gps_locking'
  | 'fuel_gps_retry'
  | 'method_select'
  | 'entry_details'
  | 'toll_scan'
  | 'toll_review';

/** Manual "Retry GPS" taps allowed after the automatic post–odometer-scan attempt fails. */
const MAX_MANUAL_FUEL_GPS_RETRIES = 2;
/** Skip GPS enabled after this delay to avoid accidental skips. */
const FUEL_GPS_SKIP_ENABLE_MS = 3000;
/** Overall fuel/expense submit deadline (uploads + save). */
const SUBMIT_DEADLINE_MS = 90_000;

import { useGeolocation } from '../../hooks/useGeolocation';

interface FuelEntryState {
  odometerReading?: number;
  odometerProof?: File;
  odometerMethod?: string;
  paymentMethod?: 'gas_card' | 'personal_cash' | 'rideshare_cash';
  pricePerLiter?: string;
  isFullTank?: boolean;
  manualReason?: string;
  volume?: string; 
  locationMetadata?: {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp?: string;
  };
  parentCompany?: string;
}

// Combined expense item for display
interface ExpenseItem {
  id: string;
  type: 'fuel' | 'toll' | 'maintenance' | 'other';
  date: Date;
  amount: number;
  description: string;
  status: string;
  station?: string;
  odometer?: number;
  volume?: number;
  receiptUrl?: string;
}

export function DriverExpenses({ defaultOpen = false, onBack }: ExpenseLoggerProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const { isOnline, addToQueue, queue } = useOffline();
  const { getLocation } = useGeolocation();
  const pendingFuelOffline = queue.filter((q) => q.type === 'SUBMIT_FUEL_EXPENSE').length;
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [fuelEntries, setFuelEntries] = useState<any[]>([]);
  const [combinedExpenses, setCombinedExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Current period (Monday to Sunday)
  const periodStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const periodEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  
  const [viewState, setViewState] = useState<ViewState>(defaultOpen ? 'category_select' : 'list');
  const [fuelEntry, setFuelEntry] = useState<FuelEntryState>({});
  const [tankStatus, setTankStatus] = useState<any>(null);
  
  const [isScanning, setIsScanning] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState('');
  const [odometer, setOdometer] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const [merchant, setMerchant] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [plaza, setPlaza] = useState('');
  const [lane, setLane] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [collector, setCollector] = useState('');
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);

  const [fuelGpsManualRetriesLeft, setFuelGpsManualRetriesLeft] = useState(MAX_MANUAL_FUEL_GPS_RETRIES);
  /** True after GPS capture was exhausted; shows copy on fuel details that admin will verify location. */
  const [fuelProceedingWithoutGps, setFuelProceedingWithoutGps] = useState(false);
  const [isRetryingFuelGps, setIsRetryingFuelGps] = useState(false);
  const [fuelGpsSkipEnabled, setFuelGpsSkipEnabled] = useState(false);
  const fuelGpsLockGenRef = useRef(0);

  useEffect(() => {
    if (user) {
      fetchTransactions();
      // Fetch verified stations for selection
      api.getStations().then(data => {
        setVerifiedStations(data.filter((s: any) => s.status === 'verified'));
      }).catch(console.error);
    }
  }, [user]);

  const resetForm = () => {
    setAmount('');
    setCategory('Fuel');
    setNotes('');
    setOdometer('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setDate(new Date());
    setTime(format(new Date(), 'HH:mm'));
    setMerchant('');
    setReferenceNumber('');
    setPlaza('');
    setLane('');
    setVehicleClass('');
    setCollector('');
    setFuelEntry({});
    setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
    setFuelProceedingWithoutGps(false);
    setIsRetryingFuelGps(false);
    setFuelGpsSkipEnabled(false);
    fuelGpsLockGenRef.current += 1;
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const driverIds = [
          user?.id,
          driverRecord?.id,
          driverRecord?.driverId
      ].filter(Boolean) as string[];
      
      const driverName = driverRecord?.driverName || driverRecord?.name || '';
      const vehicleId = driverRecord?.assignedVehicleId || driverRecord?.vehicle || '';
      
      console.log('[DriverExpenses] Driver info:', { 
        driverIds, 
        driverName, 
        vehicleId,
        driverRecord: JSON.stringify(driverRecord, null, 2).substring(0, 500)
      });

      // Fetch transactions and fuel entries
      // If we have a vehicle ID, fetch fuel entries for that vehicle specifically
      const [allTx, allFuel, vehicleFuel] = await Promise.all([
        api.getTransactions(driverIds).catch(() => []),
        api.getAllFuelEntries().catch(() => []),
        vehicleId ? api.getFuelEntriesByVehicle(vehicleId).catch(() => []) : Promise.resolve([])
      ]);
      
      console.log('[DriverExpenses] Fetched all fuel entries:', allFuel?.length || 0);
      console.log('[DriverExpenses] Fetched vehicle fuel entries:', vehicleFuel?.length || 0);
      
      if (allFuel?.length > 0) {
        console.log('[DriverExpenses] Sample fuel entry:', {
          id: allFuel[0].id,
          driverId: allFuel[0].driverId,
          vehicleId: allFuel[0].vehicleId,
          date: allFuel[0].date,
          station: allFuel[0].station || allFuel[0].location,
        });
      }
      
      // Filter transactions for expenses
      const myTx = (allTx || []).filter((t: FinancialTransaction) => 
        t.type === 'Expense'
      );
      setTransactions(myTx);
      
      // Combine fuel entries from both sources (deduplicate by ID)
      const fuelMap = new Map<string, any>();
      
      // Add vehicle-specific fuel entries first (most reliable)
      (vehicleFuel || []).forEach((f: any) => {
        if (f.id) fuelMap.set(f.id, f);
      });
      
      // Add entries matching by driver ID
      (allFuel || []).forEach((f: any) => {
        if (f.id && !fuelMap.has(f.id)) {
          const driverIdMatch = 
            driverIds.includes(f.driverId) || 
            driverIds.includes(f.driver_id);
          if (driverIdMatch) {
            fuelMap.set(f.id, f);
          }
        }
      });
      
      console.log('[DriverExpenses] Total unique fuel entries for driver:', fuelMap.size);
      
      // Filter by current period
      const myFuel = Array.from(fuelMap.values()).filter((f: any) => {
        const entryDate = f.date ? parseISO(f.date) : (f.createdAt ? new Date(f.createdAt) : null);
        if (!entryDate || isNaN(entryDate.getTime())) {
          console.log('[DriverExpenses] Skipping entry with invalid date:', f.id, f.date);
          return false;
        }
        
        const inPeriod = isWithinInterval(entryDate, { start: periodStart, end: periodEnd });
        if (inPeriod) {
          console.log('[DriverExpenses] Matched fuel entry for period:', f.id, f.date, f.station || f.location);
        }
        return inPeriod;
      });
      
      console.log('[DriverExpenses] Fuel entries for current period:', myFuel.length);
      setFuelEntries(myFuel);

      /** KV fuel anchors point back at the financial `Expense` row; listing both duplicates the same fill-up. */
      const linkedFuelTransactionIds = new Set<string>();
      myFuel.forEach((f: any) => {
        const m =
          f?.metadata && typeof f.metadata === 'object'
            ? (f.metadata as Record<string, unknown>)
            : {};
        for (const v of [
          f?.transactionId,
          f?.transaction_id,
          m.originalTransactionId,
          m.original_transaction_id,
          m.transactionId,
          m.transaction_id,
        ]) {
          if (v != null && String(v).trim()) linkedFuelTransactionIds.add(String(v).trim());
        }
      });

      /** Approved/rejected fuel expenses duplicate `myFuel` rows when the API omits link fields on fuel_entry. */
      const fuelExpenseMirror = (t: FinancialTransaction): boolean => {
        const c = (t.category || '').toLowerCase();
        if (c.includes('fuel') && !c.includes('credit')) return true;
        const d = `${t.merchant || ''} ${t.description || ''}`.toLowerCase();
        return d.includes('fuel expense') || d.includes('fuel:') || d.includes('fuel —');
      };

      const txAmountAbs = (t: FinancialTransaction) => Math.abs(Number(t.amount) || 0);

      const fuelLogOverlapsExpense = (t: FinancialTransaction, txDate: Date): boolean => {
        const tDay = format(txDate, 'yyyy-MM-dd');
        const a = txAmountAbs(t);
        return myFuel.some((f: any) => {
          let fd = '';
          if (f.date) {
            const raw = f.date as string | Date;
            fd =
              typeof raw === 'string'
                ? raw.split('T')[0]
                : format(raw instanceof Date ? raw : parseISO(String(raw)), 'yyyy-MM-dd');
          }
          const fa = Math.abs(Number(f.amount ?? f.cost ?? 0));
          return fd === tDay && Math.abs(fa - a) < 0.02;
        });
      };
      
      // Combine into unified expense items for display
      const combined: ExpenseItem[] = [];
      
      // Add fuel entries
      myFuel.forEach((f: any) => {
        combined.push({
          id: f.id,
          type: 'fuel',
          date: f.date ? parseISO(f.date) : new Date(f.createdAt),
          amount: f.cost || f.amount || 0,
          description: f.station || f.stationName || 'Fuel Purchase',
          status: f.auditStatus || f.status || 'pending',
          station: f.station || f.stationName,
          odometer: f.odometer || f.odometerReading,
          volume: f.volume || f.liters,
          receiptUrl: f.receiptUrl
        });
      });
      
      // Add expense transactions for current period (fuel ledger mirrors: hide — fuel log rows are canonical)
      myTx.forEach((t: FinancialTransaction) => {
        if (linkedFuelTransactionIds.has(String(t.id))) return;

        const txDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null);
        if (!txDate) return;

        if (!isWithinInterval(txDate, { start: periodStart, end: periodEnd })) return;

        if (fuelExpenseMirror(t)) {
          const st = String(t.status || 'pending').toLowerCase().trim();
          if (st !== 'pending') return;
          if (fuelLogOverlapsExpense(t, txDate)) return;
        }

        const isToll = t.category?.toLowerCase().includes('toll');
        const isMaintenance = t.category?.toLowerCase().includes('maintenance') || 
                             t.category?.toLowerCase().includes('service') ||
                             t.category?.toLowerCase().includes('repair');
        const isFuelExpense = fuelExpenseMirror(t);
        
        combined.push({
          id: t.id,
          type: isFuelExpense ? 'fuel' : (isToll ? 'toll' : (isMaintenance ? 'maintenance' : 'other')),
          date: txDate,
          amount: t.amount || 0,
          description: t.merchant || t.description || t.category || 'Expense',
          status: t.status || 'pending',
          receiptUrl: t.receiptUrl
        });
      });
      
      // Sort by date descending
      combined.sort((a, b) => b.date.getTime() - a.date.getTime());

      setCombinedExpenses(combined);
      
    } catch (e) {
      console.error("Failed to fetch transactions", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setReceiptPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      setIsScanning(true);
      toast.info("Analyzing receipt...", { duration: 2000 });
      
      try {
        const { data } = await api.scanReceipt(file);
        
        if (data) {
           if (data.amount) setAmount(data.amount.toString());
           
           if (data.date) {
               const parts = data.date.split('-');
               if (parts.length === 3) {
                   const y = parseInt(parts[0]);
                   const m = parseInt(parts[1]) - 1; 
                   const d = parseInt(parts[2]);
                   if (y > 2000) {
                        const localDate = new Date(y, m, d);
                        if (isValid(localDate)) {
                            setDate(localDate);
                        }
                   }
               }
           }

           if (data.time) {
                let timeStr = data.time;
                if (timeStr.length > 5) {
                    timeStr = timeStr.substring(0, 5);
                }
                setTime(timeStr);
           } else if (!data.time && data.date) {
                setTime("12:00");
           }
           
           if (data.type) {
               const t = data.type.toLowerCase();
               if (t.includes('fuel')) setCategory('Fuel');
               else if (t.includes('service') || t.includes('repair') || t.includes('maintenance')) setCategory('Maintenance');
               else if (t.includes('toll')) setCategory('Tolls');
               else setCategory('Other Expenses');
           }
           
           setMerchant(data.merchant || '');
           setPlaza(data.plaza || '');
           setLane(data.lane || '');
           setVehicleClass(data.vehicleClass || '');
           setReferenceNumber(data.receiptNumber || '');
           setCollector(data.collector || '');
           
           if (data.notes) setNotes(data.notes);
           
           toast.success("Receipt details extracted!");
        }
      } catch (error) {
          console.error("Scan error:", error);
          toast.error("Could not auto-scan receipt. Please enter details manually.");
      } finally {
          setIsScanning(false);
      }
    }
  };

  const tollFileInputRef = useRef<HTMLInputElement>(null);
  const tollScanGenRef = useRef(0);

  const handleTollPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);

      const scanGen = ++tollScanGenRef.current;
      setIsScanning(true);

      try {
        const { data } = await api.scanReceipt(file);
        if (scanGen !== tollScanGenRef.current) return;

        if (data) {
          if (data.amount) setAmount(data.amount.toString());

          if (data.date) {
            const parts = data.date.split('-');
            if (parts.length === 3) {
              const y = parseInt(parts[0]);
              const m = parseInt(parts[1]) - 1;
              const d = parseInt(parts[2]);
              if (y > 2000) {
                const localDate = new Date(y, m, d);
                if (isValid(localDate)) {
                  setDate(localDate);
                }
              }
            }
          }

          if (data.time) {
            let timeStr = data.time;
            if (timeStr.length > 5) {
              timeStr = timeStr.substring(0, 5);
            }
            setTime(timeStr);
          } else if (!data.time && data.date) {
            setTime("12:00");
          }

          setMerchant(data.merchant || '');
          setPlaza(data.plaza || '');
          setLane(data.lane || '');
          setVehicleClass(data.vehicleClass || '');
          setReferenceNumber(data.receiptNumber || '');
          setCollector(data.collector || '');
          if (data.notes) setNotes(data.notes);

          toast.success("Receipt details extracted!");
          setViewState('toll_review');
        } else {
          toast.error("Could not read receipt. Please try again.");
        }
      } catch (error: any) {
        if (scanGen !== tollScanGenRef.current) return;
        console.error("Toll scan error:", error);
        toast.error(error?.message || "Could not scan receipt. Please try again.");
        // Stay on toll_scan so driver can retry
        setReceiptFile(null);
        setReceiptPreview(null);
      } finally {
        if (scanGen === tollScanGenRef.current) {
          setIsScanning(false);
        }
        // Reset the file input so the same file can be re-selected
        if (tollFileInputRef.current) {
          tollFileInputRef.current.value = '';
        }
      }
    }
  };

  const constructTransactionPayload = (
    baseTx: Partial<FinancialTransaction>, 
    receiptUrl: string, 
    odometerProofUrl: string
  ): Partial<FinancialTransaction> => {
    const isGasCard = category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card';
    const isFuel = category === 'Fuel';

    let finalAmount = 0;
    if (isFuel) {
        if (isGasCard) {
            finalAmount = 0; 
        } else {
            finalAmount = -Math.abs(parseFloat(amount || '0'));
        }
    } else {
        finalAmount = -Math.abs(parseFloat(amount || '0'));
    }

    let methodStr = 'Cash'; 
    if (isFuel) {
        methodStr = isGasCard ? 'Gas Card' : (fuelEntry.paymentMethod === 'rideshare_cash' ? 'RideShare Cash' : 'Cash');
    }

    const finalOdometer = isFuel ? fuelEntry.odometerReading : (odometer ? parseInt(odometer) : undefined);

    const fuelPrice = fuelEntry.pricePerLiter ? parseFloat(fuelEntry.pricePerLiter) : undefined;
    const rawAmount = Math.abs(parseFloat(amount || '0'));
    
    let calculatedVolume = fuelEntry.volume ? parseFloat(fuelEntry.volume) : undefined;
    if (isFuel && !isGasCard && fuelPrice && fuelPrice > 0) {
        calculatedVolume = Number((rawAmount / fuelPrice).toFixed(2));
    }

    const metadata = {
        plaza,
        lane,
        vehicleClass,
        collector,
        fuelVolume: calculatedVolume,
        pricePerLiter: fuelPrice,
        isFullTank: (isFuel) ? fuelEntry.isFullTank : undefined,
        odometerMethod: (isFuel) ? fuelEntry.odometerMethod : undefined,
        odometerProofUrl: (isFuel) ? odometerProofUrl : undefined,
        odometerManualReason: (isFuel) ? fuelEntry.manualReason : undefined,
        locationMetadata: fuelEntry.locationMetadata,
        parentCompany: fuelEntry.parentCompany,
        paymentSource: isFuel ? (isGasCard ? 'company_card' : (fuelEntry.paymentMethod === 'rideshare_cash' ? 'rideshare_cash' : 'driver_cash')) : undefined,
        // Flag for admin Log Review when odometer was not AI-verified
        needsLogReview: (isFuel && fuelEntry.odometerMethod && fuelEntry.odometerMethod !== 'ai_verified') ? true : undefined,
        logReviewReason: (isFuel && fuelEntry.odometerMethod === 'photo_review')
            ? 'AI scan failed — odometer photo pending admin review'
            : (isFuel && fuelEntry.odometerMethod === 'manual_override')
                ? 'Manual odometer override — pending admin verification'
                : undefined,
    };

    return {
        ...baseTx,
        amount: finalAmount,
        paymentMethod: methodStr as any,
        odometer: finalOdometer,
        metadata: metadata,
        receiptUrl: receiptUrl
    };
  };

  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('[DriverExpenses] handleSubmit fired from form onSubmit');
    e.preventDefault();
    setSubmitError(null);
    await doSubmit();
  };

  const doSubmit = async () => {
    console.log('[DriverExpenses] doSubmit called, isSubmitting:', isSubmitting);
    if (isSubmitting) {
      console.log('[DriverExpenses] BLOCKED — isSubmitting is already true');
      return;
    }
    
    const isGasCard = category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card';
    
    if (!category || !date) {
      const msg = "Please fill in all required fields";
      console.log('[DriverExpenses] Validation fail:', msg);
      setSubmitError(msg);
      toast.error(msg);
      return;
    }
    
    if (!isGasCard && !amount) {
        const msg = "Please enter an amount";
        console.log('[DriverExpenses] Validation fail:', msg);
        setSubmitError(msg);
        toast.error(msg);
        return;
    }

    if (category === 'Fuel' && !isGasCard) {
        const price = parseFloat(fuelEntry.pricePerLiter || '0');
        if (!fuelEntry.pricePerLiter || isNaN(price) || price <= 0) {
             const msg = "Please enter a valid fuel price";
             console.log('[DriverExpenses] Validation fail:', msg);
             setSubmitError(msg);
             toast.error(msg);
             return;
        }
        
        if (price < 0.50) {
             const msg = "Fuel price seems too low. Please verify.";
             console.log('[DriverExpenses] Validation fail:', msg);
             setSubmitError(msg);
             toast.error(msg);
             return;
        }
    }

    console.log('[DriverExpenses] All validation passed! Submitting to API...');
    setSubmitError(null);

    const queueFuelOffline = async (reason: 'offline' | 'network') => {
      const txId = crypto.randomUUID();
      const vehicles = await api.getVehicles().catch(() => []);
      const resolvedVehicleId = resolveVehicleIdForDriver(driverRecord, vehicles, user?.id);
      const resolvedVehicle = resolvedVehicleId
        ? (vehicles as any[]).find((v: any) => v.id === resolvedVehicleId)
        : undefined;
      const { driverId: canonicalDriverId, driverName: canonicalDriverName } = resolveCanonicalDriverIdentity(
        driverRecord,
        { id: user?.id, name: user?.user_metadata?.name, email: user?.email },
      );

      const baseTx: Partial<FinancialTransaction> = {
        id: txId,
        driverId: canonicalDriverId || user?.id,
        driverName: canonicalDriverName,
        vehicleId: resolvedVehicleId,
        vehiclePlate:
          driverRecord?.assignedVehiclePlate ||
          resolvedVehicle?.plateNumber ||
          resolvedVehicle?.licensePlate ||
          driverRecord?.assignedVehicleName ||
          resolvedVehicle?.vehicleName ||
          undefined,
        date: isValid(date) ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        time: time ? `${time}:00` : undefined,
        type: 'Expense',
        category: category as TransactionCategory,
        description: notes || `${category} Expense - ${merchant && merchant !== 'Other' ? merchant : (fuelEntry.parentCompany || 'Unspecified Vendor')}`,
        status: 'Pending',
        notes: notes,
        vendor: merchant && merchant !== 'Other' ? merchant : (fuelEntry.parentCompany || ''),
        referenceNumber: referenceNumber,
      };

      const newTx = constructTransactionPayload(baseTx, '', '');
      const odometerBlobKey = fuelEntry.odometerProof ? `fuel-odo-${txId}` : undefined;
      const receiptBlobKey = receiptFile ? `fuel-receipt-${txId}` : undefined;

      if (odometerBlobKey && fuelEntry.odometerProof) {
        await offlineBlobStore.put(odometerBlobKey, fuelEntry.odometerProof);
      }
      if (receiptBlobKey && receiptFile) {
        await offlineBlobStore.put(receiptBlobKey, receiptFile);
      }

      addToQueue({
        type: 'SUBMIT_FUEL_EXPENSE',
        payload: {
          transaction: newTx as Record<string, any>,
          odometerBlobKey,
          receiptBlobKey,
          odometerFileName: fuelEntry.odometerProof?.name,
          receiptFileName: receiptFile?.name,
          odometerMimeType: fuelEntry.odometerProof?.type,
          receiptMimeType: receiptFile?.type,
          label: `Fuel — ${format(date, 'MMM d')}`,
        },
      });

      toast.success('Fuel log saved on this phone — will send when you\'re back online');
      setViewState('list');
      resetForm();
    };

    // Offline at the pump: queue fuel (photos in IndexedDB) instead of failing
    if (!isOnline && category === 'Fuel') {
      setIsSubmitting(true);
      try {
        await queueFuelOffline('offline');
      } catch (err) {
        console.error('[DriverExpenses] Offline queue failed:', err);
        toast.error(err instanceof Error ? err.message : 'Could not save fuel log offline');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    let submitTimedOut = false;
    const submitDeadline = setTimeout(() => {
      submitTimedOut = true;
      setIsSubmitting(false);
      const msg = 'Save timed out. Check your connection and try again.';
      setSubmitError(msg);
      toast.error(msg);
    }, SUBMIT_DEADLINE_MS);
    try {
      const txId = crypto.randomUUID();
      let receiptUrl = '';
      if (receiptFile) {
        const uploadRes = await uploadEvidenceFile(receiptFile, {
          evidenceType: category === 'Tolls' ? 'toll_receipt' : 'fuel_receipt',
          sourceType: 'transaction',
          sourceId: txId,
          retentionClass: 'ephemeral',
          parentStatus: 'Pending',
        });
        if (submitTimedOut) return;
        receiptUrl = uploadRes.url;
      }

      let odometerProofUrl = '';
      if (fuelEntry.odometerProof) {
        const uploadRes = await uploadEvidenceFile(fuelEntry.odometerProof, {
          evidenceType: 'odometer_proof',
          sourceType: 'transaction',
          sourceId: txId,
          retentionClass: 'ephemeral',
          parentStatus: 'Pending',
        });
        if (submitTimedOut) return;
        odometerProofUrl = uploadRes.url;
      }

      const vehicles = await api.getVehicles().catch(() => []);
      if (submitTimedOut) return;
      const resolvedVehicleId = resolveVehicleIdForDriver(driverRecord, vehicles, user?.id);
      // Defense in depth: look up the real plate/name directly from the vehicles
      // list already fetched above, rather than relying solely on driverRecord's
      // cached assignedVehiclePlate/assignedVehicleName (which can be stale or
      // never populated — see useCurrentDriver.ts). Removes the old hardcoded
      // "Assigned Vehicle" placeholder string entirely.
      const resolvedVehicle = resolvedVehicleId
        ? (vehicles as any[]).find((v: any) => v.id === resolvedVehicleId)
        : undefined;

      const { driverId: canonicalDriverId, driverName: canonicalDriverName } = resolveCanonicalDriverIdentity(
        driverRecord,
        { id: user?.id, name: user?.user_metadata?.name, email: user?.email },
      );

      const baseTx: Partial<FinancialTransaction> = {
        id: txId,
        driverId: canonicalDriverId || user?.id,
        driverName: canonicalDriverName,
        vehicleId: resolvedVehicleId,
        vehiclePlate:
          driverRecord?.assignedVehiclePlate ||
          resolvedVehicle?.plateNumber ||
          resolvedVehicle?.licensePlate ||
          driverRecord?.assignedVehicleName ||
          resolvedVehicle?.vehicleName ||
          undefined,
        date: isValid(date) ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        time: time ? `${time}:00` : undefined,
        type: 'Expense',
        category: category as TransactionCategory,
        description: notes || `${category} Expense - ${merchant && merchant !== 'Other' ? merchant : (fuelEntry.parentCompany || 'Unspecified Vendor')}`,
        status: 'Pending',
        notes: notes,
        vendor: merchant && merchant !== 'Other' ? merchant : (fuelEntry.parentCompany || ''),
        referenceNumber: referenceNumber,
      };

      const newTx = constructTransactionPayload(baseTx, receiptUrl, odometerProofUrl);
      const savedTx = await api.saveTransaction(newTx);
      if (submitTimedOut) return;

      const needsReview =
        category === 'Fuel' &&
        (savedTx.status === 'Pending' ||
          savedTx?.metadata?.needsLogReview ||
          savedTx?.metadata?.stationGateHold ||
          fuelEntry.odometerMethod === 'photo_review' ||
          fuelProceedingWithoutGps);

      if (category === 'Fuel') {
        if (savedTx.status === 'Approved') {
          toast.success('Fuel log saved');
        } else if (needsReview) {
          toast.success('Fuel log sent — waiting for fleet review');
        } else {
          toast.success('Fuel log sent — waiting for fleet review');
        }
      } else if (savedTx.status === 'Approved') {
        toast.success('Expense Auto-Approved & Odometer Verified! 🚀');
      } else {
        toast.success('Expense submitted for approval');
      }

      setViewState('list');
      resetForm();
      fetchTransactions();

    } catch (err) {
      if (submitTimedOut) return;
      console.error('[DriverExpenses] Submit error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const looksLikeNetwork =
        category === 'Fuel' &&
        /failed to fetch|network|timeout|offline|load failed|aborted/i.test(errMsg);

      if (looksLikeNetwork) {
        try {
          await queueFuelOffline('network');
          return;
        } catch (queueErr) {
          console.error('[DriverExpenses] Fallback offline queue failed:', queueErr);
        }
      }

      const msg = `Failed to submit expense: ${errMsg}`;
      setSubmitError(msg);
      toast.error(err instanceof Error ? err.message : "Failed to submit expense");
    } finally {
      clearTimeout(submitDeadline);
      if (!submitTimedOut) setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string, metadata?: any) => {
    // Station-gate-held transactions: driver just waits for company to verify the gas station
    if (status === 'Pending' && metadata?.stationGateHold) {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><MapPin className="w-3 h-3 mr-1"/> Verifying Location</Badge>;
    }
    switch(status) {
      case 'Completed':
      case 'Reconciled':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1"/> Approved</Badge>;
      case 'Pending':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
      case 'Failed':
      case 'Void':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-200"><XCircle className="w-3 h-3 mr-1"/> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'Fuel': return <Fuel className="h-4 w-4 text-orange-500" />;
      case 'Maintenance': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'Tolls': return <Ticket className="h-4 w-4 text-purple-500" />;
      default: return <Receipt className="h-4 w-4 text-slate-500" />;
    }
  };

  const handleCategorySelect = async (cat: string) => {
    setCategory(cat);
    if (cat === 'Fuel') {
      setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
      setFuelProceedingWithoutGps(false);
      setViewState('odometer_scan');
      if (driverRecord?.assignedVehicleId) {
        api.getVehicleTankStatus(driverRecord.assignedVehicleId)
          .then(setTankStatus)
          .catch(console.error);
      }
    } else if (cat === 'Tolls') {
      setViewState('toll_scan');
    } else {
      setViewState('entry_details');
    }
  };

  const handleOdometerScanComplete = (result: any) => {
    setFuelEntry((prev) => ({
      ...prev,
      odometerReading: result.reading,
      odometerProof: result.photo,
      odometerMethod: result.method,
      manualReason: result.manualReason,
      locationMetadata: undefined,
    }));
    setFuelGpsSkipEnabled(false);
    setFuelProceedingWithoutGps(false);
    setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
    setViewState('fuel_gps_locking');
    void runFuelGpsLock();
  };

  const runFuelGpsLock = async () => {
    const gen = ++fuelGpsLockGenRef.current;
    const skipTimer = setTimeout(() => {
      if (gen === fuelGpsLockGenRef.current) setFuelGpsSkipEnabled(true);
    }, FUEL_GPS_SKIP_ENABLE_MS);

    let locationData: FuelEntryState['locationMetadata'] = undefined;
    let lastLocError: string | null = null;
    try {
      const loc = await getLocation();
      if (gen !== fuelGpsLockGenRef.current) return;
      lastLocError = loc.error;
      if (loc.lat != null && loc.lng != null) {
        locationData = {
          lat: loc.lat,
          lng: loc.lng,
          accuracy: loc.accuracy ?? 0,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error("GPS Acquisition failed", e);
    } finally {
      clearTimeout(skipTimer);
    }

    if (gen !== fuelGpsLockGenRef.current) return;

    if (locationData) {
      setFuelEntry((prev) => ({ ...prev, locationMetadata: locationData }));
      setFuelProceedingWithoutGps(false);
      setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
      toast.success("Location locked for verification 📍");
      setViewState('method_select');
      return;
    }

    setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
    setFuelProceedingWithoutGps(false);
    const reason = lastLocError?.trim() || null;
    toast.message(
      reason
        ? `We couldn't lock your location (${reason}). Turn on Location for this site, then tap Retry.`
        : "We couldn't lock your location. Turn on Location, move to an open area if needed, then tap Retry.",
      { duration: 6000 },
    );
    setViewState('fuel_gps_retry');
  };

  const handleSkipFuelGpsLock = () => {
    if (!fuelGpsSkipEnabled) return;
    fuelGpsLockGenRef.current += 1;
    setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
    setFuelProceedingWithoutGps(false);
    setViewState('fuel_gps_retry');
  };

  const applyManualFuelGpsRetryFailed = (nextLeft: number) => {
    setFuelGpsManualRetriesLeft(nextLeft);
    if (nextLeft <= 0) {
      toast.info(
        "Location couldn't be captured. Your fuel log will still be sent — your fleet will verify the station manually.",
        { duration: 6000 },
      );
      setFuelProceedingWithoutGps(true);
      setViewState('method_select');
    } else {
      toast.warning(
        nextLeft === 1
          ? "Still couldn't get your location. You have one more try."
          : `Still couldn't get your location. ${nextLeft} tries left.`,
        { duration: 4000 },
      );
    }
  };

  const handleRetryFuelGps = async () => {
    if (isRetryingFuelGps) return;
    setIsRetryingFuelGps(true);
    try {
      const loc = await getLocation();
      if (loc.lat != null && loc.lng != null) {
        setFuelEntry((prev) => ({
          ...prev,
          locationMetadata: {
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy ?? 0,
            timestamp: new Date().toISOString(),
          },
        }));
        setFuelProceedingWithoutGps(false);
        setFuelGpsManualRetriesLeft(MAX_MANUAL_FUEL_GPS_RETRIES);
        toast.success("Location locked for verification 📍");
        setViewState('method_select');
        return;
      }
      applyManualFuelGpsRetryFailed(fuelGpsManualRetriesLeft - 1);
    } catch (e) {
      console.error("GPS retry failed", e);
      applyManualFuelGpsRetryFailed(fuelGpsManualRetriesLeft - 1);
    } finally {
      setIsRetryingFuelGps(false);
    }
  };

  const handleMethodSelect = (method: 'gas_card' | 'personal_cash' | 'rideshare_cash') => {
    setFuelEntry(prev => ({ ...prev, paymentMethod: method }));
    setViewState('entry_details');
  };

  const goBack = () => {
    switch (viewState) {
      case 'category_select': 
        if (defaultOpen && onBack) {
          onBack();
        } else {
          setViewState('list'); 
        }
        break;
      case 'odometer_scan': setViewState('category_select'); break;
      case 'fuel_gps_locking':
        fuelGpsLockGenRef.current += 1;
        setViewState('odometer_scan');
        break;
      case 'fuel_gps_retry': setViewState('odometer_scan'); break;
      case 'method_select': setViewState('odometer_scan'); break;
      case 'toll_scan': setViewState('category_select'); break;
      case 'toll_review': 
        // Clear scanned data so they can re-scan
        setReceiptFile(null);
        setReceiptPreview(null);
        setAmount('');
        setMerchant('');
        setPlaza('');
        setLane('');
        setVehicleClass('');
        setReferenceNumber('');
        setCollector('');
        setNotes('');
        setViewState('toll_scan'); 
        break;
      case 'entry_details': 
        if (category === 'Fuel') setViewState('method_select');
        else setViewState('category_select');
        break;
      default: setViewState('list');
    }
  };

  // Get icon for expense type
  const getExpenseIcon = (type: ExpenseItem['type']) => {
    switch (type) {
      case 'fuel': return <Fuel className="h-5 w-5 text-orange-500" />;
      case 'toll': return <Ticket className="h-5 w-5 text-purple-500" />;
      case 'maintenance': return <Wrench className="h-5 w-5 text-blue-500" />;
      default: return <Receipt className="h-5 w-5 text-slate-500" />;
    }
  };

  // Get background color for expense type
  const getExpenseBgColor = (type: ExpenseItem['type']) => {
    switch (type) {
      case 'fuel': return 'bg-orange-100 dark:bg-orange-900/30';
      case 'toll': return 'bg-purple-100 dark:bg-purple-900/30';
      case 'maintenance': return 'bg-blue-100 dark:bg-blue-900/30';
      default: return 'bg-slate-100 dark:bg-slate-800';
    }
  };

  // Get label for expense type
  const getExpenseLabel = (type: ExpenseItem['type']) => {
    switch (type) {
      case 'fuel': return 'Fuel';
      case 'toll': return 'Toll';
      case 'maintenance': return 'Maintenance';
      default: return 'Expense';
    }
  };

  if (viewState === 'list') {
    // Calculate period totals
    const fuelTotal = combinedExpenses.filter(e => e.type === 'fuel').reduce((sum, e) => sum + e.amount, 0);
    const tollTotal = combinedExpenses.filter(e => e.type === 'toll').reduce((sum, e) => sum + e.amount, 0);
    const maintenanceTotal = combinedExpenses.filter(e => e.type === 'maintenance').reduce((sum, e) => sum + e.amount, 0);
    const periodTotal = fuelTotal + tollTotal + maintenanceTotal;

    return (
      <div className="space-y-6 w-full min-w-0 max-w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 min-w-0">
           <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Expenses</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                Log your operational costs for reimbursement.
              </p>
           </div>
           <Button
             className="w-full shrink-0 sm:w-auto"
             onClick={() => setViewState('category_select')}
           >
              <Plus className="mr-2 h-4 w-4 shrink-0" /> Log Expense
           </Button>
        </div>

        {pendingFuelOffline > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">
              {pendingFuelOffline} fuel log{pendingFuelOffline === 1 ? '' : 's'} saved on this phone
            </p>
            <p className="text-amber-800/80 mt-0.5">
              Will send when you&apos;re back online.
            </p>
          </div>
        )}

        {/* Current Period — 2×2 on phones, 4 columns from sm up so amounts never crush */}
        <Card className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-200/50 dark:border-indigo-800/50 overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarIcon className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Current Period</span>
              </div>
              <Badge
                variant="outline"
                className="w-fit max-w-full whitespace-normal text-left text-xs font-medium leading-snug bg-white/50 dark:bg-slate-900/50 sm:text-left"
              >
                {format(periodStart, 'MMM d')} – {format(periodEnd, 'MMM d, yyyy')}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <div className="min-w-0 rounded-lg bg-white/50 p-2.5 text-center dark:bg-slate-900/30 sm:p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Fuel
                </div>
                <div className="break-words text-sm font-bold tabular-nums leading-tight text-orange-600 sm:text-base">
                  ${fuelTotal.toFixed(2)}
                </div>
              </div>
              <div className="min-w-0 rounded-lg bg-white/50 p-2.5 text-center dark:bg-slate-900/30 sm:p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Tolls
                </div>
                <div className="break-words text-sm font-bold tabular-nums leading-tight text-purple-600 sm:text-base">
                  ${tollTotal.toFixed(2)}
                </div>
              </div>
              <div className="min-w-0 rounded-lg bg-white/50 p-2.5 text-center dark:bg-slate-900/30 sm:p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Maint.
                </div>
                <div className="break-words text-sm font-bold tabular-nums leading-tight text-blue-600 sm:text-base">
                  ${maintenanceTotal.toFixed(2)}
                </div>
              </div>
              <div className="min-w-0 rounded-lg bg-white/50 p-2.5 text-center ring-1 ring-slate-200/80 dark:bg-slate-900/30 dark:ring-slate-700/80 sm:p-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Total
                </div>
                <div className="break-words text-sm font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100 sm:text-base">
                  ${periodTotal.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
           {loading ? (
              <div className="text-center py-10">
                 <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
              </div>
           ) : combinedExpenses.length === 0 ? (
              <Card className="bg-slate-50 dark:bg-slate-800/50 border-dashed">
                 <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                     <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-sm mb-3">
                         <Receipt className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                     </div>
                     <h3 className="font-semibold text-slate-900 dark:text-slate-100">No expenses this period</h3>
                     <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mt-1">
                        Log fuel, tolls, and maintenance costs for {format(periodStart, 'MMM d')} - {format(periodEnd, 'MMM d')}.
                     </p>
                     <Button variant="outline" className="mt-4" onClick={() => setViewState('category_select')}>
                        Log First Expense
                     </Button>
                 </CardContent>
              </Card>
           ) : (
              <div className="grid w-full min-w-0 max-w-full gap-3">
                 {combinedExpenses.map(expense => (
                    <Card key={expense.id} className="min-w-0 max-w-full overflow-hidden">
                       <CardContent className="p-0">
                          <div className="flex min-w-0 items-start gap-3 p-3 sm:p-4 sm:gap-4">
                             <div className={cn(
                                 "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                                 getExpenseBgColor(expense.type)
                             )}>
                                 {getExpenseIcon(expense.type)}
                             </div>
                             <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                   <h4 className="min-w-0 flex-1 break-words line-clamp-3 font-semibold leading-snug text-slate-900 dark:text-slate-100">
                                     {expense.description || getExpenseLabel(expense.type)}
                                   </h4>
                                   <span className="shrink-0 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 sm:text-base">
                                      ${Math.abs(expense.amount).toFixed(2)}
                                   </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 gap-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                                   <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                     <span className="whitespace-nowrap">{format(expense.date, 'MMM d, yyyy')}</span>
                                     {expense.volume != null && (
                                       <span className="whitespace-nowrap">• {expense.volume}L</span>
                                     )}
                                     {expense.odometer != null && (
                                       <span className="min-w-0 break-words">• {expense.odometer.toLocaleString()} km</span>
                                     )}
                                   </div>
                                   <Badge
                                     variant="outline"
                                     className={cn(
                                       'shrink-0 text-[11px] font-semibold',
                                       expense.status === 'approved' ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800" :
                                       expense.status === 'pending' ? "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800" :
                                       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                     )}
                                   >
                                     {expense.type === 'fuel' ? getExpenseLabel(expense.type) : expense.status}
                                   </Badge>
                                </div>
                             </div>
                          </div>
                       </CardContent>
                    </Card>
                 ))}
              </div>
           )}
        </div>
      </div>
    );
  }

  const fuelNoGpsManualVerifyNotice =
    category === 'Fuel' && !fuelEntry.locationMetadata && fuelProceedingWithoutGps ? (
      <div
        className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        role="status"
      >
        <span className="font-medium">No GPS for this log.</span>{' '}
        Your submission will go to your fleet for manual station verification (you may see &quot;Verifying location&quot; until they confirm).
      </div>
    ) : null;

  return (
    <div className="space-y-6 pb-40">
      <div className="flex items-center gap-3">
         {!(viewState === 'entry_details' && category === 'Fuel') && (
           <Button variant="ghost" size="icon" onClick={goBack}>
              <ChevronLeft className="h-5 w-5" />
           </Button>
         )}
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">
                {viewState === 'category_select' && "Log New Expense"}
                {viewState === 'odometer_scan' && "Scan Odometer"}
                {viewState === 'fuel_gps_locking' && "Lock location"}
                {viewState === 'fuel_gps_retry' && "Lock location"}
                {viewState === 'method_select' && "Payment Method"}
                {viewState === 'entry_details' && (category === 'Fuel' ? "Fuel Details" : "Expense Details")}
                {viewState === 'toll_scan' && "Scan Toll Receipt"}
                {viewState === 'toll_review' && "Review Toll Details"}
              </h2>
              {fuelEntry.locationMetadata && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Location Locked</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {category === 'Fuel' ? (
                <>Step {
                  viewState === 'category_select' ? '1' :
                  viewState === 'odometer_scan' || viewState === 'fuel_gps_locking' || viewState === 'fuel_gps_retry' ? '2' :
                  viewState === 'method_select' ? '3' : '4'
                } of 4</>
              ) : category === 'Tolls' ? (
                <>Step {
                  viewState === 'category_select' ? '1' :
                  viewState === 'toll_scan' ? '1' :
                  viewState === 'toll_review' ? '2' : '2'
                } of 2</>
              ) : (
                <>Step {
                  viewState === 'category_select' ? '1' : '2'
                } of 2</>
              )}
            </p>
          </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {viewState === 'category_select' && (
            <div className="p-6 space-y-4">
              <Label className="text-base font-semibold">Select Category</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Fuel', icon: Fuel, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
                  { id: 'Maintenance', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
                  { id: 'Tolls', icon: Ticket, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
                  { id: 'Other Expenses', icon: Receipt, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
                ].map((item) => (
                  <div 
                    key={item.id}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]",
                      category === item.id ? `${item.border} ${item.bg}` : "border-slate-100 hover:bg-slate-50"
                    )}
                    onClick={() => handleCategorySelect(item.id)}
                  >
                    <item.icon className={cn("h-8 w-8 mb-2", item.color)} />
                    <span className="text-sm font-bold">{item.id === 'Other Expenses' ? 'Other' : item.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewState === 'odometer_scan' && (
            <div className="p-0 min-h-[400px] relative">
              <OdometerScanner 
                lastOdometer={tankStatus?.lastOdometer}
                onScanComplete={handleOdometerScanComplete}
                onCancel={goBack}
              />
            </div>
          )}

          {viewState === 'fuel_gps_locking' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Locking your station location…</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                    This helps your fleet verify the fuel stop.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!fuelGpsSkipEnabled}
                onClick={handleSkipFuelGpsLock}
              >
                Skip for now
              </Button>
              {!fuelGpsSkipEnabled && (
                <p className="text-xs text-center text-slate-400">Skip available in a moment…</p>
              )}
            </div>
          )}

          {viewState === 'fuel_gps_retry' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <MapPin className="h-7 w-7 text-slate-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Location not detected</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                    We need your GPS to match this fill-up to a verified station. Check that Location is on for this browser or app, then try again.
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  {fuelGpsManualRetriesLeft} manual {fuelGpsManualRetriesLeft === 1 ? 'retry' : 'retries'} left — after that you can still submit; your fleet will verify the station.
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleRetryFuelGps()}
                disabled={isRetryingFuelGps}
              >
                {isRetryingFuelGps ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Getting location…
                  </>
                ) : (
                  <>
                    <MapPin className="mr-2 h-4 w-4" />
                    Retry GPS
                  </>
                )}
              </Button>
            </div>
          )}

          {viewState === 'method_select' && (
            <PaymentMethodSelector onSelect={handleMethodSelect} onCancel={goBack} />
          )}

          {viewState === 'entry_details' && (
            category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card' ? (
                <div>
                  {fuelNoGpsManualVerifyNotice && (
                    <div className="px-6 pt-6 pb-0">{fuelNoGpsManualVerifyNotice}</div>
                  )}
                  <GasCardSummary 
                   odometer={fuelEntry.odometerReading || 0}
                   date={date}
                   time={time}
                   isSubmitting={isSubmitting}
                   onSubmit={handleSubmit}
                />
                </div>
            ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-6" id="expense-form" ref={formRef} noValidate>
              <EvidenceRetentionNotice />
              <div className="space-y-4">
                {fuelNoGpsManualVerifyNotice}
                {category !== 'Fuel' && (
                  <div className="space-y-2">
                    <Label>Merchant / Vendor</Label>
                    <Input 
                        placeholder="e.g. Mechanic name, Parts store, etc." 
                        value={merchant} 
                        onChange={e => setMerchant(e.target.value)} 
                    />
                  </div>
                )}

                {category !== 'Fuel' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input 
                        type="date" 
                        value={format(date, 'yyyy-MM-dd')} 
                        onChange={(e) => {
                          if (e.target.value) {
                            setDate(parseLocalDate(e.target.value));
                          }
                        }} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    </div>
                  </div>
                )}

                {category === 'Fuel' && (fuelEntry.paymentMethod === 'personal_cash' || fuelEntry.paymentMethod === 'rideshare_cash') && (
                  <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Cash Spent ($)</Label>
                        <Input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                      </div>
                      
                      <FuelCashInputs 
                        pricePerLiter={fuelEntry.pricePerLiter || ''}
                        onPriceChange={(p) => setFuelEntry(prev => ({ ...prev, pricePerLiter: p }))}
                        isFullTank={fuelEntry.isFullTank || false}
                        onFullTankChange={(c) => setFuelEntry(prev => ({ ...prev, isFullTank: c }))}
                        currentVolume={(() => {
                            const amt = parseFloat(amount || '0');
                            const price = parseFloat(fuelEntry.pricePerLiter || '0');
                            if (amt > 0 && price > 0) return Number((amt / price).toFixed(2));
                            return 0;
                        })()}
                      />
                  </div>
                )}

                {category !== 'Fuel' && (
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                )}

                {category !== 'Fuel' && (
                  <ReceiptUploader 
                    previewUrl={receiptPreview}
                    isScanning={isScanning}
                    onFileSelect={handleFileChange}
                    onClear={() => { setReceiptFile(null); setReceiptPreview(null); }}
                  />
                )}

                {category !== 'Fuel' && (
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea placeholder="Add details..." value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="pt-4 pb-28">
                {submitError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
                    {submitError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-14 text-lg font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Expense"}
                </button>
                {category === 'Fuel' && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { resetForm(); setViewState('category_select'); }}
                    className="w-full h-12 text-base font-semibold rounded-xl bg-red-500 text-white border border-red-600 hover:bg-red-600 hover:text-white active:bg-red-700 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 transition-colors mt-3"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                )}
              </div>
            </form>
            )
          )}

          {viewState === 'toll_scan' && (
            <div className="p-6 min-h-[350px] flex flex-col items-center justify-center relative">
              {/* Scanning overlay — shown after photo is captured while AI processes */}
              {isScanning && receiptPreview && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl">
                  <div className="relative mb-4">
                    <div className="h-20 w-20 rounded-full bg-purple-50 flex items-center justify-center">
                      <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />
                    </div>
                  </div>
                  <p className="text-lg font-bold text-slate-900">Analyzing Receipt...</p>
                  <p className="text-sm text-slate-500 mt-1">Extracting toll details automatically</p>
                  <button
                    type="button"
                    className="mt-6 text-sm font-medium text-slate-600 underline underline-offset-2"
                    onClick={() => {
                      tollScanGenRef.current += 1;
                      setIsScanning(false);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                      if (tollFileInputRef.current) tollFileInputRef.current.value = '';
                      toast.info("Scan cancelled. Tap to try again.");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Main scan area — large tap target */}
              <div
                onClick={() => !isScanning && tollFileInputRef.current?.click()}
                className={cn(
                  "w-full flex flex-col items-center justify-center py-12 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                  isScanning
                    ? "border-purple-200 bg-purple-50/50 pointer-events-none"
                    : "border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 active:scale-[0.98]"
                )}
              >
                <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                  <Camera className="h-10 w-10 text-purple-600" />
                </div>
                <p className="text-lg font-bold text-slate-900">Take a Photo of Toll Receipt</p>
                <p className="text-sm text-slate-500 mt-1 text-center">
                  Position the receipt clearly in frame for automatic verification
                </p>
              </div>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={tollFileInputRef}
                onChange={handleTollPhotoCapture}
              />
            </div>
          )}

          {/* Toll Review — read-only parsed fields with ✗ reject / ✓ accept buttons */}
          {viewState === 'toll_review' && (
            <div className="p-6 space-y-5">
              {/* Driver-facing summary — full receipt data still saved on accept */}
              <div className="space-y-1 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Date</span>
                  <span className="text-sm font-bold text-slate-900">{isValid(date) ? format(date, 'MMM d, yyyy') : <span className="text-slate-300 font-normal italic">Not detected</span>}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Time</span>
                  <span className="text-sm font-bold text-slate-900">{time || <span className="text-slate-300 font-normal italic">Not detected</span>}</span>
                </div>
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Amount</span>
                  <span className="text-lg font-bold text-purple-700">{amount ? `$${parseFloat(amount).toFixed(2)}` : <span className="text-slate-300 font-normal italic text-sm">Not detected</span>}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-slate-500">Plaza</span>
                  <span className="text-sm font-bold text-slate-900">{plaza || <span className="text-slate-300 font-normal italic">Not detected</span>}</span>
                </div>
              </div>

              {/* Error message */}
              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
                  {submitError}
                </div>
              )}

              {/* ✗ Reject / ✓ Accept buttons */}
              <div className="flex items-center gap-4 pt-2 pb-28">
                {/* ✗ Re-scan button */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setReceiptFile(null);
                    setReceiptPreview(null);
                    setAmount('');
                    setMerchant('');
                    setPlaza('');
                    setLane('');
                    setVehicleClass('');
                    setReferenceNumber('');
                    setCollector('');
                    setNotes('');
                    setSubmitError(null);
                    setViewState('toll_scan');
                  }}
                  className="flex-1 h-14 rounded-xl bg-rose-100 text-rose-700 border-2 border-rose-200 hover:bg-rose-200 active:bg-rose-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 font-bold text-lg transition-colors"
                >
                  <X className="h-6 w-6" />
                  Re-scan
                </button>

                {/* ✓ Accept & Save button */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => doSubmit()}
                  className="flex-1 h-14 rounded-xl bg-emerald-600 text-white border-2 border-emerald-700 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 font-bold text-lg shadow-lg transition-colors"
                >
                  {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
                  {isSubmitting ? 'Saving...' : 'Accept'}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}