import { peekPastWeeksReturn } from '../../../../utils/pastWeeksCleanupSession';
import { Button } from '../../../ui/button';

export function PastWeeksReturnLink({ onReturn }: { onReturn: () => void }) {
  if (peekPastWeeksReturn() == null) return null;
  return (
    <Button type="button" variant="outline" className="h-11" onClick={onReturn}>
      Back to clean-up
    </Button>
  );
}
