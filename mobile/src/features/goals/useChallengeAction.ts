import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import type { ApiError } from '@/api/errors';

import { challengeActionError, type ChallengeAction } from './challengeCopy';
import {
  acceptChallenge,
  declineChallenge,
  deleteCommitment,
  endCommitment,
  invalidateCommitmentsQueries,
} from './commitments';

// Withdraw and dismiss are the same DELETE -- the server tells them apart by
// the row's state. Quit is the same /end a goal uses.
const CALLS: Record<ChallengeAction, (id: string) => Promise<unknown>> = {
  accept: acceptChallenge,
  decline: declineChallenge,
  withdraw: deleteCommitment,
  dismiss: deleteCommitment,
  quit: endCommitment,
};

/**
 * One challenge action, wired to its endpoint. Success and failure both
 * refetch the list rather than patching it locally: most of these move a row
 * between sections, and a refetch keeps sections, chips, and the cap count
 * agreeing with the server -- including when the other participant got
 * there first.
 */
export function useChallengeAction(action: ChallengeAction, commitmentId: string, themLabel: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () => CALLS[action](commitmentId),
    onSuccess: () => invalidateCommitmentsQueries(queryClient),
    onError: (error) => {
      const copy = challengeActionError(action, error, themLabel);
      if (copy) {
        Alert.alert(copy.title, copy.message);
      }
      invalidateCommitmentsQueries(queryClient);
    },
  });
}
