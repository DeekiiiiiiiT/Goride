/** Toll v2 command API failure — keeps business `code` from 4xx JSON bodies. */
export class TollV2CommandError extends Error {
  readonly status: number;
  readonly code: string;
  readonly currentState: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    currentState: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TollV2CommandError';
    this.status = status;
    this.code = code;
    this.currentState = currentState;
  }
}

/** The week's drivers are already paid: the answer is "move it to the open week", never reopen.
 *  reopen_week refuses with DRIVERS_ALREADY_PAID; carry_forward's other cases with REOPEN_INSTEAD. */
export function isPaidWeekRefusal(error: unknown): boolean {
  return error instanceof TollV2CommandError
    && (error.code === 'DRIVERS_ALREADY_PAID' || error.code === 'REOPEN_INSTEAD');
}

/** Plain words for the server's refusals (codes in toll_v2_command_errors.ts). */
const TOLL_V2_REFUSAL_WORDS: Record<string, string> = {
  WEEK_NOT_SEALED: 'Seal this week\'s tolls first.',
  PENDING_NOT_RESOLVED: 'Decide every toll and payback before sealing.',
  WEEK_NOT_ENDED: 'This week hasn\'t ended yet.',
  AFTER_SEAL: 'This came in after the week was sealed. Use the late items card.',
  AMOUNT_TOO_LARGE: 'That amount is too large for this toll.',
  ALLOCATIONS_EXCEED_AMOUNT: 'The new amount is less than what is already matched. Undo a match first.',
  PARTIAL_TAKE_BACK: 'Uber took back only part of this payback. Record it on the take-back card.',
  COMMAND_ID_REUSED: 'That was already done. The list was refreshed.',
  TOLLS_V2_OFF: 'The new toll screens are not switched on for this company.',
  FORBIDDEN: 'Only owners and managers can do this.',
};

export function tollV2UserMessage(error: unknown, fallback: string): string {
  if (error instanceof TollV2CommandError) {
    if (error.code === 'VERSION_CHANGED') {
      return 'Someone else changed this toll. The list was refreshed.';
    }
    if (error.code === 'WRONG_STATE' || error.code === 'NOT_FOUND') {
      return 'That toll changed. The list was refreshed.';
    }
    if (error.code === 'WEEK_SEALED') {
      return 'This week is already sealed.';
    }
    if (isPaidWeekRefusal(error)) {
      return 'Paid weeks can\'t be reopened — late items move to the open week.';
    }
    const plain = TOLL_V2_REFUSAL_WORDS[error.code];
    if (plain) return plain;
    if (error.message && !error.message.startsWith('{') && error.message !== error.code) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
