import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { ArrowLeft, Car, Clock, History, UserPlus } from "lucide-react";
import { Badge } from "../ui/badge";
import { TollTag } from "../../types/vehicle";

/**
 * One toll tag: what it is, which car has it, and its assignment history.
 * The tag's balance, tolls and top-ups now live in the new toll system (Week Reconciliation step 4, Tag account);
 * the old toll ledger views and manual top-up logging were removed with the old toll system.
 */
interface TollTagDetailProps {
  tag: TollTag;
  onBack: () => void;
  onRequestAssign?: () => void;
}

export function TollTagDetail({ tag, onBack, onRequestAssign }: TollTagDetailProps) {
  const history = [...(tag.assignmentHistory ?? [])].sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 truncate">
              {tag.provider} <span className="text-slate-400">/</span> {tag.tagNumber}
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5 flex-wrap">
              <Badge variant="outline" className={
                tag.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-700'
              }>
                {tag.status}
              </Badge>
              <span className="flex items-center gap-1">
                <Car className="h-3 w-3" />
                {tag.assignedVehicleName || 'No Vehicle Assigned'}
              </span>
            </div>
          </div>
          {!tag.assignedVehicleId && onRequestAssign ? (
            <Button size="sm" onClick={onRequestAssign}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Assign to vehicle
            </Button>
          ) : null}
        </div>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        This tag&apos;s balance, tolls and top-ups are in Week Reconciliation (step 4, Tag account).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignment History</CardTitle>
          <CardDescription>When this tag was assigned or unassigned from vehicles.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="relative pl-6">
              <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200" />
              {history.map((entry) => {
                const isCurrent = !entry.unassignedAt;
                return (
                  <div key={`${entry.vehicleId}-${entry.assignedAt}`} className="relative pb-5 last:pb-0">
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`absolute -left-6 mt-1 h-[18px] w-[18px] rounded-full border-2 ${isCurrent ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isCurrent ? 'text-emerald-700' : 'text-slate-700'}`}>Assigned to {entry.vehicleName}</span>
                          {isCurrent && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Current</Badge>}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.assignedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {entry.unassignedAt && (
                      <div className="text-sm text-red-600">
                        Unassigned from {entry.vehicleName}
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.unassignedAt).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed">
              <History className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No assignment history recorded.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
