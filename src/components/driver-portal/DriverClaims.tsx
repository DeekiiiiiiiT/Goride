import React, { useState } from 'react';
import { useClaims } from '../../hooks/useClaims';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Copy, Check, Clock, AlertTriangle, Car, DollarSign, MapPin, Calendar, MoreVertical, XCircle, CheckCircle, Archive } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Claim } from "../../types/data";
import { useAuth } from '../auth/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function DriverClaims() {
  const { user } = useAuth();
  const { driverRecord, loading: driverLoading } = useCurrentDriver();
  
  // Fetch ALL claims, then filter locally to support legacy IDs (e.g. driverId vs id)
  const { claims: allClaims, loading: claimsLoading, updateClaim } = useClaims();
  
  const claims = React.useMemo(() => {
      if (!driverRecord) return [];
      return allClaims.filter(c => 
          c.driverId === user.id || 
          (driverRecord.id && c.driverId === driverRecord.id) || 
          (driverRecord.driverId && c.driverId === driverRecord.driverId)
      );
  }, [allClaims, driverRecord, user?.id]);
  
  const loading = driverLoading || claimsLoading;
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Message copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStatusUpdate = async (claim: Claim, newStatus: 'Submitted_to_Uber' | 'Rejected') => {
      try {
          await updateClaim({
              ...claim,
              status: newStatus,
              updatedAt: new Date().toISOString()
          });
          toast.success(newStatus === 'Submitted_to_Uber' ? "Claim marked as submitted" : "Claim marked as rejected");
      } catch (error) {
          toast.error("Failed to update status");
      }
  };

  // Filter Active vs History
  // Active: Sent_to_Driver (Action Required)
  // Pending: Submitted_to_Uber (Waiting for Uber)
  // History: Resolved, Rejected

  const activeClaims = claims.filter(c => ['Sent_to_Driver', 'Submitted_to_Uber'].includes(c.status));
  const historyClaims = claims.filter(c => ['Resolved', 'Rejected'].includes(c.status));

  // Sort history by updated date desc
  const sortedHistory = historyClaims.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt).getTime();
      return dateB - dateA;
  });

  const tollClaims = activeClaims.filter(c => c.type === 'Toll_Refund');
  const waitClaims = activeClaims.filter(c => c.type === 'Wait_Time');
  const cleanClaims = activeClaims.filter(c => c.type === 'Cleaning_Fee');

  return (
    <div className="space-y-6 p-4 md:p-6 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Claimable Loss</h1>
        <p className="text-muted-foreground">Review and submit reimbursement requests to Uber.</p>
      </div>

      <Tabs defaultValue="tolls" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tolls">Toll Refunds</TabsTrigger>
          <TabsTrigger value="wait">Wait Time</TabsTrigger>
          <TabsTrigger value="cleaning">Cleaning Fees</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="tolls" className="mt-4 space-y-4">
          {loading ? (
             <div className="text-center py-10">Loading claims...</div>
          ) : tollClaims.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
                No active toll refund claims.
             </div>
          ) : (
             tollClaims.map(claim => (
                <ClaimCard 
                    key={claim.id} 
                    claim={claim} 
                    onCopy={handleCopy} 
                    copiedId={copiedId} 
                    onUpdateStatus={handleStatusUpdate}
                />
             ))
          )}
        </TabsContent>

        <TabsContent value="wait" className="mt-4">
           <div className="text-center py-10 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
              No wait time disputes found.
           </div>
        </TabsContent>

        <TabsContent value="cleaning" className="mt-4">
           <div className="text-center py-10 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
              No cleaning fee requests found.
           </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
           {loading ? (
               <div className="text-center py-10">Loading history...</div>
           ) : sortedHistory.length === 0 ? (
               <div className="text-center py-10 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
                   No past claims found.
               </div>
           ) : (
               sortedHistory.map(claim => (
                   <ClaimCard 
                       key={claim.id} 
                       claim={claim} 
                       onCopy={handleCopy} 
                       copiedId={copiedId} 
                       onUpdateStatus={handleStatusUpdate}
                       readonly
                   />
               ))
           )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ClaimCardProps {
    claim: Claim;
    onCopy: (t: string, id: string) => void;
    copiedId: string | null;
    onUpdateStatus: (claim: Claim, status: 'Submitted_to_Uber' | 'Rejected') => Promise<void>;
    readonly?: boolean;
}

function ClaimCard({ claim, onCopy, copiedId, onUpdateStatus, readonly = false }: ClaimCardProps) {
    const isCopied = copiedId === claim.id;
    const [isUpdating, setIsUpdating] = useState(false);

    const handleAction = async (status: 'Submitted_to_Uber' | 'Rejected') => {
        setIsUpdating(true);
        await onUpdateStatus(claim, status);
        setIsUpdating(false);
    };

    const isSubmitted = claim.status === 'Submitted_to_Uber';
    const isResolved = claim.status === 'Resolved';
    const isRejected = claim.status === 'Rejected';

    // Determine resolution configuration if resolved
    let resolutionConfig = {
        label: 'Resolved',
        message: 'This claim has been verified and resolved. The refund should appear in your next statement.',
        badgeClass: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
        borderClass: 'border-l-emerald-500 opacity-75 bg-slate-50',
        messageClass: 'bg-emerald-50 text-emerald-700'
    };

    if (isResolved && claim.resolutionReason) {
        if (claim.resolutionReason === 'Charge Driver') {
             resolutionConfig = {
                label: 'Charged to Driver',
                message: 'This toll was not refunded and has been charged to you.',
                badgeClass: 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200',
                borderClass: 'border-l-red-500 opacity-75 bg-slate-50',
                messageClass: 'bg-red-50 text-red-700'
            };
        } else if (claim.resolutionReason === 'Write Off') {
            resolutionConfig = {
                label: 'Written Off',
                message: 'This toll was written off by the business.',
                badgeClass: 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200',
                borderClass: 'border-l-blue-500 opacity-75 bg-slate-50',
                messageClass: 'bg-blue-50 text-blue-700'
            };
        }
    }

    // Determine card style based on status
    let borderClass = 'border-l-orange-500';
    if (isSubmitted) borderClass = 'border-l-blue-500 opacity-90';
    if (isResolved) borderClass = resolutionConfig.borderClass;
    if (isRejected) borderClass = 'border-l-red-300 opacity-75 bg-slate-50';

    const showActions = !readonly && !isSubmitted && !isResolved && !isRejected;

    return (
        <Card className={`overflow-hidden border-l-4 ${borderClass}`}>
            <CardHeader className="pb-3 bg-slate-50/50">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {isSubmitted && (
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
                                    <Clock className="w-3 h-3 mr-1" /> Pending Uber
                                </Badge>
                            )}
                            {isResolved && (
                                <Badge className={resolutionConfig.badgeClass}>
                                    <CheckCircle className="w-3 h-3 mr-1" /> {resolutionConfig.label}
                                </Badge>
                            )}
                            {isRejected && (
                                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                                    <XCircle className="w-3 h-3 mr-1" /> Rejected
                                </Badge>
                            )}
                            {!isSubmitted && !isResolved && !isRejected && (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                    Action Required
                                </Badge>
                            )}
                            <span className="text-xs text-slate-500">
                                Missing: ${claim.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <CardTitle className="text-base font-medium">
                            {claim.subject}
                        </CardTitle>
                    </div>
                    
                    {showActions && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleAction('Rejected')} className="text-red-600 focus:text-red-600">
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Mark as Rejected
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span>{claim.tripDate ? new Date(claim.tripDate).toLocaleDateString() : 'Unknown Date'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span>{claim.tripDate ? new Date(claim.tripDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown Time'}</span>
                    </div>
                    {claim.pickup && (
                        <div className="col-span-2 flex items-center gap-2 text-slate-600 truncate">
                            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="truncate">{claim.pickup}</span>
                        </div>
                    )}
                </div>

                {showActions && (
                    <div className="bg-slate-100 p-3 rounded-md font-mono text-xs text-slate-600 break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {claim.message}
                    </div>
                )}
                
                {isSubmitted && (
                    <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-700 flex items-start gap-2">
                        <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>You have marked this as submitted. The fleet manager will verify when the refund appears on your statement.</p>
                    </div>
                )}
                {isResolved && (
                    <div className={`${resolutionConfig.messageClass} p-3 rounded-md text-xs flex items-start gap-2`}>
                        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>{resolutionConfig.message}</p>
                    </div>
                )}
                {isRejected && (
                    <div className="bg-red-50 p-3 rounded-md text-xs text-red-700 flex items-start gap-2">
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>This claim was rejected and marked as closed.</p>
                    </div>
                )}
            </CardContent>
            
            {showActions && (
                <CardFooter className="bg-slate-50 py-3 flex flex-col gap-2">
                    <div className="flex w-full gap-2">
                         <Button variant="outline" size="sm" className="flex-1 text-slate-600" onClick={() => window.open('https://help.uber.com/driving-and-delivering/article/please-select-a-trip?nodeId=aa8269e9-13eb-481a-93ab-8c6151aa87e6', '_blank')}>
                            Open Uber Help
                        </Button>
                        <Button size="sm" className="flex-1 gap-2" onClick={() => onCopy(claim.message, claim.id)}>
                            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {isCopied ? "Copied" : "Copy"}
                        </Button>
                    </div>
                    <Button 
                        size="sm" 
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" 
                        onClick={() => handleAction('Submitted_to_Uber')}
                        disabled={isUpdating}
                    >
                        {isUpdating ? "Updating..." : (
                            <>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                I Have Submitted This
                            </>
                        )}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
