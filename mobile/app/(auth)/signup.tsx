import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { updateMeWithToken, type MeUpdate } from '@/features/profile/me';
import { isValidUsernameFormat, lowercaseUsername } from '@/features/profile/username';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function SignUpScreen() {
  const { setSuppressRedirect } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the account exists but the username claim came back 409 -- the
  // account can't be recreated with different credentials, so email/password
  // are locked and the only thing left to do is retry the username.
  const [locked, setLocked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  function handleUsernameChange(text: string) {
    setUsername(lowercaseUsername(text));
    if (usernameError) setUsernameError(null);
  }

  function validate(): boolean {
    let ok = true;
    if (!EMAIL_PATTERN.test(email)) {
      setEmailError('Enter a valid email address');
      ok = false;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      ok = false;
    }
    if (!isValidUsernameFormat(username)) {
      setUsernameError('3-20 characters: lowercase letters, numbers, underscores');
      ok = false;
    }
    return ok;
  }

  async function claimUsername(token: string): Promise<'ok' | 'conflict'> {
    const patch: MeUpdate = { username };
    const zone = deviceTimezone();
    if (zone) {
      patch.timezone = zone;
    }

    try {
      await updateMeWithToken(patch, token);
      return 'ok';
    } catch (err) {
      const apiError = err as { kind: string };
      if (apiError.kind === 'conflict') {
        return 'conflict';
      }
      // 422 (shouldn't happen given client validation), network drops, 401,
      // 5xx: the account already exists and the session is live -- none of
      // these are fixable by staying here, so we let the caller proceed.
      return 'ok';
    }
  }

  async function handleClaimUsername() {
    if (!accessToken) return;
    if (!isValidUsernameFormat(username)) {
      setUsernameError('3-20 characters: lowercase letters, numbers, underscores');
      return;
    }

    setIsSubmitting(true);
    const result = await claimUsername(accessToken);
    setIsSubmitting(false);

    if (result === 'conflict') {
      setUsernameError('That username is taken');
      return;
    }

    setSuppressRedirect(false);
  }

  async function handleSignUp() {
    setScreenError(null);
    setEmailError(null);
    setPasswordError(null);
    setUsernameError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    // Held until we know the outcome of the username claim below -- a 409
    // must keep the user on this screen even though signUp() below already
    // creates a live session.
    setSuppressRedirect(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setIsSubmitting(false);
      setSuppressRedirect(false);
      const code = (signUpError as { code?: string }).code;
      if (code === 'user_already_exists' || /already registered/i.test(signUpError.message)) {
        setEmailError('An account with this email already exists');
      } else if (code === 'weak_password' || /password/i.test(signUpError.message)) {
        setPasswordError(signUpError.message);
      } else {
        setScreenError(signUpError.message || 'Something went wrong. Please try again.');
      }
      return;
    }

    const session = data.session;
    if (!session) {
      // Email confirmation is off for this project, so this shouldn't happen --
      // guard rather than crash on a null access_token.
      setIsSubmitting(false);
      setSuppressRedirect(false);
      setScreenError('Something went wrong. Please try again.');
      return;
    }

    setAccessToken(session.access_token);
    const result = await claimUsername(session.access_token);
    setIsSubmitting(false);

    if (result === 'conflict') {
      setUsernameError('That username is taken');
      setLocked(true);
      // suppressRedirect stays true: the account exists, but we hold the
      // user here until they claim a free username.
      return;
    }

    setSuppressRedirect(false);
  }

  const submitLabel = locked ? 'Claim username' : 'Sign up';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!locked}
        />
        {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
      </View>

      <View style={styles.field}>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!locked}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.showToggle}>
            <Text style={styles.showToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
        {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
      </View>

      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={handleUsernameChange}
          maxLength={20}
        />
        {usernameError ? <Text style={styles.error}>{usernameError}</Text> : null}
      </View>

      {screenError ? <Text style={styles.error}>{screenError}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={locked ? handleClaimUsername : handleSignUp}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
      </TouchableOpacity>

      {!locked ? (
        <Link href="/(auth)/login" style={styles.link}>
          Already have an account? Sign in
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  field: {
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  showToggle: {
    position: 'absolute',
    right: 12,
  },
  showToggleText: {
    color: '#208AEF',
    fontWeight: '600',
  },
  error: {
    color: 'red',
  },
  button: {
    backgroundColor: '#208AEF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  link: {
    color: '#208AEF',
    textAlign: 'center',
    marginTop: 8,
  },
});
