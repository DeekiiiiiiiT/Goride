/**
 * Driver Financials tab — wraps FinancialSubTabs for lazy load.
 * Platform donut inputs computed here (Round 4 Phase 3).
 */
import React from 'react';
import { FinancialSubTabs } from '../FinancialSubTabs';
import type { PeriodWeekOption } from '../../../utils/periodWeekOptions';
import type { FinancialTransaction, QuotaConfig, Trip, DriverMetrics } from '../../../types/data';
import { useDriverPlatformBreakdown } from './useDriverPlatformBreakdown';

export type DriverFinancialsTabProps = {
  driverId: string;
  driver?: any;
  transactions: FinancialTransaction[];
  allTrips: Trip[];
  quotaConfig: QuotaConfig | null;
  /** Ledger lifetime per-platform stats — donut hybrid override. */
  lifetimePlatformStats?: Record<string, any> | null;
  csvMetrics?: DriverMetrics[];
  periodFrom?: Date;
  periodTo?: Date;
  onFinancialPeriodSelect: (week: PeriodWeekOption) => void;
  financialBundle: any;
  weeklyPeriodData: any;
  weeklyCashWeeks: any;
};

export function DriverFinancialsTab(props: DriverFinancialsTabProps) {
  const { platformBreakdownData, platformTotalEarnings } = useDriverPlatformBreakdown(
    props.allTrips,
    props.lifetimePlatformStats,
  );

  return (
    <FinancialSubTabs
      driverId={props.driverId}
      driver={props.driver}
      transactions={props.transactions}
      allTrips={props.allTrips}
      quotaConfig={props.quotaConfig}
      platformBreakdownData={platformBreakdownData}
      platformTotalEarnings={platformTotalEarnings}
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
