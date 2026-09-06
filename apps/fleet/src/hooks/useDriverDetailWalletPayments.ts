/**
 * Cash Wallet payments-log grouping for Driver Detail.
 * Extracted from DriverDetail (Phase D) — behavior unchanged.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { FinancialTransaction } from '../types/data';
import { parseTripDate } from '../utils/driverOperationalMetrics';
import {
  isCashWriteOffTransaction,
  isDriverCashPaymentTransaction,
  isDriverPayoutTransaction,
} from '../utils/driverCashPayment';

function isBankTransferPaymentMethod(pm?: string | null) {
  const m = String(pm || '').toLowerCase().trim();
  return m === 'bank transfer' || m === 'mobile money' || m === 'check';
}

function groupWalletPaymentsByWeek(rows: FinancialTransaction[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      sortKey: number;
      total: number;
      writeOffTotal: number;
      payoutTotal: number;
      rows: FinancialTransaction[];
    }
  >();
  for (const tx of rows) {
    const s = tx.metadata?.workPeriodStart;
    const e = tx.metadata?.workPeriodEnd;
    const sd = s ? parseTripDate(String(s).split('T')[0]) : null;
    const ed = e ? parseTripDate(String(e).split('T')[0]) : null;
    const key = sd ? `${s}|${e || ''}` : '__untagged__';
    const label = sd
      ? ed
        ? `${format(sd, 'MMM d')} – ${format(ed, 'MMM d, yyyy')}`
        : format(sd, 'MMM d, yyyy')
      : 'Untagged';
    const sortKey = sd ? sd.getTime() : -Infinity;
    let g = groups.get(key);
    if (!g) {
      g = { key, label, sortKey, total: 0, writeOffTotal: 0, payoutTotal: 0, rows: [] };
      groups.set(key, g);
    }
    if (isCashWriteOffTransaction(tx)) g.writeOffTotal += Math.abs(Number(tx.amount) || 0);
    else if (isDriverPayoutTransaction(tx)) g.payoutTotal += Math.abs(Number(tx.amount) || 0);
    else g.total += Number(tx.amount) || 0;
    g.rows.push(tx);
  }
  return Array.from(groups.values()).sort((a, b) => b.sortKey - a.sortKey);
}

export function useDriverDetailWalletPayments(transactions: FinancialTransaction[]) {
  const paymentTransactions = useMemo(() => {
    return (transactions || [])
      .filter(
        (t) =>
          isDriverCashPaymentTransaction(t) ||
          isCashWriteOffTransaction(t) ||
          isDriverPayoutTransaction(t),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const cashReceivedTransactions = useMemo(
    () =>
      paymentTransactions.filter((t) => {
        if (isCashWriteOffTransaction(t)) return true;
        if (isBankTransferPaymentMethod(t.paymentMethod)) return false;
        return isDriverCashPaymentTransaction(t) || isDriverPayoutTransaction(t);
      }),
    [paymentTransactions],
  );

  const bankTransferTransactions = useMemo(
    () =>
      paymentTransactions.filter((t) => {
        if (isCashWriteOffTransaction(t)) return false;
        if (!isBankTransferPaymentMethod(t.paymentMethod)) return false;
        return isDriverCashPaymentTransaction(t) || isDriverPayoutTransaction(t);
      }),
    [paymentTransactions],
  );

  const [paymentsLogTab, setPaymentsLogTab] = useState<'cash' | 'bank'>('cash');

  const groupedCashReceivedTransactions = useMemo(
    () => groupWalletPaymentsByWeek(cashReceivedTransactions),
    [cashReceivedTransactions],
  );
  const groupedBankTransferTransactions = useMemo(
    () => groupWalletPaymentsByWeek(bankTransferTransactions),
    [bankTransferTransactions],
  );

  const activePaymentTransactions =
    paymentsLogTab === 'cash' ? cashReceivedTransactions : bankTransferTransactions;
  const groupedPaymentTransactions =
    paymentsLogTab === 'cash' ? groupedCashReceivedTransactions : groupedBankTransferTransactions;

  const [expandedPaymentGroups, setExpandedPaymentGroups] = useState<Set<string>>(new Set());
  const togglePaymentGroup = (key: string) => {
    setExpandedPaymentGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return {
    paymentsLogTab,
    setPaymentsLogTab,
    cashReceivedTransactions,
    bankTransferTransactions,
    activePaymentTransactions,
    groupedPaymentTransactions,
    expandedPaymentGroups,
    togglePaymentGroup,
  };
}
