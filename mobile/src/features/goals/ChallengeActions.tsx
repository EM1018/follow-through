import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { spacing } from '@/theme';

import { QUIT_CONFIRM_TITLE, quitConfirmMessage } from './challengeCopy';
import { useChallengeAction } from './useChallengeAction';

type ActionProps = { commitmentId: string; themLabel: string };

/**
 * Accept / Decline. At the cap only Accept is blocked -- Decline never is.
 * Both lock while either request is in flight, so one tap can't race the other.
 */
export function InviteActions({ commitmentId, themLabel, acceptBlocked }: ActionProps & { acceptBlocked: boolean }) {
  const accept = useChallengeAction('accept', commitmentId, themLabel);
  const decline = useChallengeAction('decline', commitmentId, themLabel);
  const busy = accept.isPending || decline.isPending;
  return (
    <View style={styles.row}>
      <Button
        label="Accept"
        onPress={() => accept.mutate()}
        disabled={acceptBlocked || busy}
        loading={accept.isPending}
        style={styles.half}
      />
      <Button
        label="Decline"
        variant="secondary"
        onPress={() => decline.mutate()}
        disabled={busy}
        loading={decline.isPending}
        style={styles.half}
      />
    </View>
  );
}

/** Withdraw (sent) and Dismiss (declined/expired) lose nothing, so neither confirms. */
export function WithdrawAction({ commitmentId, themLabel }: ActionProps) {
  const withdraw = useChallengeAction('withdraw', commitmentId, themLabel);
  return <Button label="Withdraw" variant="ghost" onPress={() => withdraw.mutate()} loading={withdraw.isPending} />;
}

export function DismissAction({ commitmentId, themLabel }: ActionProps) {
  const dismiss = useChallengeAction('dismiss', commitmentId, themLabel);
  return <Button label="Dismiss" variant="ghost" onPress={() => dismiss.mutate()} loading={dismiss.isPending} />;
}

/** Quit ends it for both participants and can't be undone -- so it confirms, like the app's other destructive actions. */
export function QuitAction({ commitmentId, themLabel }: ActionProps) {
  const quit = useChallengeAction('quit', commitmentId, themLabel);
  function confirmQuit() {
    Alert.alert(QUIT_CONFIRM_TITLE, quitConfirmMessage(themLabel), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Quit', style: 'destructive', onPress: () => quit.mutate() },
    ]);
  }
  return <Button label="Quit challenge" variant="ghost" onPress={confirmQuit} loading={quit.isPending} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
});
