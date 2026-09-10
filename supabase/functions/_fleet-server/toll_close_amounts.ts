/**
 * Pure Close Week toll amount preference — shared by seal + probe (no I/O).
 * Preference: plaza → events → financial_events (spend) → period columns.
 * Wallet charged FE overrides charged when present (H-9).
 */
export type TollCloseAmounts = {
  totalSpend: number;
  reimbursed: number;
  chargedToDriver: number;
  cashWashSpend: number;
  tagSpend: number;
  /** plaza | events | financial_events | period_columns */
  source: string;
};

export type TollClosePlazaSlice = {
  tollSpend: number;
  reimbursed: number;
  cashWashSpend: number;
  tagSpend: number;
};

export type TollCloseEventsSlice = {
  totalSpend: number;
  reimbursed: number;
  chargedToDriver: number;
  cashWashSpend: number;
  tagSpend: number;
};

export type TollCloseUsageSlice = {
  tagSpend: number;
};

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Preference order must match sealTollWeek + probeTollEngineAmounts.
 * Wallet charged override is applied after source pick when hasWalletCharged.
 */
export function pickTollCloseAmounts(input: {
  fromPlaza?: TollClosePlazaSlice | null;
  fromEvents?: TollCloseEventsSlice | null;
  fromUsage?: TollCloseUsageSlice | null;
  periodFallback: TollCloseAmounts;
  /** When true, replace chargedToDriver with walletCharged. */
  hasWalletCharged?: boolean;
  walletCharged?: number;
}): TollCloseAmounts {
  let amounts: TollCloseAmounts;

  if (input.fromPlaza) {
    amounts = {
      totalSpend: round2(input.fromPlaza.tollSpend),
      reimbursed: round2(input.fromPlaza.reimbursed),
      chargedToDriver: round2(input.periodFallback.chargedToDriver),
      cashWashSpend: round2(input.fromPlaza.cashWashSpend),
      tagSpend: round2(input.fromPlaza.tagSpend),
      source: "plaza",
    };
  } else if (input.fromEvents) {
    amounts = {
      totalSpend: round2(input.fromEvents.totalSpend),
      reimbursed: round2(input.fromEvents.reimbursed),
      chargedToDriver: round2(input.fromEvents.chargedToDriver),
      cashWashSpend: round2(input.fromEvents.cashWashSpend),
      tagSpend: round2(input.fromEvents.tagSpend),
      source: "events",
    };
  } else {
    amounts = { ...input.periodFallback, source: input.periodFallback.source || "period_columns" };
  }

  // Late tag posts: fold toll_usage when spend still empty (plaza miss / $0 events).
  if (Math.abs(amounts.totalSpend) < 0.005 && input.fromUsage && input.fromUsage.tagSpend > 0.005) {
    const tag = round2(input.fromUsage.tagSpend);
    amounts = {
      ...amounts,
      tagSpend: tag,
      totalSpend: tag,
      cashWashSpend: 0,
      source: "financial_events",
    };
  }

  if (input.hasWalletCharged) {
    amounts = {
      ...amounts,
      chargedToDriver: round2(Number(input.walletCharged) || 0),
    };
    if (amounts.source === "period_columns") {
      amounts = { ...amounts, source: "financial_events" };
    }
  }

  return amounts;
}

/** Async resolve: load plaza/events/usage/wallet then pick (seal + probe SoT). */
export async function resolveTollCloseAmounts(opts: {
  organizationId: string;
  weekKey: string;
  driverId: string;
  period?: {
    toll_spend?: number | null;
    toll_charged_to_driver?: number | null;
    toll_reimbursed?: number | null;
    toll_cash_spend?: number | null;
    toll_tag_spend?: number | null;
  } | null;
}): Promise<TollCloseAmounts> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = String(opts.weekKey || "").slice(0, 10);
  const driverId = String(opts.driverId || "").trim();

  const periodFallback: TollCloseAmounts = {
    totalSpend: round2(Number(opts.period?.toll_spend) || 0),
    reimbursed: round2(Number(opts.period?.toll_reimbursed) || 0),
    chargedToDriver: round2(Number(opts.period?.toll_charged_to_driver) || 0),
    cashWashSpend: round2(Number(opts.period?.toll_cash_spend) || 0),
    tagSpend: round2(Number(opts.period?.toll_tag_spend) || 0),
    source: "period_columns",
  };

  let fromPlaza: TollClosePlazaSlice | null = null;
  let fromEvents: TollCloseEventsSlice | null = null;
  let fromUsage: TollCloseUsageSlice | null = null;
  let hasWalletCharged = false;
  let walletCharged = 0;

  try {
    const { loadPlazaTollCardsForDriverWeek, loadCanonicalTollEventsForDriverWeek } = await import(
      "./toll_week_seal.ts"
    );
    const plaza = await loadPlazaTollCardsForDriverWeek(driverId, weekKey);
    if (plaza) {
      fromPlaza = {
        tollSpend: plaza.tollSpend,
        reimbursed: plaza.reimbursed,
        cashWashSpend: plaza.cashWashSpend,
        tagSpend: plaza.tagSpend,
      };
    } else {
      const { computeTollWeekNetting } = await import(
        "../../../packages/toll-core/src/tollWeekNetting.ts"
      );
      const events = await loadCanonicalTollEventsForDriverWeek(driverId, weekKey);
      if (events.length > 0) {
        const net = computeTollWeekNetting(events);
        fromEvents = {
          totalSpend: round2(net.tagSpend + net.cashWashSpend),
          reimbursed: round2(net.platformReimbursed + net.disputeRecovered),
          chargedToDriver: round2(net.chargedToDrivers),
          cashWashSpend: round2(net.cashWashSpend),
          tagSpend: round2(net.tagSpend),
        };
      }
    }

    // Always try usage when spend may be empty after pick (late tags).
    const provisionalSpend = fromPlaza?.tollSpend ?? fromEvents?.totalSpend ?? 0;
    if (provisionalSpend < 0.005) {
      const { listActiveTollUsageEventsForWeek } = await import("./toll_financial_reset.ts");
      const usage = await listActiveTollUsageEventsForWeek({
        periodAnchor: weekKey,
        driverId,
      });
      if (usage.length > 0) {
        let tag = 0;
        for (const e of usage) {
          tag += Math.abs(Number(e.amount_minor) || 0) / 100;
        }
        if (tag > 0.005) fromUsage = { tagSpend: round2(tag) };
      }
    }

    const { sumActiveTollChargedToDriverMajor } = await import(
      "./toll_charged_from_financial_events.ts"
    );
    const wallet = await sumActiveTollChargedToDriverMajor({
      weekKey,
      driverId,
      organizationId,
    });
    if (wallet.hasEvents) {
      hasWalletCharged = true;
      walletCharged = wallet.charged;
    }
  } catch (e) {
    console.warn("[resolveTollCloseAmounts] load failed — period fallback", driverId, weekKey, e);
  }

  return pickTollCloseAmounts({
    fromPlaza,
    fromEvents,
    fromUsage,
    periodFallback,
    hasWalletCharged,
    walletCharged,
  });
}
