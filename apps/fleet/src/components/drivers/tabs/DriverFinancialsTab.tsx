/**
 * Driver Financials tab — wraps FinancialSubTabs for lazy load.
 */
import React from 'react';
import { FinancialSubTabs } from '../FinancialSubTabs';
import type { PeriodWeekOption } from '../../../utils/periodWeekOptions';
import type { FinancialTransaction, QuotaConfig, Trip, DriverMetrics } from '../../../types/data';

export type DriverFinancialsTabProps = {
  driverId: string;
  driver?: any;
  transactions: FinancialTransaction[];
  allTrips: Trip[];
  quotaConfig: QuotaConfig | null;
  platformBreakdownData: any[];
  platformTotalEarnings: number;
  csvMetrics?: DriverMetrics[];
  periodFrom?: Date;
  periodTo?: Date;
  onFinancialPeriodSelect: (week: PeriodWeekOption) => void;
  financialBundle: any;
  weeklyPeriodData: any;
  weeklyCashWeeks: any;
};

export function DriverFinancialsTab(props: DriverFinancialsTabProps) {
  return (
    <FinancialSubTabs
      driverId={props.driverId}
      driver={props.driver}
      transactions={props.transactions}
      allTrips={props.allTrips}
      quotaConfig={props.quotaConfig}
      platformBreakdownData={props.platformBreakdownData}
      platformTotalEarnings={props.platformTotalEarnings}
      csvMetrics={props.csvMetrics}
      periodFrom={props.periodFrom}
      periodTo={props.periodTo}
      onFinancialPeriodSelect={props.onFinancialPeriodSelect}
      financialBundle={props.financialBundle}
      weeklyPeriodData={props.weeklyPeriodData}
      weeklyCashWeeks={props.weeklyCashWeeks}
    />
  );
}
