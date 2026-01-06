import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { ArrowLeft, Car, Calendar, CreditCard, Tag, Wallet, TrendingDown } from "lucide-react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TollTag } from "../../types/vehicle";
import { TollTopupHistory } from "../vehicles/TollTopupHistory";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";

interface TollTagDetailProps {
  tag: TollTag;
  onBack: () => void;
}

export function TollTagDetail({ tag, onBack }: TollTagDetailProps) {
  const [vehicleName, setVehicleName] = useState(tag.assignedVehicleName || 'Unassigned');
  const [stats, setStats] = useState({
    balance: 0,
    tagSpent: 0,
    cashSpent: 0,
    totalTopUp: 0,
    calculatedBalance: 0,
    loading: true
  });

  const fetchStats = async () => {
    if (!tag.assignedVehicleId) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setStats(prev => ({ ...prev, loading: true }));
      const [vehicles, transactions] = await Promise.all([
        api.getVehicles(),
        api.getTransactions()
      ]);

      const vehicle = vehicles.find((v: any) => v.id === tag.assignedVehicleId);
      
      // Filter transactions for this vehicle
      const vehicleTx = transactions.filter((tx: any) => 
          tx.vehicleId === tag.assignedVehicleId && 
          (tx.category === 'Toll Usage' || tx.category === 'Toll Top-up' || tx.category === 'Tolls')
      );

      // Calculate totals
      const tagSpent = vehicleTx
        .filter((tx: any) => tx.category === 'Toll Usage')
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

      const cashSpent = vehicleTx
        .filter((tx: any) => tx.category === 'Tolls' && tx.amount < 0)
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

      const totalTopUp = vehicleTx
        .filter((tx: any) => tx.amount > 0)
        .reduce((sum: number, tx: any) => sum + tx.amount, 0);
      
      const calculatedBalance = vehicleTx.reduce((sum: number, tx: any) => sum + tx.amount, 0);
      const currentBalance = vehicle?.tollBalance || 0;

      // Auto-Sync if mismatch detected
      if (Math.abs(currentBalance - calculatedBalance) > 0.01 && vehicle) {
          await api.saveVehicle({
              ...vehicle,
              tollBalance: calculatedBalance
          });
      }

      setStats({
        balance: calculatedBalance,
        tagSpent,
        cashSpent,
        totalTopUp,
        calculatedBalance,
        loading: false
      });

    } catch (error) {
      console.error("Failed to fetch tag stats", error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchStats();
  }, [tag.assignedVehicleId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            {tag.provider} <span className="text-slate-400">/</span> {tag.tagNumber}
          </h1>
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
            <Badge variant="outline" className={
                tag.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-700'
            }>
                {tag.status}
            </Badge>
            <span>•</span>
            <span className="flex items-center gap-1">
                <Car className="h-3 w-3" />
                {tag.assignedVehicleName || 'No Vehicle Assigned'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Added {new Date(tag.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {tag.assignedVehicleId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.loading ? (
                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
              ) : (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <Tooltip>
                            <TooltipTrigger>
                                <div className={`text-2xl font-bold ${stats.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                ${stats.balance.toFixed(2)}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Current available balance for toll payments</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Available for tolls</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activity Summary</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.loading ? (
                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" />
              ) : (
                <div className="flex items-center gap-8">
                    <div>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="text-2xl font-bold text-slate-900">
                                ${stats.tagSpent.toFixed(2)}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Total amount deducted automatically from the tag</p>
                            </TooltipContent>
                        </Tooltip>
                        <p className="text-xs text-muted-foreground mt-1">Tag Usage</p>
                    </div>
                    <div className="w-px h-10 bg-slate-200" />
                    <div>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="text-2xl font-bold text-slate-900">
                                ${stats.cashSpent.toFixed(2)}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Total manual cash payments (receipts)</p>
                            </TooltipContent>
                        </Tooltip>
                        <p className="text-xs text-muted-foreground mt-1">Cash (Receipts)</p>
                    </div>
                    <div className="w-px h-10 bg-slate-200" />
                    <div>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="text-2xl font-bold text-emerald-600">
                                ${stats.totalTopUp.toFixed(2)}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Total funds added to the tag account</p>
                            </TooltipContent>
                        </Tooltip>
                        <p className="text-xs text-muted-foreground mt-1">Total Top Up</p>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
          {/* We can add more specific tag stats here later */}
          
          <Card>
              <CardHeader>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>
                    {tag.assignedVehicleId 
                        ? `Showing history for assigned vehicle: ${tag.assignedVehicleName}` 
                        : "This tag is not currently assigned to a vehicle. History is tracked by vehicle."}
                  </CardDescription>
              </CardHeader>
              <CardContent>
                  {tag.assignedVehicleId ? (
                      <TollTopupHistory 
                        vehicleId={tag.assignedVehicleId} 
                        onTransactionChange={fetchStats}
                      />
                  ) : (
                      <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                          <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p>Assign this tag to a vehicle to track its usage.</p>
                      </div>
                  )}
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
