import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { DollarSign, TrendingUp, CreditCard, ChevronRight, Download } from "lucide-react";

export function DriverEarnings() {
  const data = [
    { day: 'Mon', amount: 120 },
    { day: 'Tue', amount: 155 },
    { day: 'Wed', amount: 98 },
    { day: 'Thu', amount: 180 },
    { day: 'Fri', amount: 245 },
    { day: 'Sat', amount: 310 },
    { day: 'Sun', amount: 220 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Earnings</h2>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Statement
        </Button>
      </div>

      <Card className="bg-slate-900 text-white border-slate-800">
         <CardContent className="p-6">
            <span className="text-slate-400 text-sm">Current Balance</span>
            <div className="flex items-end justify-between mt-1 mb-6">
               <h1 className="text-4xl font-bold">$1,328.50</h1>
               <div className="flex items-center text-emerald-400 text-sm font-medium mb-1">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  +12.5%
               </div>
            </div>
            <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
               <CreditCard className="mr-2 h-4 w-4" />
               Cash Out Now
            </Button>
            <p className="text-center text-xs text-slate-500 mt-3">
               Typically arrives within minutes
            </p>
         </CardContent>
      </Card>

      <Card>
         <CardHeader>
            <CardTitle className="text-base">Weekly Summary</CardTitle>
         </CardHeader>
         <CardContent>
            <div className="h-[200px] w-full overflow-x-auto flex justify-center">
               <div style={{ minWidth: '300px' }}>
                  <BarChart width={320} height={200} data={data}>
                     <XAxis 
                        dataKey="day" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        stroke="#888888"
                     />
                     <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     />
                     <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
               </div>
            </div>
         </CardContent>
      </Card>

      <Card>
         <CardHeader>
            <CardTitle className="text-base">Breakdown</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
            <Row label="Trip Fares" value="$980.50" />
            <Row label="Tips" value="$145.00" />
            <Row label="Promotions" value="$120.00" />
            <Row label="Tolls & Fees" value="$83.00" />
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
            <Row label="Total Earnings" value="$1,328.50" bold />
         </CardContent>
      </Card>

      <div className="space-y-2">
         <h3 className="font-semibold text-slate-900 dark:text-slate-100 px-1">Recent Payouts</h3>
         <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <PayoutItem date="Oct 12, 2025" amount="$1,120.00" status="Paid" />
            <PayoutItem date="Oct 05, 2025" amount="$980.50" status="Paid" />
            <PayoutItem date="Sep 28, 2025" amount="$1,050.25" status="Paid" />
         </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string, value: string, bold?: boolean }) {
   return (
      <div className="flex justify-between items-center">
         <span className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
         <span className={`text-sm ${bold ? 'font-bold text-slate-900' : 'text-slate-900'}`}>{value}</span>
      </div>
   )
}

function PayoutItem({ date, amount, status }: { date: string, amount: string, status: string }) {
   return (
      <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
         <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
               <DollarSign className="h-4 w-4" />
            </div>
            <div>
               <p className="text-sm font-medium text-slate-900">{date}</p>
               <p className="text-xs text-slate-500">Weekly Payout</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">{amount}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
         </div>
      </div>
   )
}
