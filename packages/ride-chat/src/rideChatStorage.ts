const PREFIX = 'roam:ride-chat:lastRead:';

export function rideChatLastReadKey(rideId: string): string {
  return `${PREFIX}${rideId}`;
}

export function getRideChatLastReadId(rideId: string): string | null {
  try {
    return sessionStorage.getItem(rideChatLastReadKey(rideId));
  } catch {
    return null;
  }
}

export function setRideChatLastReadId(rideId: string, messageId: string): void {
  try {
    sessionStorage.setItem(rideChatLastReadKey(rideId), messageId);
  } catch {
    /* ignore */
  }
}
