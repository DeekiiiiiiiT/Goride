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
  Loader2,
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
import { classifyTollTransaction } from '../../utils/tollTransactionUtils';
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
import { TransactionLedgerView } from './TransactionLedgerView';
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

const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  GoRide: '#6366f1',
  Bolt: '#22c55e',
  Lyft: '#ec4899',
  Private: '#f59e0b',
  Cash: '#84cc16',
  Other: '#64748b'
};

const getPlatformColor = (platform: string) => PLATFORM_COLORS[platform] || PLATFORM_COLORS['Other'];

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
  const [ledgerView, setLedgerView] = useState<'tolls' | 'payments' | 'fuel'>('tolls');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Phase 1: Date Range & Data Context Filtering
  const { minDate, maxDate, tripIds } = useMemo(() => {
      if (!trips || trips.length === 0) return { minDate: null, maxDate: null, tripIds: new Set<string>() };
      
      const timestamps = trips.map(t => new Date(t.date).getTime());
      const ids = new Set(trips.map(t => t.id));
      
      return {
          minDate: new Date(Math.min(...timestamps)),
          maxDate: new Date(Math.max(...timestamps)),
          tripIds: ids
      };
  }, [trips]);

  const dateFilteredTransactions = useMemo(() => {
      // If no trips loaded, we can't determine context. showing nothing is safer than showing lifetime.
      if (!minDate || !maxDate) return [];

      const start = startOfDay(minDate);
      const end = endOfDay(maxDate);
      
      // Phase 1: Smart Date Buffering for Orphans
      // Allow orphans to appear if they are within 48 hours of the trip window.
      // This catches late-posting tolls that aren't yet linked to a trip.
      const bufferMs = 48 * 60 * 60 * 1000; 
      const bufferedStart = new Date(start.getTime() - bufferMs);
      const bufferedEnd = new Date(end.getTime() + bufferMs);

      return transactions.filter(tx => {
          // 1. If explicitly linked to a visible trip, always include
          // This keeps trip-linked items strictly bound to the trip's visibility
          if (tx.tripId && tripIds.has(tx.tripId)) return true;

          // 2. If Orphan (No tripId OR Trip not in view), check BUFFERED date range
          const txDate = new Date(tx.date);
          return txDate >= bufferedStart && txDate <= bufferedEnd;
      });
  }, [transactions, minDate, maxDate, tripIds]);

  // Phase 3: Filtered Cash Tolls (Expenses & Adjustments)
  // Phase 2 Update: Data Segregation (Hidden vs Active)
  const cashTollTransactions = useMemo(() => {
      // Create a Lookup Map for Claims (Source -> Claim)
      const claimMap = new Map<string, any>();
      claims.forEach(c => {
          if (c.transactionId) {
              claimMap.set(c.transactionId, c);
          }
          // Also map resolution transaction IDs back to the claim
          if (c.resolutionTransactionId) {
              claimMap.set(c.resolutionTransactionId, c);
          }
      });

      const processed = dateFilteredTransactions.map(t => {
            // Find linked claim
            const claim = claimMap.get(t.id);
            
            // Classify
            const classification = classifyTollTransaction(t, claim);
            
            // Attach metadata for the UI
            return {
                ...t,
                _classification: classification,
                _claimId: claim?.id
            };
        });

      // Split into Active (Valid Financials) and Hidden (Ignored/Pending)
      const active: FinancialTransaction[] = [];
      const hidden: FinancialTransaction[] = [];

      processed.forEach(t => {
          const c = t._classification;
          if (c === 'Ignored' || c === 'Pending_Dispute') {
              // Phase 1: Filter Hidden items to only show relevant Toll activity
              // Prevent Fuel, Cash Collections, etc. from appearing in "Hidden/Ignored"
              const category = (t.category || '').toLowerCase();
              const desc = (t.description || '').toLowerCase();

              const isBlacklisted = 
                  category === 'cash collection' || 
                  category === 'float issue' || 
                  category.includes('fuel') || 
                  category === 'payment' ||
                  t.paymentMethod === 'Tag Balance';

              const isTollRelated = 
                  category.includes('toll') || 
                  desc.includes('toll') || 
                  ['adjustment', 'claim', 'chargeback'].includes(category);

              // Only show if it's explicitly toll-related AND not blacklisted
              // OR if it's a Pending Dispute (which we always want to track)
              if ((isTollRelated && !isBlacklisted) || c === 'Pending_Dispute') {
                  hidden.push(t);
              }
          } else {
              active.push(t);
          }
      });

      return { active, hidden };
  }, [dateFilteredTransactions, claims]);

  // Phase 4: Payment Transactions
  const paymentTransactions = useMemo(() => dateFilteredTransactions.filter(t => {
      // Strict Safety: Never show Tag Balance operations in Payment Log
      if (t.paymentMethod === 'Tag Balance') return false;
      if (t.description?.toLowerCase().includes('top-up')) return false;

      // Exclude tolls just in case
      const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
      if (isToll) return false;

      // Exclude fuel from payment log (it has its own tab)
      const isFuel = (t.category || '').toLowerCase().includes('fuel') || (t.description || '').toLowerCase().includes('fuel');
      if (isFuel) return false;

      // Strict Payment Logic: Focus on Cash Collections (Money from Driver)
      const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';
      return isPayment && t.amount > 0;
  }), [transactions]);

  const fuelTransactions = useMemo(() => dateFilteredTransactions.filter(t => {
      const cat = (t.category || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const type = (t.type || '').toLowerCase();
      const isAutomated = t.metadata?.automated === true;
      
      // Phase 3: Financial Settlement Logic
      // We only show items that have a direct financial impact and are part of the settlement flow.
      // Raw "Fuel" logs (receipts) are operational noise unless they are being credited/debited.
      // We prioritize "Fuel Reimbursement" and "Automated Settlements".
      const isFuelReimbursement = cat === 'fuel reimbursement' || type === 'reimbursement';
      const isFuelSettlement = desc.includes('settlement') || isAutomated;
      const isFuelExpense = cat === 'fuel' || desc.includes('fuel expense');

      // If it's an automated settlement, it's always included
      if (isAutomated || isFuelSettlement || isFuelReimbursement) return true;

      // For raw fuel expenses, only show if they are NOT redundant with a settlement
      // In practice, if the user wants "only settled and split", we filter out the raw logs
      // but keep them if they are the ONLY record (not yet settled).
      // However, to keep the ledger clean as requested:
      return isFuelReimbursement || (isFuelExpense && isAutomated);
  }), [dateFilteredTransactions]);

  // Calculate Toll Stats for new Metric Card
  const { disputeCharges, netTollReimbursement } = useMemo(() => {
      let disputes = 0;
      let net = 0;

      // Use ACTIVE transactions for financial calculations
      cashTollTransactions.active.forEach(t => {
          const classification = t._classification;
          const amount = Math.abs(t.amount);

          if (classification === 'Resolved_Debit') {
              // This is a Charge to the driver (Reduce Reimbursement)
              net -= amount;
              // We might track "disputes" as these charges? 
              // The original logic tracked "Unresolved Debits" as disputes.
              // But we are now Filtering OUT unresolved debits (Pending_Dispute).
              // So 'disputes' metric might be redundant or should represent "Charged Back".
              disputes += amount; 
          } else if (classification === 'Standard_Credit' || classification === 'Resolved_Credit') {
              // This is a Reimbursement (Increase Net)
              net += amount;
          }
      });

      return { disputeCharges: disputes, netTollReimbursement: net };
  }, [cashTollTransactions]);

  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCashOnly, setFilterCashOnly] = useState<boolean>(false);
  // Phase 3: Hidden Items UI State
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set()); // Phase 2: Debouncing/Locking
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
  const refreshData = React.useCallback(async () => {
      try {
          // Collect all relevant driver IDs to query
          const driverIds = [
              driverId,
              driver?.uberDriverId,
              driver?.inDriveDriverId
          ].filter(Boolean) as string[];

          const [driverTx, allClaims] = await Promise.all([
              api.getTransactions(driverIds),
              api.getClaims() // Fetch ALL claims to ensure we find links even if driverId filter is tricky
          ]);

          // Server-side filtering is now enabled for getTransactions(driverIds)
          setTransactions(Array.isArray(driverTx) ? driverTx : []);
          
          // Filter claims locally if needed, or just use all for linking (safer)
          setClaims(Array.isArray(allClaims) ? allClaims : []);
      } catch (e) {
          console.error("Failed to load data", e);
          // Ensure we don't crash if API fails
          // But don't clear data if it's just a refresh failure
          if (transactions.length === 0) setTransactions([]);
          if (claims.length === 0) setClaims([]);
      }
  }, [driverId, driver, transactions.length, claims.length]);

  React.useEffect(() => {
      refreshData();
  }, [refreshData]);

  // Grouped Transactions Logic (Trip-Centric)
  const groupedTollTransactions = useMemo(() => {
      // 0. Pre-process Claims to link Children -> Parents
      const childToParentMap = new Map<string, string>();
      claims.forEach(c => {
          if (c.transactionId && c.resolutionTransactionId) {
              childToParentMap.set(c.resolutionTransactionId, c.transactionId);
          }
      });

      // Use ACTIVE transactions for the main view
      const activeTransactions = cashTollTransactions.active;

      // Map for quick transaction lookup (needed to find parent's tripId)
      const txMap = new Map(activeTransactions.map(t => [t.id, t]));

      // 1. Index Transactions by TripId
      const txByTrip = new Map<string, FinancialTransaction[]>();
      const orphanTx: FinancialTransaction[] = [];

      activeTransactions.forEach(tx => {
          let targetTripId = tx.tripId;

          // If no direct tripId, check if it's a child of a transaction that HAS a tripId
          if (!targetTripId && childToParentMap.has(tx.id)) {
              const parentId = childToParentMap.get(tx.id);
              const parentTx = parentId ? txMap.get(parentId) : undefined;
              if (parentTx && parentTx.tripId) {
                  targetTripId = parentTx.tripId;
              }
          }

          if (targetTripId) {
              const current = txByTrip.get(targetTripId) || [];
              current.push(tx);
              txByTrip.set(targetTripId, current);
          } else {
              orphanTx.push(tx);
          }
      });

      // 2. Build Trip Groups
      // We need to find trips that have transactions associated with them
      const tripGroups: { type: 'trip', data: Trip, children: FinancialTransaction[] }[] = [];
      const tripsWithTx = new Set<string>();

      trips.forEach(trip => {
          const children = txByTrip.get(trip.id);
          if (children && children.length > 0) {
              tripGroups.push({
                  type: 'trip',
                  data: trip,
                  children: children
              });
              tripsWithTx.add(trip.id);
          }
      });

      // 3. Handle Orphans (Transactions with tripId that wasn't found in trips list, or no tripId)
      // Note: If we fetched *all* transactions but only *some* trips (pagination?), we might miss some parents.
      // For now, any transaction whose tripId wasn't found in the `trips` array is treated as an orphan.
      activeTransactions.forEach(tx => {
          if (tx.tripId && !tripsWithTx.has(tx.tripId)) {
              // This is a transaction with a tripId, but the trip isn't loaded in the current view.
              // We treat it as an orphan for now.
              orphanTx.push(tx);
          }
      });
      
      // Remove duplicates from orphanTx (since we might have pushed them twice in the logic above if not careful, 
      // but the logic above is: 
      // Loop 1: pushed if NO tripId. 
      // Loop 2: pushed if HAS tripId but trip not found. 
      // So no overlap. logic is safe.)

      // 4. Combine and Sort
      const unifiedList = [
          ...tripGroups,
          ...orphanTx.map(tx => ({ type: 'transaction' as const, data: tx }))
      ];

      const sortedList = unifiedList.sort((a, b) => {
          const dateA = new Date(a.data.date).getTime();
          const dateB = new Date(b.data.date).getTime();
          return dateB - dateA;
      });

      // Phase 4: Append Hidden Items Group
      if (showHidden && cashTollTransactions.hidden.length > 0) {
          const hiddenTrip: Trip = {
              id: 'hidden-items-group',
              driverId: driverId,
              vehicleId: 'system',
              // Place it at the very bottom (oldest date) or top? Plan says bottom.
              // We'll use a date far in the past to ensure sort puts it last, or just push it after sort.
              date: new Date(0).toISOString(), 
              status: 'Archived', 
              platform: 'System',
              amount: 0,
              distance: 0,
              duration: 0,
              startTime: '',
              endTime: '',
              route: 'Archived / Ignored Transactions',
              dropoffLocation: 'Archived / Ignored Transactions'
          };

          sortedList.push({
              type: 'trip',
              data: hiddenTrip,
              children: cashTollTransactions.hidden
          });
      }

      return sortedList;
  }, [cashTollTransactions, trips, showHidden, driverId]);

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

  const handleFixTransactionFormat = async (tx: FinancialTransaction) => {
      const toastId = toast.loading("Fixing transaction format...");
      try {
          const updatedTx: FinancialTransaction = {
              ...tx,
              category: 'Adjustment', // Fix Category
              type: 'Adjustment', // Ensure Type is Adjustment for consistency
              amount: -Math.abs(tx.amount), // Ensure it is Negative (Debit)
              metadata: {
                  ...tx.metadata,
                  fixedFormat: true,
                  originalId: tx.id,
                  fixReason: 'Format Error'
              }
          };

          await api.saveTransaction(updatedTx);
          
          // Update local state
          setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));
          
          toast.dismiss(toastId);
          toast.success("Transaction fixed");
      } catch (e) {
          console.error("Fix Transaction Error:", e);
          toast.dismiss(toastId);
          toast.error("Failed to fix transaction");
      }
  };

  const handleRetryCharge = async (tx: any) => {
      // Debug/Validation
      if (!tx._claimId) {
          toast.error("Error: Missing Claim ID. Cannot retry.");
          return;
      }

      // Debounce Check
      if (processingIds.has(tx._claimId)) {
          return;
      }

      setProcessingIds(prev => new Set(prev).add(tx._claimId));
      
      const toastId = toast.loading("Processing charge retry...");
      
      try {
          // Find the claim
          const claim = claims.find(c => c.id === tx._claimId);
          
          if (!claim) {
              toast.dismiss(toastId);
              toast.error("Claim record not found locally. Please refresh.");
              return;
          }

          // 1. Create the missing transaction MANUALLY
          // Since the backend is just a storage layer, we must construct the transaction here.
          // CRITICAL: We use 'Adjustment' category so it appears as a DEBIT (Charge) in the ledger.
          // Using 'Toll' would make it appear as a Credit (Reimbursement).
          const newTransaction: Partial<FinancialTransaction> = {
              driverId: driverId,
              amount: -Math.abs(claim.amount), // Ensure it's a debit (negative)
              date: claim.date || new Date().toISOString(),
              time: claim.time || new Date().toLocaleTimeString(),
              description: claim.description || "Toll Charge (Recovery)",
              category: 'Adjustment', 
              type: 'Adjustment', // Consistent with Fix Format logic
              status: 'Completed',
              tripId: claim.tripId, // CRITICAL: Link to trip
              metadata: {
                  source: 'retry_charge',
                  claimId: claim.id,
                  originalCategory: claim.category
              }
          };

          // 2. Save the transaction
          // api.saveTransaction returns the transaction object directly (it unwraps result.data)
          const savedTx = await api.saveTransaction(newTransaction);
          
          if (!savedTx || !savedTx.id) {
              throw new Error("Failed to receive transaction ID from server");
          }
          
          const newTxId = savedTx.id;

          // 3. Update the claim to link to this new transaction
          const updatedClaim = {
              ...claim,
              status: 'Resolved',
              resolutionReason: 'Charge Driver',
              resolutionTransactionId: newTxId,
              updatedAt: new Date().toISOString()
          };

          // 4. Save the updated claim
          await api.saveClaim(updatedClaim);
          
          toast.dismiss(toastId);
          toast.success("Charge retry processed successfully");
          
          // 5. Refresh data to see the new transaction
          await refreshData();
      } catch (e) {
          console.error("Retry Charge Error:", e);
          toast.dismiss(toastId);
          toast.error("Failed to retry charge. See console for details.");
      } finally {
          setProcessingIds(prev => {
              const next = new Set(prev);
              next.delete(tx._claimId);
              return next;
          });
      }
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
     const platformStats: Record<string, any> = {
        Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        GoRide: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        Bolt: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 }
     };

     // Chart Data Map
     const chartDataMap = new Map<string, Record<string, number>>();
     
     try {
         const days = eachDayOfInterval({ start, end });
         days.forEach(d => {
             const initialDayStats: Record<string, number> = {};
             Object.keys(platformStats).forEach(k => initialDayStats[k] = 0);
             chartDataMap.set(format(d, 'yyyy-MM-dd'), initialDayStats);
         });
     } catch (e) { }

     // --- Phase 3: Ratio-Reconstruction Algorithm ---
     // We no longer need to calculate "Report Duration" because we use the Efficiency Ratio method.
     // This ignores mismatched file dates and focuses on the Driver's Performance Profile.

     trips.forEach(trip => {
        const tripDateObj = new Date(trip.date);
        if (isNaN(tripDateObj.getTime())) return;
        
        // FIX: Determine effective cash (handling GoRide/Private legacy/missing data)
        const platformName = (trip.platform || 'Other').toLowerCase();
        const isCashPlatform = ['goride', 'private', 'cash'].includes(platformName);
        const rawCash = Number(trip.cashCollected || 0);
        const effectiveCash = (Math.abs(rawCash) > 0)
           ? rawCash
           : (isCashPlatform ? trip.amount : 0);

        // Lifetime stats
        totalEarnings += trip.amount;
        lifetimeTrips += 1;
        if (effectiveCash) totalCashCollected += Math.abs(effectiveCash);
        // Only count tolls as debt if they weren't collected in cash (assuming cash collected includes toll reimbursement)
        // If it's a card trip (no cash collected), the driver received the toll refund in their payout, so they owe it back.
        if (trip.tollCharges && !effectiveCash) {
            lifetimeTolls += trip.tollCharges;
        }

        // Filter Check
        if (isWithinInterval(startOfDay(tripDateObj), { start, end })) {
            periodEarnings += trip.amount;
            
            const platform = trip.platform || 'Other';
            if (!platformStats[platform]) {
                platformStats[platform] = { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 };
            }
            const pStats = platformStats[platform];

            // Platform Stats
            pStats.earnings += trip.amount;
            pStats.trips += 1;
            
            if (trip.status === 'Completed') {
                periodCompletedTrips++;
                pStats.completed++;
            }
            if (trip.status === 'Cancelled') periodCancelledTrips++;
            if (effectiveCash) {
                const amount = Math.abs(effectiveCash);
                cashCollected += amount;
                pStats.cashCollected = (pStats.cashCollected || 0) + amount;
            }
            
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
        if (isWithinInterval(startOfDay(tripDateObj), { start: prevStart, end: prevEnd })) {
            prevPeriodEarnings += trip.amount;
        }
     });

     // Prepare Charts Data
     const weeklyEarningsData = Array.from(chartDataMap.entries()).map(([date, amounts]) => {
         const d = new Date(date);
         return {
             day: format(d, 'MMM d'),
             fullDate: date,
             ...amounts
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
         let tripDateObj: Date;
         if (typeof trip.date === 'string') {
            if (trip.date.includes('T')) {
                tripDateObj = new Date(trip.date);
            } else if (trip.date.includes('/')) {
                const parts = trip.date.split('/');
                if (parts.length === 3) {
                    const p1 = parseInt(parts[0]);
                    const p2 = parseInt(parts[1]);
                    const p3 = parseInt(parts[2]);
                    if (p1 > 12) {
                        tripDateObj = new Date(p3, p2 - 1, p1);
                    } else {
                        tripDateObj = new Date(p3, p1 - 1, p2);
                    }
                } else {
                    tripDateObj = new Date(trip.date);
                }
            } else if (trip.date.includes('-') && trip.date.length === 10) {
                const [y, m, d] = trip.date.split('-').map(Number);
                tripDateObj = new Date(y, m - 1, d);
            } else {
                tripDateObj = new Date(trip.date);
            }
         } else {
            tripDateObj = new Date(trip.date);
         }
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
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.earnings > 0 || stats.completed > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `$${stats.earnings.toFixed(2)}`,
                           color: getPlatformColor(label)
                       }))}
               />
               <MetricCard 
                  title="Cash Collected" 
                  value={`$${metrics.cashCollected.toFixed(2)}`} 
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  tooltip="Total cash collected from trips during this period"
                  breakdown={[
                      ...Object.entries(metrics.platformStats)
                          .filter(([_, stats]: [string, any]) => stats.cashCollected > 0)
                          .map(([label, stats]: [string, any]) => ({
                              label: label, 
                              value: `$${stats.cashCollected.toFixed(2)}`, 
                              color: '#f43f5e' 
                          }))
                  ]}
               />
               <MetricCard 
                  title="Km Driven for Period" 
                  value={`${metrics.totalDistance.toFixed(1)} km`} 
                  icon={<Navigation className="h-4 w-4 text-slate-500" />}
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.distance > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `${stats.distance.toFixed(1)} km`,
                           color: getPlatformColor(label)
                       }))}
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
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.tolls > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `$${stats.tolls.toFixed(2)}`,
                           color: getPlatformColor(label)
                       }))}
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
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

                 {/* Card 2: Net Toll Reimbursement (New) */}
                 <Card className="bg-white">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Net Toll Reimbursement</CardTitle>
                         <TrendingUp className="h-4 w-4 text-emerald-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-emerald-600">
                             ${netTollReimbursement.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Includes <span className="text-red-600 font-medium">-${disputeCharges.toFixed(2)}</span> in disputes
                         </p>
                     </CardContent>
                 </Card>

                 {/* Card 3: Float Held */}
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
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'fuel' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('fuel')}
                                        >
                                            Fuel Activity
                                        </button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {ledgerView === 'tolls' ? (
                                    <div className="space-y-4">
                                        {/* Phase 3: Hidden Items Filter Bar */}
                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id="show-hidden" 
                                                        checked={showHidden} 
                                                        onCheckedChange={(checked) => setShowHidden(checked as boolean)} 
                                                    />
                                                    <Label 
                                                        htmlFor="show-hidden" 
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        Show Hidden / Ignored
                                                        {cashTollTransactions.hidden.length > 0 && (
                                                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-200 text-slate-600 hover:bg-slate-300">
                                                                {cashTollTransactions.hidden.length}
                                                            </Badge>
                                                        )}
                                                    </Label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-slate-200 overflow-x-auto">
                                            <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[110px]">Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[90px]">Status</TableHead>
                                                    <TableHead className="text-right text-red-700 w-[90px]">Debit</TableHead>
                                                    <TableHead className="text-right text-emerald-700 w-[90px]">Credit</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {groupedTollTransactions.length > 0 ? (
                                                    groupedTollTransactions.map((item) => {
                                                        if (item.type === 'trip') {
                                                            // TRIP ROW (Parent)
                                                            const trip = item.data as Trip;
                                                            const children = item.children;
                                                            const hasChildren = children.length > 0;
                                                            const isExpanded = expandedRows.has(trip.id);

                                                            // Calculate total toll credit from children (Phase 2)
                                                            const totalTollCredit = children
                                                                .filter(child => {
                                                                    const c = (child as any)._classification;
                                                                    return c === 'Standard_Credit' || c === 'Resolved_Credit';
                                                                })
                                                                .reduce((sum, child) => sum + Math.abs(child.amount), 0);

                                                            const totalTollDebit = children
                                                                .filter(child => (child as any)._classification === 'Resolved_Debit')
                                                                .reduce((sum, child) => sum + Math.abs(child.amount), 0);

                                                            return (
                                                                <React.Fragment key={trip.id}>
                                                                    <TableRow 
                                                                        className={cn("transition-colors bg-slate-50 border-b border-slate-200", hasChildren && "cursor-pointer hover:bg-slate-100")}
                                                                        onClick={() => hasChildren && toggleRow(trip.id)}
                                                                    >
                                                                        <TableCell className="font-medium text-slate-600">
                                                                            <div className="flex items-center gap-2">
                                                                                {hasChildren && (
                                                                                    <div className="text-slate-400">
                                                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                    </div>
                                                                                )}
                                                                                {format(new Date(trip.date), 'MMM d, yyyy')}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-col max-w-[250px]">
                                                                                <TooltipProvider>
                                                                                    <UiTooltip>
                                                                                        <TooltipTrigger asChild>
                                                                                            <span className="font-medium text-slate-900 truncate">
                                                                                                Trip: {trip.route || trip.dropoffLocation || "Unknown Route"}
                                                                                            </span>
                                                                                        </TooltipTrigger>
                                                                                        <TooltipContent>
                                                                                            <p>Trip: {trip.route || trip.dropoffLocation || "Unknown Route"}</p>
                                                                                        </TooltipContent>
                                                                                    </UiTooltip>
                                                                                </TooltipProvider>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 border-slate-300 text-slate-500">
                                                                                        {trip.platform}
                                                                                    </Badge>
                                                                                    <span className="text-xs text-slate-400 font-mono">
                                                                                        {format(new Date(trip.date), 'HH:mm')}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Badge variant="secondary" className={cn(
                                                                                "hover:bg-opacity-80",
                                                                                trip.status === 'Completed' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                                                                            )}>
                                                                                {trip.status}
                                                                            </Badge>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            {totalTollDebit > 0 ? (
                                                                                <span className="text-red-600 font-bold">-${totalTollDebit.toFixed(2)}</span>
                                                                            ) : (
                                                                                <span className="text-slate-300">-</span>
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            {totalTollCredit > 0 ? (
                                                                                <span className="text-emerald-600 font-bold">+${totalTollCredit.toFixed(2)}</span>
                                                                            ) : (
                                                                                <span className="text-slate-300">-</span>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>

                                                                    {/* CHILD ROWS (Transactions nested under Trip) */}
                                                                    {hasChildren && isExpanded && children.map(child => {
                                                                        const classification = (child as any)._classification;
                                                                        const isResolvedDebit = classification === 'Resolved_Debit';
                                                                        const isStandardCredit = classification === 'Standard_Credit';
                                                                        const isResolvedCredit = classification === 'Resolved_Credit';
                                                                        const isCredit = isStandardCredit || isResolvedCredit;
                                                                        
                                                                        // Phase 5: Hidden/Archived Logic
                                                                        const isHidden = child.status === 'Ignored' || trip.status === 'Archived';
                                                                         
                                                                         return (
                                                                            <TableRow 
                                                                                key={child.id} 
                                                                                className={cn(
                                                                                    "bg-white hover:bg-slate-50 border-l-4 border-l-slate-200",
                                                                                    isHidden && "opacity-60 bg-slate-50 border-l-slate-300"
                                                                                )}
                                                                            >
                                                                                <TableCell className="pl-12 relative">
                                                                                    {/* Indentation Visuals */}
                                                                                    <div className="absolute left-6 top-0 bottom-1/2 w-px bg-slate-200"></div>
                                                                                    <div className="absolute left-6 top-1/2 w-4 h-px bg-slate-200"></div>
                                                                                    <span className="text-slate-500 text-xs font-mono">
                                                                                        {child.time || format(new Date(child.date), 'HH:mm')}
                                                                                    </span>
                                                                                </TableCell>
                                                                                <TableCell>
                                                                                    <div className="flex items-center gap-2 max-w-[250px]">
                                                                                        {child.receiptUrl ? (
                                                                                            <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                                                                                        ) : (
                                                                                            <CornerDownRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                                        )}
                                                                                        <TooltipProvider>
                                                                                            <UiTooltip>
                                                                                                <TooltipTrigger asChild>
                                                                                                    <span className={cn("text-sm truncate text-slate-700", isHidden && "line-through text-slate-500")}>
                                                                                                        {child.description}
                                                                                                    </span>
                                                                                                </TooltipTrigger>
                                                                                                <TooltipContent>
                                                                                                    <p>{child.description}</p>
                                                                                                </TooltipContent>
                                                                                            </UiTooltip>
                                                                                        </TooltipProvider>
                                                                                    </div>
                                                                                </TableCell>
                                                                                <TableCell>
                                                                                    {isHidden ? (
                                                                                        <TooltipProvider>
                                                                                            <UiTooltip>
                                                                                                <TooltipTrigger asChild>
                                                                                                    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200 cursor-help">
                                                                                                        {child.status}
                                                                                                    </Badge>
                                                                                                </TooltipTrigger>
                                                                                                <TooltipContent>
                                                                                                    <p>Excluded from calculations (Outside date range or manually ignored).</p>
                                                                                                </TooltipContent>
                                                                                            </UiTooltip>
                                                                                        </TooltipProvider>
                                                                                    ) : (
                                                                                        /* Check for "Zombie" Retry - Needs Fix */
                                                                                        child.metadata?.source === 'retry_charge' && child.category !== 'Adjustment' ? (
                                                                                         <div className="flex items-center gap-2">
                                                                                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                                                Format Error
                                                                                            </Badge>
                                                                                            <button 
                                                                                                type="button"
                                                                                                className="h-6 px-2 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm transition-all cursor-pointer relative z-50 flex items-center active:scale-95"
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    handleFixTransactionFormat(child);
                                                                                                }}
                                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                                            >
                                                                                                Fix Format
                                                                                            </button>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="icon"
                                                                                                className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    handleDeleteTransaction(child.id);
                                                                                                }}
                                                                                                title="Delete Duplicate"
                                                                                            >
                                                                                                <Trash2 className="h-3 w-3" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="flex items-center gap-2">
                                                                                            {isResolvedDebit && (
                                                                                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                                                                    Resolved Charge
                                                                                                </Badge>
                                                                                            )}
                                                                                            {isResolvedCredit && (
                                                                                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                                                    Reimbursed
                                                                                                </Badge>
                                                                                            )}
                                                                                            {isStandardCredit && (
                                                                                                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                                                                                                    Verified
                                                                                                </Badge>
                                                                                            )}
                                                                                            
                                                                                            {(child.category === 'Adjustment' || child.metadata?.source === 'retry_charge') && (
                                                                                                // Only allow deletion of manual Adjustments or Retries
                                                                                                // This prevents accidental deletion of automated Trip transactions
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                                    onClick={(e) => {
                                                                                                        e.preventDefault();
                                                                                                        e.stopPropagation();
                                                                                                        handleDeleteTransaction(child.id);
                                                                                                    }}
                                                                                                    title="Delete Transaction"
                                                                                                >
                                                                                                    <Trash2 className="h-3 w-3" />
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </TableCell>
                                                                                <TableCell className="text-right font-mono">
                                                                                    {!isCredit ? (
                                                                                         <span className="text-red-600 font-medium">-${Math.abs(child.amount).toFixed(2)}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-right font-mono">
                                                                                    {isCredit ? (
                                                                                        <span className="text-emerald-600 font-medium">+${Math.abs(child.amount).toFixed(2)}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                         );
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        } else {
                                                            // ORPHAN TRANSACTION ROW (Standard Format)
                                                            const tx = item.data as FinancialTransaction;
                                                            const classification = (tx as any)._classification;
                                                            const isResolvedDebit = classification === 'Resolved_Debit';
                                                            const isStandardCredit = classification === 'Standard_Credit';
                                                            const isResolvedCredit = classification === 'Resolved_Credit';
                                                            const isCredit = isStandardCredit || isResolvedCredit;

                                                            return (
                                                                <TableRow key={tx.id} className="hover:bg-slate-50">
                                                                    <TableCell className="font-medium text-slate-600">
                                                                        {format(new Date(tx.date), 'MMM d, yyyy')}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="flex flex-col max-w-[250px]">
                                                                            <TooltipProvider>
                                                                                <UiTooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <span className="font-medium truncate text-slate-900">
                                                                                            {tx.description}
                                                                                        </span>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent>
                                                                                        <p>{tx.description}</p>
                                                                                    </TooltipContent>
                                                                                </UiTooltip>
                                                                            </TooltipProvider>
                                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                                <TooltipProvider>
                                                                                    <UiTooltip>
                                                                                        <TooltipTrigger asChild>
                                                                                            <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 bg-amber-100 text-amber-700 cursor-help">
                                                                                                Unlinked
                                                                                            </Badge>
                                                                                        </TooltipTrigger>
                                                                                        <TooltipContent>
                                                                                            <p>This transaction is not associated with a specific trip.</p>
                                                                                        </TooltipContent>
                                                                                    </UiTooltip>
                                                                                </TooltipProvider>
                                                                                {tx.receiptUrl && (
                                                                                    <a 
                                                                                        href={tx.receiptUrl} 
                                                                                        target="_blank" 
                                                                                        rel="noreferrer" 
                                                                                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <FileText className="h-3 w-3" />
                                                                                        View
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        {/* Check for "Zombie" Retry - Needs Fix */}
                                                                        {tx.metadata?.source === 'retry_charge' && tx.category !== 'Adjustment' ? (
                                                                             <div className="flex items-center gap-2">
                                                                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                                    Format Error
                                                                                </Badge>
                                                                                <button 
                                                                                    type="button"
                                                                                    className="h-6 px-2 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm transition-all cursor-pointer relative z-50 flex items-center active:scale-95"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleFixTransactionFormat(tx);
                                                                                    }}
                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                >
                                                                                    Fix Format
                                                                                </button>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleDeleteTransaction(tx.id);
                                                                                    }}
                                                                                    title="Delete Duplicate"
                                                                                >
                                                                                    <Trash2 className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-2">
                                                                                {isResolvedDebit && (
                                                                                    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                                                        Resolved Charge
                                                                                    </Badge>
                                                                                )}
                                                                                {isResolvedCredit && (
                                                                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                                        Reimbursed
                                                                                    </Badge>
                                                                                )}
                                                                                {isStandardCredit && (
                                                                                    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                                                                                        Verified
                                                                                    </Badge>
                                                                                )}

                                                                                {(tx.category === 'Adjustment' || tx.metadata?.source === 'retry_charge') && (
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            handleDeleteTransaction(tx.id);
                                                                                        }}
                                                                                        title="Delete Transaction"
                                                                                    >
                                                                                        <Trash2 className="h-3 w-3" />
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {!isCredit ? (
                                                                             <span className="text-red-600 font-medium">-${Math.abs(tx.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {isCredit ? (
                                                                            <span className="text-emerald-600 font-medium">+${Math.abs(tx.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        }
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
                                ) : ledgerView === 'payments' ? (
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
                                                    <TableHead className="w-[110px]">Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[120px]">Method</TableHead>
                                                    <TableHead className="w-[90px]">Status</TableHead>
                                                    <TableHead className="text-right w-[90px]">Amount</TableHead>
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
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-slate-500">History of fuel settlements and automated credits.</p>
                                        </div>
                                        <TransactionLedgerView 
                                            transactions={fuelTransactions}
                                        />
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
                                        (t.platform && ['indrive', 'bolt', 'goride', 'private', 'cash'].includes(t.platform.toLowerCase())) ||
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
                                        (trip.platform && ['indrive', 'bolt', 'goride', 'private', 'cash'].includes(trip.platform.toLowerCase()) ? `$${(trip.amount ?? 0).toFixed(2)}` : '-')}
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
                            : (selectedTrip.platform && ['indrive', 'bolt', 'goride', 'private', 'cash'].includes(selectedTrip.platform.toLowerCase()) 
                                ? `$${(selectedTrip.amount ?? 0).toFixed(2)}` 
                                : '-')}
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