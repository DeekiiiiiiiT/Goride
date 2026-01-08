import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Star, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  MapPin,
  MessageSquare,
  Calendar as CalendarIcon, 
  Shield,
  Award,
  MoreHorizontal,
  Download,
  Share2,
  Activity,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Navigation,
  FileText,
  Upload,
  Search,
  Eye,
  Filter,
  Info,
  Fuel,
  CreditCard as CreditCardIcon,
  Wallet,
  Landmark,
  Trash2,
  Car as CarIcon,
  Pencil,
  Plus,
  ChevronDown,
  ChevronRight,
  CornerDownRight
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Separator } from "../ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, DriverMetrics, FinancialTransaction } from '../../types/data';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "../ui/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { LogCashPaymentModal } from './LogCashPaymentModal';
import { WeeklySettlementView } from './WeeklySettlementView';
import { DriverEarningsHistory } from './DriverEarningsHistory';
import { api } from '../../services/api';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { TierConfig } from '../../types/data';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface DriverDocument {
  id: string;
  name: string;
  type: string;
  status: 'Verified' | 'Pending' | 'Expired' | 'Rejected';
  expiryDate: string;
  uploadDate: string;
  url?: string;
}

const MOCK_DOCUMENTS: DriverDocument[] = [
  { id: '1', name: 'Driver License (Front)', type: 'License', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '6', name: 'Driver License (Back)', type: 'License Back', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '5', name: 'Proof of Address (Water Bill)', type: 'Address Proof', status: 'Verified', expiryDate: '2024-03-20', uploadDate: '2023-12-05', url: 'https://images.unsplash.com/photo-1628191011893-6c6e93821033?auto=format&fit=crop&q=80&w=1000' },
  { id: '4', name: 'Background Check Certificate', type: 'Background Check', status: 'Pending', expiryDate: '2024-06-15', uploadDate: '2023-12-01', url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1000' },
];

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  trips: Trip[];
  metrics?: DriverMetrics[];
  vehicleMetrics?: import('../../types/data').VehicleMetrics[];
  onBack: () => void;
  fleetStats?: {
    avgEarningsPerTrip: number;
    avgAcceptanceRate: number;
    avgRating: number;
    avgWeeklyEarnings: number;
  };
}

// Helper for Toll Ledger Logic (Phase 1 Refactor)
const getTollTransactionType = (category: string): 'credit' | 'debit' => {
    // Credit: Reimbursement to driver (Money IN to driver context, or Debt Reduction)
    // Note: 'Expense' is included here assuming it's a driver expense submitted for reimbursement.
    if (['Toll Usage', 'Toll', 'Tolls', 'Expense'].includes(category)) return 'credit';
    // Debit: Charge to driver (Money OUT from driver context, or Debt Increase)
    // Includes: Adjustment, Claim, Chargeback, etc.
    return 'debit';
};

