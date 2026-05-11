import React, { useState } from 'react';
import { QuotaConfig } from '../../types/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { DollarSign, Clock } from 'lucide-react';
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { QuotaProjectionTables } from './QuotaProjectionTables';
import { generateStandardSchedule } from './quota-utils';

interface QuotaConfigTabProps {
  config: QuotaConfig;
  onChange: (newConfig: QuotaConfig) => void;
}

export function QuotaConfigTab({ config, onChange }: QuotaConfigTabProps) {
  const [activeTab, setActiveTab] = useState<string>("weekly");

  const weeklyAmount = config.weekly.amount;
  // Default to 5 days if undefined, or length of existing array
  const workingDaysCount = config.weekly.workingDays && config.weekly.workingDays.length > 0 
    ? config.weekly.workingDays.length 
    : 5;

  const handleWeeklyAmountChange = (amount: number) => {
    const newConfig = { ...config };
    
    // Update weekly config
    newConfig.weekly = { 
        ...newConfig.weekly, 
        amount: amount,
        enabled: true 
    };
    
    // Sync working days to other periods for consistency
    const days = newConfig.weekly.workingDays || generateStandardSchedule(workingDaysCount);
    
    newConfig.daily = { ...newConfig.daily, workingDays: days };
    newConfig.monthly = { ...newConfig.monthly, workingDays: days };
    
    onChange(newConfig);
  };

  const handleDaysCountChange = (count: number) => {
    // Clamp between 1 and 7
    const validCount = Math.max(1, Math.min(7, count));
    const newSchedule = generateStandardSchedule(validCount);
    
    const newConfig = { ...config };
    newConfig.weekly = { ...newConfig.weekly, workingDays: newSchedule, enabled: true };
    newConfig.daily = { ...newConfig.daily, workingDays: newSchedule };
    newConfig.monthly = { ...newConfig.monthly, workingDays: newSchedule };
    
    onChange(newConfig);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Velocity Configuration</CardTitle>
          <CardDescription>
            Set the master weekly target and working schedule. Daily and monthly targets will be automatically derived.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
               <Label>Weekly Target ($)</Label>
               <div className="relative">
                 <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                 <Input 
                    type="number" 
                    min="0"
                    value={weeklyAmount}
                    onChange={(e) => handleWeeklyAmountChange(Number(e.target.value))}
                    className="pl-9"
                 />
               </div>
               <p className="text-sm text-slate-500">
                  The gross earnings target for a standard week.
               </p>
            </div>

            <div className="space-y-2">
               <Label>Working Days per Week</Label>
               <div className="relative">
                 <Clock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                 <Input 
                    type="number" 
                    min="1"
                    max="7"
                    value={workingDaysCount}
                    onChange={(e) => handleDaysCountChange(Number(e.target.value))}
                    className="pl-9"
                 />
               </div>
               <p className="text-sm text-slate-500">
                  Number of active driving days (1-7).
               </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <QuotaProjectionTables 
          weeklyAmount={weeklyAmount}
          workingDaysCount={workingDaysCount}
          activeTab={activeTab}
          onTabChange={setActiveTab}
      />
    </div>
  );
}