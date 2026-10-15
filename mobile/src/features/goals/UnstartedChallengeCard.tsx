import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

import { DismissAction, InviteActions, WithdrawAction } from './ChallengeActions';
import {
  durationLabel,
  inviteCountdownLabel,
  inviteDaysLeft,
  UNSTARTED_BADGE,
  unstartedLine,
} from './challengeCopy';
import type { CommitmentRead } from './commitments';
import { challengeThemLabel } from './goalCopy';
import type { UnstartedStatus } from './goalShape';
import { goalTermsLine } from './goalTerms';

type UnstartedChallengeCardProps = {
  commitment: CommitmentRead & { status: UnstartedStatus };
  activityDisplayName: string;
  /** At the challenge cap -- Accept renders disabled. Decline is never blocked. */
  acceptBlocked: boolean;
};

/**
 * sent / invite / declined / expired: a challenge whose clock never started.
 * The server sends no `you` and no `them.track` on these, so there are no
 * week circles here at all -- not a row of empty ones. `them` still carries
 * the other participant's username, which is what names them.
 */
export function UnstartedChallengeCard({ commitment, activityDisplayName, acceptBlocked }: UnstartedChallengeCardProps) {
  if (commitment.them == null) {
    throw new Error(`Challenge ${commitment.id} (${commitment.status}) arrived without them`);
  }
  if (commitment.duration_weeks === null) {
    throw new Error(`Challenge ${commitment.id} has no duration_weeks -- challenges are never Ongoing`);
  }
  const themLabel = challengeThemLabel(commitment.them.username);
  const terms = `${goalTermsLine(commitment)} · ${durationLabel(commitment.duration_weeks)}`;
  const isInvite = commitment.status === 'invite';

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{activityDisplayName}</Text>
        <Badge label={UNSTARTED_BADGE[commitment.status]} variant={isInvite ? 'accent' : 'muted'} />
      </View>
      <Text style={styles.framing}>{unstartedLine(commitment.status, themLabel)}</Text>
      <Text style={styles.terms}>{terms}</Text>
      {isInvite ? (
        <Text style={styles.countdown}>{inviteCountdownLabel(inviteDaysLeft(commitment.created_at, new Date()))}</Text>
      ) : null}
      <View style={styles.actions}>
        {commitment.status === 'invite' ? (
          <InviteActions commitmentId={commitment.id} themLabel={themLabel} acceptBlocked={acceptBlocked} />
        ) : commitment.status === 'sent' ? (
          <WithdrawAction commitmentId={commitment.id} themLabel={themLabel} />
        ) : (
          <DismissAction commitmentId={commitment.id} themLabel={themLabel} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  framing: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  terms: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  countdown: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  actions: {
    paddingTop: spacing.sm,
  },
});
