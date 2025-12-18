import React, { useState } from 'react';
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { CheckCircle2, AlertTriangle, Calendar, Sun, ArrowRight } from "lucide-react";

export function DailyBriefingModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100">
          <Sun className="mr-2 h-4 w-4" />
          Daily Briefing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500" />
            Morning Briefing: {new Date().toLocaleDateString()}
          </DialogTitle>
          <DialogDescription>
            Automated summary generated at 6:00 AM.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
                {/* Section 1: Yesterday Summary */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                        Yesterday's Performance
                    </h3>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-slate-500 block">Total Earnings</span>
                            <span className="font-bold text-slate-900">$5,240.50</span>
                            <span className="text-green-600 text-xs ml-2">↑ 12%</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Completed Trips</span>
                            <span className="font-bold text-slate-900">142</span>
                            <span className="text-green-600 text-xs ml-2">↑ 5%</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Driver Efficiency</span>
                            <span className="font-bold text-slate-900">92%</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block">Top Driver</span>
                            <span className="font-bold text-slate-900">Kenny ($450)</span>
                        </div>
                    </div>
                </div>

                {/* Section 2: Forecast */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                        <ArrowRight className="h-4 w-4 mr-2 text-indigo-600" />
                        Today's Forecast
                    </h3>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-sm">
                        <p className="text-indigo-900 mb-2">
                            Expect high demand around <strong>12:00 PM - 3:00 PM</strong> due to local events.
                        </p>
                        <ul className="list-disc list-inside text-indigo-800 space-y-1">
                            <li>Target active drivers: 10</li>
                            <li>Projected earnings: $5,500+</li>
                            <li>Weather: Clear skies, no impact on traffic.</li>
                        </ul>
                    </div>
                </div>

                {/* Section 3: Alerts/Maintenance */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                        Attention Required
                    </h3>
                    <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm space-y-2">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-slate-700">Vehicle <strong>5179KZ</strong> due for maintenance</span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">Schedule</Button>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-slate-700">Driver <strong>John Doe</strong> has low acceptance (35%)</span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">Review</Button>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-700">Route <strong>Kingston &rarr; Spanish Town</strong> high cancellation rate</span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">Analyze</Button>
                        </div>
                    </div>
                </div>

                {/* Section 4: Schedule */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-slate-600" />
                        Today's Schedule
                    </h3>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                            <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">09:00 AM</span>
                            <span>Team Standup</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">02:00 PM</span>
                            <span>Performance Review with Sarah</span>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Acknowledge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