export function DriverDetail({ driverId, driverName, driver, trips, metrics: csvMetrics, vehicleMetrics, onBack, fleetStats }: DriverDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [tripSearch, setTripSearch] = useState("");
  const [tripPage, setTripPage] = useState(1);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
      isOpen: boolean;
      initialWorkPeriodStart?: string;
      initialWorkPeriodEnd?: string;
      initialAmount?: number;
      editingTransaction?: FinancialTransaction;
  }>({ isOpen: false });
  const [walletView, setWalletView] = useState<'ledger' | 'settlements'>('settlements');
  const [ledgerView, setLedgerView] = useState<'tolls' | 'payments'>('tolls');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Phase 3: Filtered Cash Tolls (Expenses & Adjustments)
  const cashTollTransactions = useMemo(() => transactions.filter(t => {
      // Relaxed Status Check: Allow undefined/null or any 'positive' status
      // If status is explicitly 'Rejected' or 'Void', skip. Otherwise allow.
      if (t.status === 'Rejected' || t.status === 'Void' || t.status === 'Failed') return false;
      
      // 1. Valid Cash Toll Expense (Credit to Driver)
      const isTollCategory = ['Toll Usage', 'Toll', 'Tolls', 'Expense'].includes(t.category);
      // For generic 'Expense', ensure it's toll related
      if (t.category === 'Expense' && !t.description?.toLowerCase().includes('toll')) return false;

      const isCash = t.paymentMethod?.toLowerCase() === 'cash' || !!t.receiptUrl;
      const isValidExpense = isTollCategory && isCash;

      // 2. Toll Adjustment / Dispute Chargeback (Debit to Driver)
      const isAdjustment = ['Adjustment', 'Claim', 'Chargeback'].includes(t.category);
      // Relax description check for explicit Claims/Chargebacks
      const isExplicitClaim = ['Claim', 'Chargeback'].includes(t.category);
      const isTollRelated = isExplicitClaim || 
                            t.description?.toLowerCase().includes('toll') || 
                            t.description?.toLowerCase().includes('dispute') ||
                            t.description?.toLowerCase().includes('refund');
                            
      const isValidAdjustment = isAdjustment && isTollRelated;

      return isValidExpense || isValidAdjustment;
  }), [transactions]);

  // Phase 4: Payment Transactions
  const paymentTransactions = useMemo(() => transactions.filter(t => {
      // Strict Safety: Never show Tag Balance operations in Payment Log
      if (t.paymentMethod === 'Tag Balance') return false;
      if (t.description?.toLowerCase().includes('top-up')) return false;

      // Exclude tolls just in case
      const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
      if (isToll) return false;

      // Strict Payment Logic
      const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';
      return isPayment && t.amount > 0;
  }), [transactions]);

  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCashOnly, setFilterCashOnly] = useState<boolean>(false);
  const tripsPerPage = 10;

  // Phase 2: Tier State
  const [tiers, setTiers] = useState<TierConfig[]>([]);

  useEffect(() => {
    tierService.getTiers().then(setTiers).catch(console.error);
  }, []);

  // Calculate Monthly Earnings & Current Tier (Independent of Date Range Selection)
  const { monthlyEarnings, currentTier } = useMemo(() => {
      const mEarnings = TierCalculations.calculateMonthlyEarnings(trips);
      const cTier = TierCalculations.getTierForEarnings(mEarnings, tiers);
      return { monthlyEarnings: mEarnings, currentTier: cTier };
  }, [trips, tiers]);

  // Fetch Transactions & Claims
  React.useEffect(() => {
      const loadData = async () => {
          try {
              const [allTx, allClaims] = await Promise.all([
                  api.getTransactions(),
                  api.getClaims() // Fetch ALL claims to ensure we find links even if driverId filter is tricky
              ]);

              // Filter for this driver
              const driverTx = allTx.filter((t: any) => 
                  t.driverId === driverId || 
                  (driver?.uberDriverId && t.driverId === driver.uberDriverId) ||
                  (driver?.inDriveDriverId && t.driverId === driver.inDriveDriverId)
              );
              setTransactions(driverTx);
              
              // Filter claims locally if needed, or just use all for linking (safer)
              setClaims(allClaims || []);
          } catch (e) {
              console.error("Failed to load data", e);
          }
      };
      loadData();
  }, [driverId, driver]);

  // Grouped Transactions Logic (Parent-Child via Claims)
  const groupedTollTransactions = useMemo(() => {
      const groups: { parent: FinancialTransaction, children: FinancialTransaction[] }[] = [];
      const childIds = new Set<string>();
      
      // 1. Map resolution (child) -> original (parent) via claims
      const parentToResolutions = new Map<string, string[]>(); // parentId -> childIds[]

      claims.forEach(c => {
          if (c.transactionId && c.resolutionTransactionId) {
              const current = parentToResolutions.get(c.transactionId) || [];
              current.push(c.resolutionTransactionId);
              parentToResolutions.set(c.transactionId, current);
              
              childIds.add(c.resolutionTransactionId);
          }
      });

      // 2. Build Groups
      const txMap = new Map(cashTollTransactions.map(t => [t.id, t]));

      cashTollTransactions.forEach(tx => {
          if (childIds.has(tx.id)) return; // Skip children, they are handled by parents

          const childrenIds = parentToResolutions.get(tx.id);
          const children: FinancialTransaction[] = [];
          
          if (childrenIds) {
              childrenIds.forEach(childId => {
                  const childTx = txMap.get(childId);
                  if (childTx) children.push(childTx);
              });
          }
          
          groups.push({
              parent: tx,
              children: children
          });
      });

      // Sort by most recent activity (Parent Date OR Newest Child Date)
      // This ensures that if an old receipt gets a new dispute charge, it bubbles up to the top.
      return groups.sort((a, b) => {
          const getLatestDate = (group: { parent: FinancialTransaction, children: FinancialTransaction[] }) => {
              const dates = [new Date(group.parent.date).getTime()];
              group.children.forEach(c => dates.push(new Date(c.date).getTime()));
              return Math.max(...dates);
          };
          
          return getLatestDate(b) - getLatestDate(a);
      });
  }, [cashTollTransactions, claims]);

  const toggleRow = (id: string) => {
      const newSet = new Set(expandedRows);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setExpandedRows(newSet);
  };

  const handleSavePayment = async (payment: { 
    id?: string;
    amount: number; 
    date: string; 
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => {
      // Determine fields based on transaction type
      let category = "Cash Collection";
      let type: any = "Revenue";
      let amount = payment.amount;

      if (payment.transactionType === 'float') {
        category = "Float Issue";
        type = "Float_Given";
        // Float increases debt. logic: netOutstanding = (TotalOwed - CashReceived).
        // To increase netOutstanding, CashReceived must decrease. So amount is negative.
        amount = -Math.abs(payment.amount); 
      } else if (payment.transactionType === 'adjustment') {
        category = "Adjustment";
        type = "Adjustment";
        // Assuming positive adjustment reduces debt (like a payment)
      } else {
         // Payment
         category = "Cash Collection";
         type = "Payment_Received";
         amount = Math.abs(payment.amount);
      }

      // Determine Status
      // Cash is always completed immediately.
      // Non-cash payments (Bank Transfer, etc.) are Pending until verified.
      // Outflows (Float) or Adjustments are assumed Completed (Admin action).
      const isCash = payment.paymentMethod === 'Cash';
      const isIncomingPayment = payment.transactionType === 'payment';
      const initialStatus = (isIncomingPayment && !isCash) ? 'Pending' : 'Completed';

      const metadata: any = {};
      if (payment.workPeriodStart && payment.workPeriodEnd) {
          metadata.workPeriodStart = payment.workPeriodStart;
          metadata.workPeriodEnd = payment.workPeriodEnd;
      }

      const newTx: Partial<FinancialTransaction> = {
          driverId,
          amount: amount,
          date: payment.date,
          description: payment.notes || (payment.transactionType === 'float' ? "Cash Float Issued" : "Cash Payment from Driver"),
          category: category,
          type: type,
          paymentMethod: payment.paymentMethod as any,
          referenceNumber: payment.referenceNumber,
          status: initialStatus as any,
          isReconciled: initialStatus === 'Completed',
          time: new Date().toLocaleTimeString(),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      };
      
      if (payment.id) {
          const updatedTx = { ...newTx, id: payment.id };
          await api.saveTransaction(updatedTx);
          setTransactions(prev => prev.map(t => t.id === payment.id ? { ...t, ...updatedTx } as FinancialTransaction : t));
          toast.success("Transaction updated");
      } else {
          const saved = await api.saveTransaction(newTx);
          setTransactions(prev => [saved.data, ...prev]);
      }
  };

  const handleEditTransaction = (tx: FinancialTransaction) => {
      setPaymentModalState({
          isOpen: true,
          editingTransaction: tx
      });
  };

  const handleVerifyTransaction = async (id: string) => {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;

      try {
          // Optimistic update
          const updatedTx = { ...tx, status: 'Verified' as const };
          setTransactions(prev => prev.map(t => t.id === id ? updatedTx : t));

          // Persist
          await api.saveTransaction(updatedTx);
          toast.success("Transaction verified");
      } catch (e) {
          console.error("Failed to verify transaction", e);
          toast.error("Failed to verify transaction");
          // Revert on failure
          setTransactions(prev => prev.map(t => t.id === id ? tx : t));
      }
  };

  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  const confirmDeleteTransaction = async () => {
      if (!transactionToDelete) return;

      try {
          await api.deleteTransaction(transactionToDelete);
          setTransactions(prev => prev.filter(t => t.id !== transactionToDelete));
          toast.success("Transaction deleted");
      } catch (e) {
          console.error("Failed to delete transaction", e);
          toast.error("Failed to delete transaction");
      } finally {
          setTransactionToDelete(null);
      }
  };

  const handleDeleteTransaction = (id: string) => {
      setTransactionToDelete(id);
  };
  
  // Merge Real Documents with Mock Documents
  const documents = useMemo(() => {
     // Clone mocks
     const docs = MOCK_DOCUMENTS.map(d => ({ ...d }));

     if (driver) {
         // 1. License Front
         if (driver.licenseFrontUrl) {
             const idx = docs.findIndex(d => d.type === 'License');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseFrontUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 2. License Back
         if (driver.licenseBackUrl) {
             const idx = docs.findIndex(d => d.type === 'License Back');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseBackUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 3. Proof of Address
         if (driver.proofOfAddressUrl) {
             const idx = docs.findIndex(d => d.type === 'Address Proof');
             const docName = `Proof of Address (${driver.proofOfAddressType || 'Document'})`;
             
             if (idx >= 0) {
                 docs[idx].url = driver.proofOfAddressUrl;
                 docs[idx].name = docName;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             } else {
                 // If for some reason it wasn't in mocks (e.g. if we removed it), add it back
                 docs.push({
                     id: 'real-proof-addr',
                     name: docName,
                     type: 'Address Proof',
                     status: 'Verified',
                     expiryDate: '2024-12-31',
                     uploadDate: new Date().toISOString().split('T')[0],
                     url: driver.proofOfAddressUrl
                 });
             }
         }
     }
     return docs;
  }, [driver]);
  
  // Date Range State (Default: Last 7 Days)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  // Calculate Metrics based on Date Range
  const metrics = useMemo(() => {
     if (!dateRange?.from) return null;

     const start = startOfDay(dateRange.from);
     const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
     const daysDiff = differenceInDays(end, start) + 1;
     
     // Previous Period for Trend
     const prevStart = subDays(start, daysDiff);
     const prevEnd = subDays(end, daysDiff);

     let periodEarnings = 0;
     let prevPeriodEarnings = 0;
     
     let totalEarnings = 0; // Lifetime
     let lifetimeTrips = 0; // Lifetime
     let totalCashCollected = 0; // Lifetime
     let lifetimeTolls = 0; // Lifetime

     let periodCompletedTrips = 0;
     let periodCancelledTrips = 0;
     let cashCollected = 0;
     
     // Efficiency Metrics
     let totalDistance = 0;
     let totalDuration = 0; // minutes
     
     // Phase 3: Fleet Efficiency Accumulators (Pre-Calculated from Import)
     let sumOnTripHours = 0;
     let sumToTripHours = 0;
     let sumAvailableHours = 0;
     let sumTotalHours = 0;
     
     const hoursDistribution = new Array(24).fill(0);

     // Breakdown
     let totalBaseFare = 0;
     let totalTips = 0;
     let totalTolls = 0;

     // Platform Stats
     const platformStats = {
        Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0 },
        InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0 }
     };

     // Chart Data Map
     const chartDataMap = new Map<string, { Uber: number, InDrive: number, Other: number }>();
     
     try {
         const days = eachDayOfInterval({ start, end });
         days.forEach(d => {
             chartDataMap.set(format(d, 'yyyy-MM-dd'), { Uber: 0, InDrive: 0, Other: 0 });
         });
     } catch (e) { }

     // --- Phase 3: Ratio-Reconstruction Algorithm ---
     // We no longer need to calculate "Report Duration" because we use the Efficiency Ratio method.
     // This ignores mismatched file dates and focuses on the Driver's Performance Profile.

     trips.forEach(trip => {
        const tripDateObj = new Date(trip.date);
        if (isNaN(tripDateObj.getTime())) return;
        
        // Lifetime stats
        totalEarnings += trip.amount;
        lifetimeTrips += 1;
        if (trip.cashCollected) totalCashCollected += Math.abs(trip.cashCollected);
        // Only count tolls as debt if they weren't collected in cash (assuming cash collected includes toll reimbursement)
        // If it's a card trip (no cash collected), the driver received the toll refund in their payout, so they owe it back.
        if (trip.tollCharges && !trip.cashCollected) {
            lifetimeTolls += trip.tollCharges;
        }

        // Filter Check
        if (isWithinInterval(tripDateObj, { start, end })) {
            periodEarnings += trip.amount;
            
            const platform = (trip.platform === 'Uber' || trip.platform === 'InDrive') ? trip.platform : 'Other';
            const pStats = platformStats[platform];

            // Platform Stats
            pStats.earnings += trip.amount;
            pStats.trips += 1;
            
            if (trip.status === 'Completed') {
                periodCompletedTrips++;
                pStats.completed++;
            }
            if (trip.status === 'Cancelled') periodCancelledTrips++;
            if (trip.cashCollected) cashCollected += Math.abs(trip.cashCollected);
            
            if (trip.distance) {
                totalDistance += trip.distance;
                pStats.distance += trip.distance;
            }
            if (trip.duration) totalDuration += trip.duration;
            
            // Phase 3: Sum pre-calculated hours (Static Reconstruction)
            sumOnTripHours += trip.onTripHours || 0;
            sumToTripHours += trip.toTripHours || 0;
            sumAvailableHours += trip.availableHours || 0;
            sumTotalHours += trip.totalHours || 0;

            // Hourly Distribution
            const h = tripDateObj.getHours();
            hoursDistribution[h]++;

            // Chart Data
            const dateKey = format(tripDateObj, 'yyyy-MM-dd');
            if (chartDataMap.has(dateKey)) {
                const dayData = chartDataMap.get(dateKey)!;
                dayData[platform] = (dayData[platform] || 0) + trip.amount;
            }

            // Breakdown
            if (trip.fareBreakdown) {
                totalBaseFare += trip.fareBreakdown.baseFare || 0;
                totalTips += trip.fareBreakdown.tips || 0;
            } else {
                totalBaseFare += trip.amount;
            }
            
            if (trip.tollCharges) {
                totalTolls += trip.tollCharges;
                pStats.tolls = (pStats.tolls || 0) + trip.tollCharges;
            }
        }

        // Previous Period Check
        if (isWithinInterval(tripDateObj, { start: prevStart, end: prevEnd })) {
            prevPeriodEarnings += trip.amount;
        }
     });

     // Prepare Charts Data
     const weeklyEarningsData = Array.from(chartDataMap.entries()).map(([date, amounts]) => {
         const d = new Date(date);
         return {
             day: format(d, 'MMM d'),
             fullDate: date,
             Uber: amounts.Uber,
             InDrive: amounts.InDrive,
             Other: amounts.Other
         };
     });

     // Earnings Breakdown Data
     const earningsBreakdownData = [
        { name: 'Base Fare', value: totalBaseFare, color: '#4f46e5' },
        { name: 'Tips', value: totalTips, color: '#10b981' },
     ].filter(d => d.value > 0);

     // Hourly Activity Data
     const hourlyActivityData = hoursDistribution.map((count, hour) => ({
         hour: `${hour}:00`,
         trips: count
     }));

     // Trend
     const trendPercent = prevPeriodEarnings > 0 
        ? ((periodEarnings - prevPeriodEarnings) / prevPeriodEarnings) * 100 
        : periodEarnings > 0 ? 100 : 0;

     // Derived Efficiency Metrics
     const totalTrips = periodCompletedTrips + periodCancelledTrips;
     const avgDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
     const avgDuration = totalTrips > 0 ? totalDuration / totalTrips : 0;
     const earningsPerKm = totalDistance > 0 ? periodEarnings / totalDistance : 0;
     const tripsPerHour = totalDuration > 0 ? (totalTrips / (totalDuration / 60)) : 0;

     // Completion Rate (Calculated from Logs)
     const completionRate = totalTrips > 0 ? (periodCompletedTrips / totalTrips) * 100 : 0;
     
     // Cancellation Rate (Calculated from Logs)
     const cancellationRate = totalTrips > 0 ? (periodCancelledTrips / totalTrips) * 100 : 0;

     // --- PHASE 2 FIX: USE IMPORTED METRICS IF AVAILABLE ---
     // Only use metrics that overlap with the selected date range
     const relevantCsvMetrics = csvMetrics?.filter(m => {
        const mStart = new Date(m.periodStart);
        const mEnd = new Date(m.periodEnd);
        // Check overlap: start <= rangeEnd AND end >= rangeStart
        return mStart <= end && mEnd >= start;
     }) || [];

     const latestCsvMetric = relevantCsvMetrics.length > 0 
        ? [...relevantCsvMetrics].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]
        : null;

     let acceptanceRate: number | null = null;
     if (latestCsvMetric?.acceptanceRate !== undefined) {
        acceptanceRate = Math.round(latestCsvMetric.acceptanceRate * 100);
     } else if (totalTrips > 0) {
        // Fallback to completion rate if we have trips but no CSV metric
        acceptanceRate = Math.round(completionRate);
     }
     
     const currentRating = latestCsvMetric?.ratingLast4Weeks || latestCsvMetric?.ratingLast500 || 5.0;

     // Use CSV metric for Cash Collected if available (it is more accurate)
     if (latestCsvMetric?.cashCollected) {
         totalCashCollected = Math.max(totalCashCollected, latestCsvMetric.cashCollected);
     }

     // Phase 4: Cash Logic

     // FIX: Prioritize Source of Truth (CSV) for Period Cash Collected
     // Calculate cash from CSV only if the selected range covers the CSV period
     const csvPeriodCash = relevantCsvMetrics.reduce((sum, m) => {
        const mStart = new Date(m.periodStart);
        const mEnd = new Date(m.periodEnd);
        
        // Calculate effective overlap duration
        const overlapStart = mStart > start ? mStart : start;
        const overlapEnd = mEnd < end ? mEnd : end;
        
        // Ensure valid overlap
        if (overlapStart > overlapEnd) return sum;

        const reportDays = differenceInDays(mEnd, mStart) + 1;
        const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;

        // Use CSV if overlap covers almost the entire report (allow 1 day margin)
        // This includes "Dec 8-14" (7 days) for a 7-day report
        // But excludes "Dec 8" (1 day) for a 7-day report
        if (overlapDays >= reportDays - 1) {
            return sum + (m.cashCollected || 0);
        }
        return sum;
     }, 0);
     
     // If CSV data exists, use it to override or floor the trip-calculated cash
     // This handles cases where trips might include adjustments (negative) but CSV reports actual collection
     if (csvPeriodCash > 0) {
         cashCollected = Math.max(cashCollected, csvPeriodCash);
     }

     // --- Phase 1: STRICT Cash Liability Logic ---
     
     // 1. Calculate Float Issued (Cash given to driver)
     // In transactions, floats are negative (money leaving fleet). We need the absolute value.
     const totalFloatIssued = Math.abs(transactions
        .filter(t => t.category === "Float Issue")
        .reduce((sum, t) => sum + (t.amount || 0), 0));

     // 2. Calculate Payments Received (Cash returned to fleet)
     // Strictly look for 'Payment_Received' type or 'Cash Collection' category.
     // These are positive values (money entering fleet).
     const totalPaymentsReceived = transactions
        .filter(t => {
            // Strict Safety: Never include Tag Balance operations as Driver Payments
            if (t.paymentMethod === 'Tag Balance') return false;
            
            return (t.type === 'Payment_Received' || t.category === 'Cash Collection') && t.amount > 0;
        })
        .reduce((sum, t) => sum + (t.amount || 0), 0);

     // 3. Calculate Approved Cash Toll Expenses (Valid expenses paid by driver)
     // These must be CASH payments (receipts) that are RESOLVED (Reimbursed/Written Off).
     // These reduce the liability.
     const approvedCashTollExpenses = transactions
        .filter(t => {
            const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
            const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl; // Assumption: Receipts imply cash/personal payment
            const isResolved = t.status === 'Resolved'; // Only count if approved
            return isToll && isCash && isResolved;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

     // 4. Final Net Outstanding Calculation
     // (Cash They Took) - (Cash They Gave Back) - (Valid Expenses They Paid)
     // Note: totalCashCollected is Lifetime, calculated earlier in the loop.
     const netOutstanding = (totalCashCollected + totalFloatIssued) - (totalPaymentsReceived + approvedCashTollExpenses);

     const cashReceived = totalPaymentsReceived; // Alias for backward compatibility if needed, but we used refined logic above.

     const periodCashReceived = transactions
        .filter(t => {
            const d = new Date(t.date);
            if (t.paymentMethod === 'Tag Balance') return false;
            return isWithinInterval(d, { start, end }) && (t.type === 'Payment_Received' || t.category === 'Cash Collection');
        })
        .reduce((sum, t) => sum + (t.amount || 0), 0);
     
     const periodNetChange = cashCollected - periodCashReceived;

     // Wallet State Logic (Phase 5)
     // Float Held: Total sum of negative transactions categorized as "Float Issue"
     // Note: In transactions, floats are negative.
     const floatHeld = Math.abs(transactions
        .filter(t => t.category === "Float Issue")
        .reduce((sum, t) => sum + (t.amount || 0), 0));

     // Pending Clearance: Sum of transactions with status "Pending"
     // Only count positive payments (inflows) as pending clearance, not floats or adjustments unless positive
     const pendingClearance = transactions
        .filter(t => t.status === 'Pending' && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

     // Trip Ratio Logic (from Vehicle Metrics)
     // Solution 1: "The Bridge" - Link Driver to Vehicle via Trips
     const activePlates = new Set<string>();
     
     // 1. Identify vehicles driven in this period from Trip Logs
     trips.forEach(trip => {
         const tripDateObj = new Date(trip.date);
         if (isWithinInterval(tripDateObj, { start, end }) && trip.vehicleId) {
             // Normalize plate (remove spaces, uppercase)
             activePlates.add(trip.vehicleId.replace(/[\s-]/g, '').toUpperCase());
         }
     });

     let relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
         const vmStart = new Date(vm.periodStart);
         const vmEnd = new Date(vm.periodEnd);
         // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
         const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
         
         const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
         // Check if this vehicle matches any plate from the driver's trips
         const matchesTripPlate = Array.from(activePlates).some(p => vmPlate.includes(p));
         
         return overlaps && matchesTripPlate;
     }) || [];

     // 2. Fallback: If no trips (so no bridge), try the static profile assignment
     if (relevantVehicleMetrics.length === 0 && driver?.vehicle) {
         let profilePlate = driver.vehicle;
         const parenMatch = profilePlate.match(/\((.*?)\)/);
         if (parenMatch) profilePlate = parenMatch[1];
         profilePlate = profilePlate.replace(/[\s-]/g, '').toUpperCase();

         relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
             const vmStart = new Date(vm.periodStart);
             const vmEnd = new Date(vm.periodEnd);
             // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
             const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
             
             const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
             return overlaps && vmPlate.includes(profilePlate);
         }) || [];
     }

     // --- Phase 3: Ratio-Reconstruction Algorithm ---
     // We now simply sum the pre-calculated fields from the Trip object.
     // These fields were populated during import based on the fleet efficiency ratios.
     
     const tripRatio = {
         onTrip: sumOnTripHours,
         toTrip: sumToTripHours,
         available: sumAvailableHours,
         totalOnline: sumTotalHours
     };

     return {
        periodEarnings,
        prevPeriodEarnings,
        trendPercent: trendPercent.toFixed(1),
        trendUp: periodEarnings >= prevPeriodEarnings,
        totalEarnings,
        lifetimeTrips,
        periodCompletedTrips,
        periodCancelledTrips,
        totalTrips,
        cashCollected,
        totalCashCollected,
        cashReceived, 
        netOutstanding,
        periodCashReceived, // New
        periodNetChange,    // New
        floatHeld,          // Phase 5
        pendingClearance,   // Phase 5
        weeklyEarningsData,
        earningsBreakdownData,
        hourlyActivityData,
        daysDiff,
        totalDistance,
        totalDuration,
        avgDistance,
        avgDuration,
        earningsPerKm,
        tripsPerHour,
        completionRate,
        cancellationRate,
        platformStats,
        // Phase 2 New Params
        acceptanceRate,
        currentRating,
        tripRatio, // New
        totalTolls
     };
  }, [trips, dateRange, csvMetrics, transactions, vehicleMetrics, driver]);

  const handleDateSelect = (newRange: DateRange | undefined) => {
    if (newRange?.from) {
      setDateRange(newRange);
    }
  };

  if (!metrics) return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Please select a date range to view driver metrics.</div>;

  const isToday = dateRange?.to && format(dateRange.to, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && metrics.daysDiff === 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-2 pl-0 hover:pl-2 transition-all">
          <ArrowLeft className="h-4 w-4" />
          Back to Drivers
        </Button>
        <div className="flex flex-wrap items-center gap-2">
           {/* Date Picker */}
           <div className={cn("grid gap-2")}>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[260px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleDateSelect}
                  numberOfMonths={2}
                  showOutsideDays={false}
                  required
                />
              </PopoverContent>
            </Popover>
          </div>

           <Button variant="outline" size="sm">
             <Download className="h-4 w-4 mr-2" />
             Export
           </Button>
           <Button variant="default" size="sm">
             <MessageSquare className="h-4 w-4 mr-2" />
             Message
           </Button>
        </div>
      </div>

      {/* Driver Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
        <div className="flex items-start gap-4 col-span-1 md:col-span-2">
          <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
             <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driverId}`} />
             <AvatarFallback className="text-xl bg-indigo-100 text-indigo-700">{driverName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
             <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{driverName}</h1>
                <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
             </div>
             <div className="text-sm text-slate-500 flex flex-col gap-1">
                <span className="flex items-center gap-2"><CreditCardIcon className="h-3 w-3" /> ID: {driverId}</span>
                {driver?.uberDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">Uber UUID: {driver.uberDriverId}</span>
                )}
                {driver?.inDriveDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">InDrive UUID: {driver.inDriveDriverId}</span>
                )}
                <span className="flex items-center gap-2"><CarIcon className="h-3 w-3" /> Vehicle: 2019 Toyota Sienta (5179KZ)</span>
                <span className="flex items-center gap-2"><CalendarIcon className="h-3 w-3" /> Member Since: Oct 12, 2023</span>
             </div>
          </div>
        </div>
        
        <div className="col-span-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-3">
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Performance Tier</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1">
                 <Award className="h-3 w-3" /> {currentTier?.name.toUpperCase() || 'BRONZE'}
              </Badge>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Total Lifetime Trips</span>
              <span className="font-semibold">{metrics.lifetimeTrips}</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Current Rating</span>
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                 5.0 <Star className="h-4 w-4 fill-current" />
              </div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4" onValueChange={setActiveTab}>
         <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financials</TabsTrigger>
            <TabsTrigger value="operations">Efficiency</TabsTrigger>
            <TabsTrigger value="quality">Service Quality</TabsTrigger>
            <TabsTrigger value="trips">Trip History</TabsTrigger>
            <TabsTrigger value="wallet">Cash Wallet</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
         </TabsList>

         <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               <MetricCard 
                  title={isToday ? "Today's Earnings" : "Period Earnings"} 
                  value={`$${metrics.periodEarnings.toFixed(2)}`} 
                  trend={`${metrics.trendPercent}% vs prev`} 
                  trendUp={metrics.trendUp}
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: `$${metrics.platformStats.Uber.earnings.toFixed(2)}`, color: '#3b82f6' },
                       { label: 'InDrive', value: `$${metrics.platformStats.InDrive.earnings.toFixed(2)}`, color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Period Cash Activity" 
                  value={`$${metrics.periodNetChange.toFixed(2)}`} 
                  subtext="Net Change in Period"
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  tooltip={`Lifetime Outstanding Balance: $${metrics.netOutstanding.toFixed(2)}`}
                  breakdown={[
                      { label: 'Collected', value: `$${metrics.cashCollected.toFixed(2)}`, color: '#f43f5e' },
                      { label: 'Paid', value: `$${metrics.periodCashReceived.toFixed(2)}`, color: '#10b981' }
                  ]}
                  action={
                      <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaymentModalState({ isOpen: true })}>
                          Log Cash Payment
                      </Button>
                  }
               />
               <MetricCard 
                  title="Km Driven for Period" 
                  value={`${metrics.totalDistance.toFixed(1)} km`} 
                  icon={<Navigation className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: `${metrics.platformStats.Uber.distance.toFixed(1)} km`, color: '#3b82f6' },
                       { label: 'InDrive', value: `${metrics.platformStats.InDrive.distance.toFixed(1)} km`, color: '#10b981' }
                   ]}
               />
               <Card>
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-slate-500">Trip Meter</CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div className="h-[180px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Pie
                                 data={[
                                    { name: 'Available', value: metrics.tripRatio.available, fill: '#1e3a8a' },
                                    { name: 'To Trip', value: metrics.tripRatio.toTrip, fill: '#fbbf24' },
                                    { name: 'On Trip', value: metrics.tripRatio.onTrip, fill: '#10b981' }
                                 ]}
                                 cx="50%"
                                 cy="50%"
                                 innerRadius={55}
                                 outerRadius={75}
                                 paddingAngle={0}
                                 dataKey="value"
                                 startAngle={90}
                                 endAngle={-270}
                                 stroke="none"
                              >
                                 <Cell key="Available" fill="#1e3a8a" />
                                 <Cell key="To Trip" fill="#fbbf24" />
                                 <Cell key="On Trip" fill="#10b981" />
                              </Pie>
                              <Tooltip formatter={(value: number) => [value.toFixed(2) + ' hrs', 'Duration']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                           </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                           <div className="text-2xl font-bold text-slate-900">{metrics.tripRatio.totalOnline.toFixed(2)}</div>
                           <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Hours Online</div>
                        </div>
                     </div>
                     <div className="mt-4 flex justify-between px-2">
                        <div className="flex flex-col items-center gap-1">
                           <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.available.toFixed(2)} hrs</span>
                           <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-[#1e3a8a]"></div>
                              <span className="text-xs font-medium text-slate-500">Available</span>
                           </div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                           <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.toTrip.toFixed(2)} hrs</span>
                           <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
                              <span className="text-xs font-medium text-slate-500">To trip</span>
                           </div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                           <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.onTrip.toFixed(2)} hrs</span>
                           <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                              <span className="text-xs font-medium text-slate-500">On trip</span>
                           </div>
                        </div>
                     </div>
                  </CardContent>
               </Card>
               <MetricCard 
                  title="Toll Refunded"
                  value={`$${metrics.totalTolls.toFixed(2)}`}
                  subtext="Added to Debt (Cash Risk)"
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  breakdown={[
                       { label: 'Uber', value: `$${metrics.platformStats.Uber.tolls.toFixed(2)}`, color: '#3b82f6' },
                       { label: 'InDrive', value: `$${metrics.platformStats.InDrive.tolls.toFixed(2)}`, color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Month-to-Date Earnings"
                  value={`$${monthlyEarnings.toFixed(2)}`}
                  subtext="Earnings for current month tier status"
                  icon={<Award className="h-4 w-4 text-slate-500" />}
               />
            </div>

            {/* Benchmarking Section */}
            {fleetStats && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-indigo-600" />
                            Performance Benchmarks
                        </CardTitle>
                        <CardDescription>Comparing {driverName} against the fleet average.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Earnings Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Earnings per Trip</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">${(metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)).toFixed(2)}</span>
                                        <span className="text-xs text-slate-500 ml-2">vs ${fleetStats.avgEarningsPerTrip.toFixed(2)} avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                    {/* Fleet Avg Marker */}
                                    <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: '60%' }} 
                                    />
                                    {/* Driver Bar */}
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            (metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) >= fleetStats.avgEarningsPerTrip 
                                                ? "bg-emerald-500" 
                                                : "bg-amber-500"
                                        )}
                                        style={{ width: `${Math.min(100, ((metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) / (fleetStats.avgEarningsPerTrip * 1.5)) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                    {(metrics.periodEarnings / Math.max(1, metrics.periodCompletedTrips)) >= fleetStats.avgEarningsPerTrip 
                                        ? "Performing above fleet average." 
                                        : "Performing below fleet average."}
                                </p>
                            </div>

                            {/* Acceptance Rate Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Acceptance Rate</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">{metrics.acceptanceRate !== null ? `${metrics.acceptanceRate}%` : '-'}</span>
                                        <span className="text-xs text-slate-500 ml-2">vs {fleetStats.avgAcceptanceRate}% avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                     {/* Fleet Avg Marker */}
                                     <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: `${fleetStats.avgAcceptanceRate}%` }} 
                                    />
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            !metrics.acceptanceRate ? "bg-slate-300" : metrics.acceptanceRate >= fleetStats.avgAcceptanceRate ? "bg-emerald-500" : "bg-rose-500"
                                        )}
                                        style={{ width: `${metrics.acceptanceRate || 0}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                     {!metrics.acceptanceRate 
                                        ? "No data for this period." 
                                        : metrics.acceptanceRate >= fleetStats.avgAcceptanceRate 
                                            ? "Excellent reliability." 
                                            : "Acceptance rate is critical."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <Card className="lg:col-span-2">
                  <CardHeader>
                     <CardTitle>Financial Performance</CardTitle>
                     <CardDescription>Earnings over selected period.</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={metrics.weeklyEarningsData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis 
                              dataKey="day" 
                              axisLine={false} 
                              tickLine={false} 
                              interval={metrics.daysDiff > 14 ? 'preserveStartEnd' : 0}
                              tick={{ fontSize: 12 }}
                           />
                           <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                           <Tooltip 
                              cursor={{fill: '#f1f5f9'}}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                           />
                           <Bar dataKey="Uber" stackId="a" fill="#3b82f6" />
                           <Bar dataKey="InDrive" stackId="a" fill="#10b981" />
                           <Bar dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </CardContent>
               </Card>

               <Card>
                  <CardHeader>
                     <CardTitle className="text-rose-600 flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Immediate Actions
                     </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-lg border border-rose-100">
                           <div className="h-6 w-6 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                           <div>
                              <p className="font-medium text-rose-900 text-sm">Low Trip Count</p>
                              <p className="text-xs text-rose-700 mt-1">Driver has low activity this week.</p>
                           </div>
                        </div>
                     </div>
                     <Button className="w-full mt-2" variant="outline">View Full Action Plan</Button>
                  </CardContent>
               </Card>
            </div>
         </TabsContent>

         <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
               <Card>
                  <CardHeader>
                     <CardTitle>Earnings Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center">
                     <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                           <Pie
                              data={metrics.earningsBreakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                           >
                              {metrics.earningsBreakdownData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                           </Pie>
                           <Tooltip />
                        </PieChart>
                     </ResponsiveContainer>
                  </CardContent>
               </Card>
            </div>

            <DriverEarningsHistory driverId={driverId} transactions={transactions} />
         </TabsContent>

         <TabsContent value="wallet" className="space-y-6">
             {/* Summary Cards Row (Phase 5) */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {/* Card 1: Net Outstanding */}
                 <Card className="bg-white">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Net Outstanding</CardTitle>
                         <DollarSign className="h-4 w-4 text-slate-500" />
                     </CardHeader>
                     <CardContent>
                         <div className={cn("text-2xl font-bold", metrics.netOutstanding > 0 ? "text-rose-600" : "text-emerald-600")}>
                             ${metrics.netOutstanding.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             {metrics.netOutstanding > 0 ? "Driver owes platform" : "Platform owes driver"}
                         </p>
                     </CardContent>
                 </Card>

                 {/* Card 2: Float Held */}
                 <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Float Held</CardTitle>
                         <Wallet className="h-4 w-4 text-amber-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-amber-600">
                             ${metrics.floatHeld.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Active cash float
                         </p>
                     </CardContent>
                 </Card>

                  {/* Card 3: Unverified Payments */}
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Unverified Payments</CardTitle>
                         <Clock className="h-4 w-4 text-blue-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-blue-600">
                             ${metrics.pendingClearance.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Pending bank transfers
                         </p>
                     </CardContent>
                 </Card>
             </div>

             <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900">Financial Records</h3>
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button 
                       className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-all", walletView === 'settlements' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                       onClick={() => setWalletView('settlements')}
                    >
                       Weekly Settlements
                    </button>
                    <button 
                       className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-all", walletView === 'ledger' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                       onClick={() => setWalletView('ledger')}
                    >
                       Transaction Ledger
                    </button>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    {walletView === 'settlements' ? (
                        <WeeklySettlementView 
                            trips={trips}
                            transactions={transactions}
                            csvMetrics={csvMetrics}
                            onLogPayment={(start, end, amount) => setPaymentModalState({
                                isOpen: true,
                                initialWorkPeriodStart: start.toISOString(),
                                initialWorkPeriodEnd: end.toISOString(),
                                initialAmount: amount
                            })}
                        />
                    ) : (
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle>Transaction Ledger</CardTitle>
                                        <CardDescription>History of cash payments and adjustments.</CardDescription>
                                    </div>
                                    <div className="flex p-1 bg-slate-100 rounded-lg shrink-0">
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'tolls' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('tolls')}
                                        >
                                            Toll Activity
                                        </button>
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'payments' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('payments')}
                                        >
                                            Payments Log
                                        </button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {ledgerView === 'tolls' ? (
                                    <div className="space-y-4">
                                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-medium text-emerald-900">Net Toll Reimbursement</h4>
                                                <p className="text-xs text-emerald-700 mt-1">Approved toll expenses minus dispute chargebacks.</p>
                                            </div>
                                            <div className="text-xl font-bold text-emerald-700">
                                                ${cashTollTransactions.reduce((sum, t) => {
                                                    const type = getTollTransactionType(t.category);
                                                    return type === 'credit' ? sum + Math.abs(t.amount) : sum - Math.abs(t.amount);
                                                }, 0).toFixed(2)}
                                            </div>
                                        </div>
                                        
                                        <div className="rounded-md border border-slate-200 overflow-x-auto">
                                            <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right text-red-700">Debit (Charge)</TableHead>
                                                    <TableHead className="text-right text-emerald-700">Credit (Reimburse)</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {groupedTollTransactions.length > 0 ? (
                                                    groupedTollTransactions.map(({ parent, children }) => {
                                                        const type = getTollTransactionType(parent.category);
                                                        const isCredit = type === 'credit';
                                                        const hasChildren = children.length > 0;
                                                        const isExpanded = expandedRows.has(parent.id);

                                                        return (
                                                            <React.Fragment key={parent.id}>
                                                                <TableRow 
                                                                    className={cn("transition-colors", hasChildren && "cursor-pointer hover:bg-slate-50")}
                                                                    onClick={() => hasChildren && toggleRow(parent.id)}
                                                                >
                                                                    <TableCell className="font-medium text-slate-600">
                                                                        <div className="flex items-center gap-2">
                                                                            {hasChildren && (
                                                                                <div className="text-slate-400">
                                                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                </div>
                                                                            )}
                                                                            {format(new Date(parent.date), 'MMM d, yyyy')}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="flex flex-col">
                                                                            <span className="font-medium text-slate-900">{parent.description}</span>
                                                                            {parent.receiptUrl && (
                                                                                <a 
                                                                                    href={parent.receiptUrl} 
                                                                                    target="_blank" 
                                                                                    rel="noreferrer" 
                                                                                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    <FileText className="h-3 w-3" />
                                                                                    View Receipt
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="secondary" className={cn(
                                                                            "hover:bg-opacity-80",
                                                                            isCredit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                                                        )}>
                                                                            {parent.status || 'Completed'}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {!isCredit ? (
                                                                            <span className="text-red-600 font-bold">${Math.abs(parent.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {isCredit ? (
                                                                            <span className="text-emerald-600 font-bold">${Math.abs(parent.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>

                                                                {/* Child Rows (Dispute Charges) */}
                                                                {hasChildren && isExpanded && children.map(child => (
                                                                    <TableRow key={child.id} className="bg-slate-50/50 hover:bg-slate-50">
                                                                        <TableCell className="pl-10 relative">
                                                                            <div className="absolute left-6 top-0 bottom-1/2 w-px bg-slate-200"></div>
                                                                            <div className="absolute left-6 top-1/2 w-3 h-px bg-slate-200"></div>
                                                                            <span className="text-slate-500 text-xs">
                                                                                {format(new Date(child.date), 'MMM d')}
                                                                            </span>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="flex items-center gap-2">
                                                                                <CornerDownRight className="h-3 w-3 text-slate-400" />
                                                                                <span className="text-sm text-slate-600">{child.description}</span>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                                                                                {child.status}
                                                                            </Badge>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            <span className="text-red-600 text-sm font-medium">
                                                                                ${Math.abs(child.amount).toFixed(2)}
                                                                            </span>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            <span className="text-slate-300">-</span>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                                            No toll activity found.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-end">
                                            <Button 
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                                onClick={() => setPaymentModalState({ isOpen: true })}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Log New Payment
                                            </Button>
                                        </div>

                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead>Method</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paymentTransactions.length > 0 ? (
                                                    paymentTransactions.map((tx) => (
                                                        <TableRow key={tx.id}>
                                                            <TableCell className="font-medium text-slate-600">{format(new Date(tx.date), 'MMM d, yyyy')}</TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-slate-900">{tx.description}</span>
                                                                    {tx.referenceNumber && (
                                                                        <span className="text-xs text-slate-500 font-mono mt-0.5">
                                                                            Ref: {tx.referenceNumber}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-2 text-slate-600">
                                                                    {tx.paymentMethod === 'Cash' && <DollarSign className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Bank Transfer' && <Landmark className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Mobile Money' && <Wallet className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Check' && <FileText className="h-3 w-3" />}
                                                                    <span className="text-sm">{tx.paymentMethod || 'Cash'}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className={cn(
                                                                    "font-normal",
                                                                    tx.status === 'Completed' && "bg-emerald-100 text-emerald-700",
                                                                    tx.status === 'Verified' && "bg-emerald-100 text-emerald-700",
                                                                    tx.status === 'Pending' && "bg-amber-100 text-amber-700",
                                                                    tx.status === 'Failed' && "bg-red-100 text-red-700"
                                                                )}>
                                                                    {tx.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold font-mono text-emerald-600">
                                                                +${tx.amount.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1 justify-end">
                                                                    {tx.status === 'Pending' && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-amber-600 hover:text-emerald-600 hover:bg-emerald-50"
                                                                            onClick={() => handleVerifyTransaction(tx.id)}
                                                                            title="Verify Transaction"
                                                                        >
                                                                            <CheckCircle2 className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                                <span className="sr-only">Open menu</span>
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem onClick={() => handleEditTransaction(tx)}>
                                                                                <Pencil className="mr-2 h-4 w-4" />
                                                                                Edit
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem onClick={() => handleDeleteTransaction(tx.id)} className="text-red-600 focus:text-red-600">
                                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                                Delete
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                            No payments recorded.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Column: Actions & Risk */}
                <div className="space-y-6">
                     {/* Cash Risk Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Cash Risk Analysis</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                   <span className="text-slate-500">Cash Collected</span>
                                   <span className="font-medium">${metrics.cashCollected.toFixed(2)}</span>
                                </div>
                                <Progress 
                                    value={metrics.periodEarnings > 0 ? (metrics.cashCollected / metrics.periodEarnings) * 100 : 0} 
                                    className="h-2 bg-slate-100" 
                                    indicatorClassName="bg-amber-500" 
                                />
                                <p className="text-xs text-amber-600 font-medium">
                                    {metrics.periodEarnings > 0 ? ((metrics.cashCollected / metrics.periodEarnings) * 100).toFixed(1) : 0}% of earnings
                                </p>
                             </div>
                             <div className="pt-2">
                                <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                                    <p className="text-xs text-slate-500">Total Period Earnings</p>
                                    <p className="text-sm font-semibold">${metrics.periodEarnings.toFixed(2)}</p>
                                </div>
                             </div>
                             <Separator />
                             <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaymentModalState({ isOpen: true })}>
                                 Log Cash Payment
                             </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
         </TabsContent>

         <TabsContent value="operations" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Earnings per Km" 
                    value={`$${metrics.earningsPerKm.toFixed(2)}`} 
                    icon={<Zap className="h-4 w-4 text-slate-500" />}
                    subtext="Target: >$1.50"
                 />
                 <MetricCard 
                    title="Avg Duration" 
                    value={`${metrics.avgDuration.toFixed(0)} min`} 
                    icon={<Clock className="h-4 w-4 text-slate-500" />}
                 />
                 <MetricCard 
                    title="Total Distance" 
                    value={`${metrics.totalDistance.toFixed(1)} km`} 
                    icon={<MapPin className="h-4 w-4 text-slate-500" />}
                 />
                 <MetricCard 
                    title="Total Fuel Used"
                    value="Coming Soon"
                    subtext="Total fuel used for the period"
                    icon={<Fuel className="h-4 w-4 text-slate-500" />}
                 />
             </div>
             
             <Card>
                <CardHeader>
                   <CardTitle>Activity by Hour</CardTitle>
                   <CardDescription>When does this driver drive the most?</CardDescription>
                </CardHeader>
                <CardContent>
                   <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={metrics.hourlyActivityData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                         <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={12} />
                         <YAxis axisLine={false} tickLine={false} />
                         <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                         <Bar dataKey="trips" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
             </Card>
         </TabsContent>

         <TabsContent value="quality" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Customer Rating" 
                    value={metrics.currentRating.toFixed(1)} 
                    subtext="Last 4 weeks"
                    icon={<Star className="h-4 w-4 text-slate-500" />}
                     breakdown={[
                        { label: 'Uber', value: metrics.platformStats.Uber.ratingCount > 0 ? (metrics.platformStats.Uber.ratingSum / metrics.platformStats.Uber.ratingCount).toFixed(1) : metrics.currentRating.toFixed(1), color: '#3b82f6' },
                        { label: 'InDrive', value: metrics.platformStats.InDrive.ratingCount > 0 ? (metrics.platformStats.InDrive.ratingSum / metrics.platformStats.InDrive.ratingCount).toFixed(1) : metrics.currentRating.toFixed(1), color: '#10b981' }
                     ]}
                 />
                 <MetricCard 
                    title="Completion Rate" 
                    value={`${metrics.completionRate.toFixed(1)}%`} 
                    icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
                    progress={metrics.completionRate}
                    progressColor="bg-emerald-500"
                    target="Target: 95%"
                 />
                 <MetricCard 
                    title="Cancelled Trips" 
                    value={metrics.periodCancelledTrips} 
                    icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
                    subtext="In selected period"
                 />
                 <MetricCard 
                    title="Safety Score" 
                    value="98/100" 
                    icon={<Shield className="h-4 w-4 text-slate-500" />}
                    subtext="Based on harsh braking events"
                 />
               <MetricCard 
                  title="Acceptance Rate" 
                  value={metrics.acceptanceRate !== null ? `${metrics.acceptanceRate}%` : '-'} 
                  target="Target: >85%"
                  progress={metrics.acceptanceRate || 0}
                  progressColor={!metrics.acceptanceRate ? "bg-slate-200" : metrics.acceptanceRate >= 80 ? "bg-emerald-500" : metrics.acceptanceRate < 40 ? "bg-rose-600" : "bg-amber-500"}
                  icon={(metrics.acceptanceRate !== null && metrics.acceptanceRate < 40) ? <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" /> : <ThumbsUp className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${Math.round((metrics.platformStats.Uber.completed / metrics.platformStats.Uber.trips) * 100)}%` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${Math.round((metrics.platformStats.InDrive.completed / metrics.platformStats.InDrive.trips) * 100)}%` : '-', color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Cancellation Rate" 
                  value={metrics.totalTrips > 0 ? `${metrics.cancellationRate.toFixed(1)}%` : '-'} 
                  target="Target: <5%"
                  progress={metrics.cancellationRate}
                  progressColor={metrics.cancellationRate < 5 ? "bg-emerald-500" : "bg-rose-500"}
                  tooltip={`Calculated from ${metrics.periodCancelledTrips} cancelled trips out of ${metrics.totalTrips} total trips in the selected period.`}
                  icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${(( (metrics.platformStats.Uber.trips - metrics.platformStats.Uber.completed) / metrics.platformStats.Uber.trips) * 100).toFixed(1)}%` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${(( (metrics.platformStats.InDrive.trips - metrics.platformStats.InDrive.completed) / metrics.platformStats.InDrive.trips) * 100).toFixed(1)}%` : '-', color: '#10b981' }
                   ]}
               />
             </div>

             <Card>
                <CardHeader>
                   <CardTitle>Recent Trip Issues</CardTitle>
                </CardHeader>
                <CardContent>
                   {metrics.periodCancelledTrips === 0 ? (
                       <div className="text-center py-8 text-slate-500">
                           <CheckCircle2 className="h-12 w-12 text-emerald-100 fill-emerald-500 mx-auto mb-3" />
                           <p>No cancelled trips in this period. Great job!</p>
                       </div>
                   ) : (
                       <div className="space-y-4">
                           <p className="text-sm text-slate-500">Trips that were cancelled or had issues.</p>
                           {/* List cancelled trips here if needed */}
                       </div>
                   )}
                </CardContent>
             </Card>
         </TabsContent>

         <TabsContent value="trips" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Trip History</CardTitle>
                    <CardDescription>View and manage full trip logs.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search trip ID, date..." 
                                className="pl-9" 
                                value={tripSearch}
                                onChange={(e) => setTripSearch(e.target.value)}
                            />
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly ? "secondary" : "outline"} size="sm" className="gap-2">
                                    <Filter className="h-4 w-4" /> 
                                    Filter
                                    {(filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly) && (
                                        <Badge variant="secondary" className="h-5 px-1.5 rounded-full ml-1 text-[10px]">
                                            {filterPlatform.length + filterStatus.length + (filterCashOnly ? 1 : 0)}
                                        </Badge>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-4" align="end">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Platform</h4>
                                        <div className="flex flex-col gap-2">
                                            {['Uber', 'InDrive', 'Other'].map(p => (
                                                <div key={p} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`filter-${p}`} 
                                                        checked={filterPlatform.includes(p)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) setFilterPlatform([...filterPlatform, p]);
                                                            else setFilterPlatform(filterPlatform.filter(x => x !== p));
                                                        }}
                                                    />
                                                    <Label htmlFor={`filter-${p}`} className="text-sm font-normal cursor-pointer">{p}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Status</h4>
                                        <div className="flex flex-col gap-2">
                                            {['Completed', 'Cancelled'].map(s => (
                                                <div key={s} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`filter-${s}`} 
                                                        checked={filterStatus.includes(s)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) setFilterStatus([...filterStatus, s]);
                                                            else setFilterStatus(filterStatus.filter(x => x !== s));
                                                        }}
                                                    />
                                                    <Label htmlFor={`filter-${s}`} className="text-sm font-normal cursor-pointer">{s}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Payment</h4>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox 
                                                    id="filter-cash" 
                                                    checked={filterCashOnly}
                                                    onCheckedChange={(checked) => setFilterCashOnly(!!checked)}
                                                />
                                                <Label htmlFor="filter-cash" className="text-sm font-normal cursor-pointer">Cash Trips Only</Label>
                                            </div>
                                        </div>
                                    </div>
                                    {(filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly) && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="w-full mt-2 h-8 text-xs text-muted-foreground"
                                            onClick={() => {
                                                setFilterPlatform([]);
                                                setFilterStatus([]);
                                                setFilterCashOnly(false);
                                            }}
                                        >
                                            Clear Filters
                                        </Button>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Distance</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Cash Collected</TableHead>
                                <TableHead>Earnings</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trips
                                .filter(t => {
                                    // Search Filter
                                    const matchesSearch = t.id.includes(tripSearch) || 
                                        t.date.includes(tripSearch) ||
                                        (t.status || '').toLowerCase().includes(tripSearch.toLowerCase()) ||
                                        (t.platform || '').toLowerCase().includes(tripSearch.toLowerCase());
                                    
                                    // Platform Filter
                                    const matchesPlatform = filterPlatform.length === 0 || filterPlatform.includes(t.platform || 'Other');
                                    
                                    // Status Filter
                                    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(t.status);

                                    // Cash Filter
                                    const matchesCash = !filterCashOnly || 
                                        (Math.abs(Number(t.cashCollected || 0)) > 0) || 
                                        (t.platform && ['indrive', 'bolt'].includes(t.platform.toLowerCase())) ||
                                        (t as any).paymentMethod === 'Cash';

                                    return matchesSearch && matchesPlatform && matchesStatus && matchesCash;
                                })
                                .slice((tripPage - 1) * tripsPerPage, tripPage * tripsPerPage)
                                .map((trip) => {
                                    const isPhantom = trip.status === 'Cancelled' && (trip.distance || 0) > 0.1;
                                    return (
                                    <TableRow key={trip.id} className={isPhantom ? "bg-rose-50 hover:bg-rose-100 border-l-2 border-l-rose-500" : ""}>
                                    <TableCell>
                                        <div className="font-medium">{format(new Date(trip.date), 'MMM d, yyyy')}</div>
                                        <div className="text-xs text-slate-500">{format(new Date(trip.date), 'h:mm a')}</div>
                                        {isPhantom && <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Phantom Trip Detected</span>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.platform === 'Uber' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            trip.platform === 'InDrive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {trip.platform || 'Other'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {trip.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{trip.distance ? `${trip.distance.toFixed(1)} km` : '-'}</TableCell>
                                    <TableCell>{trip.duration ? `${trip.duration.toFixed(0)} min` : '-'}</TableCell>
                                    <TableCell className="font-medium text-amber-600">
                                        {Math.abs(Number(trip.cashCollected || 0)) > 0 ? `$${Math.abs(Number(trip.cashCollected)).toFixed(2)}` : 
                                        (trip.platform && ['indrive', 'bolt'].includes(trip.platform.toLowerCase()) ? `$${(trip.amount ?? 0).toFixed(2)}` : '-')}
                                    </TableCell>
                                    <TableCell className="font-medium">${(trip.amount ?? 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8"
                                            onClick={() => setSelectedTrip(trip)}
                                        >
                                            <Eye className="h-4 w-4 text-slate-400" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                ); })}
                            {trips.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                                        No trips found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    
                    {/* Simple Pagination */}
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => Math.max(1, p - 1))}
                            disabled={tripPage === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => p + 1)}
                            disabled={tripPage * tripsPerPage >= trips.length}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
         </TabsContent>

         <TabsContent value="profile" className="space-y-6">
            <Tabs defaultValue="documents" className="w-full">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6">
                   <TabsTrigger 
                     value="documents"
                     className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
                   >
                     Documents
                   </TabsTrigger>
                   <TabsTrigger 
                     value="personal-info"
                     className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
                   >
                     Personal Information
                   </TabsTrigger>
                </TabsList>

                <TabsContent value="documents">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Driver Documents</CardTitle>
                                <CardDescription>Manage licenses, insurance, and permits.</CardDescription>
                            </div>
                            <Button size="sm"><Upload className="h-4 w-4 mr-2" /> Upload Document</Button>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Document Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Expiry Date</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {documents.map((doc) => (
                                        <TableRow key={doc.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-slate-400" />
                                                    {doc.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>{doc.type}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    doc.status === 'Expired' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    doc.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    'bg-slate-50 text-slate-700'
                                                }>
                                                    {doc.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={
                                                new Date(doc.expiryDate) < new Date() ? 'text-rose-600 font-medium' : ''
                                            }>
                                                {format(new Date(doc.expiryDate), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 hover:bg-slate-100"
                                                    onClick={() => setSelectedDocument(doc)}
                                                >
                                                    <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                             </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="personal-info">
                   <Card>
                      <CardHeader>
                          <CardTitle>Personal Information</CardTitle>
                          <CardDescription>Personal details and contact info.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 max-w-2xl">
                          <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Full Name</Label>
                                      <Input value={driverName} readOnly className="bg-slate-50" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Email Address</Label>
                                      <Input value={driver?.email || 'N/A'} readOnly className="bg-slate-50" />
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Phone Number</Label>
                                      <Input value={driver?.phone || 'N/A'} readOnly className="bg-slate-50" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Driver ID</Label>
                                      <Input value={driverId} readOnly className="bg-slate-50 font-mono" />
                                  </div>
                              </div>
                          </div>

                          <Separator />
                          
                          <div className="space-y-4">
                              <div className="flex items-center gap-2 mb-2">
                                  <CreditCardIcon className="h-4 w-4 text-slate-500" />
                                  <h4 className="font-semibold text-slate-900">Bank Account Information</h4>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Name on Account</Label>
                                      <Input value={driver?.bankInfo?.accountName || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Bank Name</Label>
                                      <Input value={driver?.bankInfo?.bankName || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                      <Label>Branch</Label>
                                      <Input value={driver?.bankInfo?.branch || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                                  <div className="col-span-2 space-y-2">
                                      <Label>Account Number</Label>
                                      <Input value={driver?.bankInfo?.accountNumber || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                              </div>
                              
                              <div className="space-y-2">
                                  <Label>Account Type</Label>
                                  <Input value={driver?.bankInfo?.accountType || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                              </div>
                          </div>
                      </CardContent>
                   </Card>
                </TabsContent>
            </Tabs>
         </TabsContent>
      </Tabs>

      {/* Document Viewer Modal */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-3xl w-full h-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-4 pb-2">
                <DialogTitle>{selectedDocument?.name}</DialogTitle>
                <DialogDescription>
                    {selectedDocument?.type} • Uploaded on {selectedDocument?.uploadDate && format(new Date(selectedDocument.uploadDate), 'MMM d, yyyy')}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 bg-slate-900 flex items-center justify-center p-4 overflow-auto min-h-[400px]">
                {selectedDocument?.url ? (
                    <img 
                        src={selectedDocument.url} 
                        alt={selectedDocument.name} 
                        className="max-w-full max-h-[70vh] object-contain rounded-md"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <FileText className="h-12 w-12 opacity-50" />
                        <p>No preview available</p>
                    </div>
                )}
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setSelectedDocument(null)}>Close</Button>
                 {selectedDocument?.url && (
                    <Button onClick={() => window.open(selectedDocument.url, '_blank')}>
                        <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                 )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Trip Details Modal */}
      <Dialog open={!!selectedTrip} onOpenChange={(open) => !open && setSelectedTrip(null)}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>Trip Details</DialogTitle>
            <DialogDescription>
                Trip ID: {selectedTrip?.id}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTrip && (
              <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Date & Time</Label>
                      <div className="font-medium">
                          {selectedTrip.date ? format(new Date(selectedTrip.date), 'MMM d, yyyy h:mm a') : 'N/A'}
                      </div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Platform</Label>
                      <div className="font-medium flex items-center gap-2">
                          <Badge variant="outline">{selectedTrip.platform}</Badge>
                          <Badge variant={selectedTrip.status === 'Completed' ? 'default' : 'secondary'} className={selectedTrip.status === 'Completed' ? 'bg-emerald-500' : ''}>
                              {selectedTrip.status}
                          </Badge>
                      </div>
                  </div>

                  <div className="col-span-2 space-y-1 pt-2">
                      <Label className="text-slate-500 text-xs">Pickup</Label>
                      <div className="font-medium flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                          <span>{selectedTrip.pickupLocation || 'Unknown Location'}</span>
                      </div>
                  </div>
                  <div className="col-span-2 space-y-1 pb-2 border-b">
                      <Label className="text-slate-500 text-xs">Dropoff</Label>
                      <div className="font-medium flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                          <span>{selectedTrip.dropoffLocation || 'Unknown Location'}</span>
                      </div>
                  </div>

                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Distance</Label>
                      <div className="font-medium">{selectedTrip.distance ? `${selectedTrip.distance.toFixed(1)} km` : '-'}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Duration</Label>
                      <div className="font-medium">{selectedTrip.duration ? `${selectedTrip.duration.toFixed(0)} min` : '-'}</div>
                  </div>

                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Driver Earnings</Label>
                      <div className="font-bold text-lg text-emerald-600">${selectedTrip.amount?.toFixed(2)}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Cash Collected</Label>
                      <div className="font-bold text-lg text-amber-600">
                        {Math.abs(Number(selectedTrip.cashCollected || 0)) > 0 
                            ? `$${Math.abs(Number(selectedTrip.cashCollected)).toFixed(2)}` 
                            : '-'}
                      </div>
                  </div>

                  {selectedTrip.fareBreakdown && (
                    <div className="col-span-2 pt-2 border-t mt-2">
                        <Label className="text-slate-500 text-xs mb-2 block">Fare Breakdown</Label>
                        <div className="text-sm bg-slate-50 p-3 rounded-md border space-y-1">
                            {Object.entries(selectedTrip.fareBreakdown).map(([key, value]) => {
                                if (!value) return null;
                                // Convert camelCase to Title Case
                                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                return (
                                    <div key={key} className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">{label}</span>
                                        <span className="font-medium text-slate-900">${Number(value).toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                  )}
              </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
               <Button variant="outline" onClick={() => setSelectedTrip(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <LogCashPaymentModal 
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false })}
        onSave={handleSavePayment}
        driverName={driverName}
        cashOwed={metrics.netOutstanding} // Use calculated net outstanding
        initialWorkPeriodStart={paymentModalState.initialWorkPeriodStart}
        initialWorkPeriodEnd={paymentModalState.initialWorkPeriodEnd}
        initialAmount={paymentModalState.initialAmount}
        initialTransaction={paymentModalState.editingTransaction}
      />
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete this transaction? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteTransaction} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon, breakdown, action, tooltip }: any) {
   return (
      <Card>
         <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
               <div className="flex items-center gap-2">
                   <p className="text-sm font-medium text-slate-500">{title}</p>
                   {tooltip && (
                       <TooltipProvider>
                           <UiTooltip>
                               <TooltipTrigger>
                                   <Info className="h-3 w-3 text-slate-400" />
                               </TooltipTrigger>
                               <TooltipContent>
                                   <p className="max-w-[200px] text-xs">{tooltip}</p>
                               </TooltipContent>
                           </UiTooltip>
                       </TooltipProvider>
                   )}
               </div>
               {icon}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
               <h2 className="text-2xl font-bold">{value}</h2>
               {trend && (
                  <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {trend}
                  </span>
               )}
            </div>
            {(target || progress !== undefined) && (
               <div className="mt-3 space-y-1">
                  {target && <p className="text-xs text-slate-500">{target}</p>}
                  {progress !== undefined && (
                     <Progress value={progress} className="h-1.5" indicatorClassName={progressColor} />
                  )}
               </div>
            )}
            {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            
            {breakdown && breakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {breakdown.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: item.color }}></span>
                                {item.label}
                            </span>
                            <span className="font-medium text-slate-700">{item.value}</span>
                        </div>
                    ))}
                </div>
            )}
            
            {action && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                    {action}
                </div>
            )}
         </CardContent>
      </Card>
   )
}

function CreditCardIcon(props: any) {
   return (
      <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
   )
}

function CarIcon(props: any) {
   return (
      <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
   )
}