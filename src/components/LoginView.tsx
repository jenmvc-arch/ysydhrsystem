import React, { useEffect, useState } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { UserAccount } from '../data';
import { googleSheetsClient, isGoogleConfigured } from '../lib/googleSheetsClient';
import {
  employeeSupabase,
  supabase,
  supabaseClient,
  isSupabaseConfigured,
} from '../lib/supabaseClient';
import {
  isEmployeeSignerRole,
  isRoleAllowedForLoginPortal,
  LoginPortal,
} from '../lib/userRoles';
import { useFeedback } from '../context/FeedbackContext';

interface LoginViewProps {
  onLoginSuccess: (user: UserAccount) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { showInfoModal } = useFeedback();
  const [loginPortal, setLoginPortal] = useState<LoginPortal>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEmployeeSigner = (user: Pick<UserAccount, 'role'>) => {
    return isEmployeeSignerRole(user.role);
  };

  const accountMatchesSelectedPortal = (user: Pick<UserAccount, 'role'>) =>
    isRoleAllowedForLoginPortal(user.role, loginPortal);

  const selectedPortalLabel = loginPortal === 'admin' ? 'Admin User' : 'Employee';

  const getPortalMismatchMessage = (role: string) => {
    const accountType = isEmployeeSignerRole(role) ? 'Employee' : 'Admin User';
    return `This account belongs to the ${accountType} login. Switch to ${accountType} to continue.`;
  };

  const loadEmployeeAccountProfile = async (
    client: any,
    fallback: UserAccount
  ): Promise<UserAccount> => {
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session?.access_token) return fallback;
      const response = await fetch('/api/employee-auth/profile', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) return fallback;
      const profile = await response.json();
      return {
        ...fallback,
        mustChangePassword: Boolean(profile.mustChangePassword),
        profileLoadedFromServer: true,
      };
    } catch {
      return fallback;
    }
  };

  const handlePortalChange = (portal: LoginPortal) => {
    setLoginPortal(portal);
    setError(null);
    setAuthNotice(null);
  };

  useEffect(() => {
    const employeeAuthClient = employeeSupabase || supabase;
    if (!employeeAuthClient) return;
    let cancelled = false;

    void employeeAuthClient.auth.getUser().then(async ({ data, error: authError }) => {
      if (cancelled || authError || !data.user?.email) return;

      setIsLoading(true);
      if (!supabase) {
        await employeeAuthClient.auth.signOut({ scope: 'local' });
        setIsLoading(false);
        setError('The employee directory database is not configured for this sign-in.');
        return;
      }
      const [
        { data: employee, error: employeeError },
        { data: candidate, error: candidateError },
      ] = await Promise.all([
        supabase
          .from('employees')
          .select('email, name')
          .ilike('email', data.user.email)
          .maybeSingle(),
        supabase
          .from('candidates')
          .select('email, name')
          .ilike('email', data.user.email)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setIsLoading(false);
      const signer = employee || candidate;
      if (employeeError || candidateError || !signer) {
        await employeeAuthClient.auth.signOut({ scope: 'local' });
        setError('This secure sign-in link is not connected to an employee onboarding account.');
        return;
      }

      const signedInUser = await loadEmployeeAccountProfile(employeeAuthClient, {
        email: signer.email,
        password: '',
        name: signer.name,
        role: employee ? 'Employee' : 'Candidate',
      });
      onLoginSuccess(signedInUser);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const completeLogin = async (matchedUser: UserAccount) => {
    const employeeAuthClient = employeeSupabase || supabase;
    if (employeeAuthClient && isEmployeeSigner(matchedUser)) {
      const signerEmail = String(matchedUser.email || '').trim().toLowerCase();
      if (!signerEmail.includes('@')) {
        setIsLoading(false);
        setError('Employee onboarding accounts must use a valid email address.');
        return;
      }

      const {
        data: { user: authenticatedUser },
      } = await employeeAuthClient.auth.getUser();
      if (authenticatedUser?.email?.toLowerCase() === signerEmail) {
        setIsLoading(false);
        onLoginSuccess(await loadEmployeeAccountProfile(employeeAuthClient, matchedUser));
        return;
      }

      const { error: otpError } = await employeeAuthClient.auth.signInWithOtp({
        email: signerEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      setIsLoading(false);
      if (otpError) {
        setError(otpError.message || 'The secure employee sign-in link could not be sent.');
        return;
      }
      setAuthNotice(`A secure sign-in link has been sent to ${signerEmail}.`);
      return;
    }

    if (employeeAuthClient) {
      await employeeAuthClient.auth.signOut({ scope: 'local' });
    }
    setIsLoading(false);
    onLoginSuccess(matchedUser);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthNotice(null);

    // Validate inputs
    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);

    if (loginPortal === 'admin') {
      try {
        const secureResponse = await fetch('/api/auth/admin-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: email.trim(),
            password,
          }),
        });
        const securePayload = await secureResponse.json().catch(() => ({}));
        if (secureResponse.ok && securePayload.user) {
          setIsLoading(false);
          onLoginSuccess({
            email: securePayload.user.email,
            password: '',
            name: securePayload.user.name,
            role: securePayload.user.role,
            mustChangePassword: Boolean(securePayload.user.mustChangePassword),
            profileLoadedFromServer: true,
          });
          return;
        }
        if (secureResponse.status === 401 || secureResponse.status === 403) {
          setIsLoading(false);
          setError(securePayload.error || 'Invalid username or password.');
          return;
        }
        // A missing local API server falls through to the configured remote
        // authentication path without exposing local demo credentials.
      } catch (secureError) {
        console.warn('[Admin Auth] Secure session endpoint unavailable:', secureError);
      }
    }

    const performLocalFallback = async () => {
      setIsLoading(false);
      setError('No local accounts are configured. Connect the HR database or ask an administrator to provision your account.');
    };

    const performRemoteAuth = async (client: any, sourceName: string) => {
      try {
        if (loginPortal === 'employee' && supabase) {
          const [
            { data: employee, error: employeeError },
            { data: candidate, error: candidateError },
          ] = await Promise.all([
            supabase
              .from('employees')
              .select('email, name')
              .ilike('email', email.trim())
              .maybeSingle(),
            supabase
              .from('candidates')
              .select('email, name')
              .ilike('email', email.trim())
              .maybeSingle(),
          ]);
          const matchedSigner = employee || candidate;
          if (matchedSigner && !employeeError && !candidateError) {
            await completeLogin({
              email: matchedSigner.email,
              password: '',
              name: matchedSigner.name,
              role: employee ? 'Employee' : 'Candidate',
            });
          } else {
            await performLocalFallback();
          }
          return;
        }

        const payload = await client.loadData();
        const users = payload.users || [];
        const credentialMatch = users.find(
          (u: any) => String(u.email).toLowerCase() === email.trim().toLowerCase() && String(u.password) === password
        );
        const matched = credentialMatch && accountMatchesSelectedPortal(credentialMatch)
          ? credentialMatch
          : undefined;

        if (matched) {
          await completeLogin({
            email: matched.email,
            password: matched.password,
            name: matched.name,
            role: matched.role,
          });
        } else {
          setIsLoading(false);
          setError(
            credentialMatch
              ? getPortalMismatchMessage(String(credentialMatch.role || ''))
              : 'Invalid username or password. Please try again.'
          );
        }
      } catch (err) {
        console.error(`[${sourceName} Auth Error] Falling back to local accounts:`, err);
        await performLocalFallback();
      }
    };

    if (isSupabaseConfigured) {
      await performRemoteAuth(supabaseClient, 'Supabase');
    } else if (isGoogleConfigured) {
      await performRemoteAuth(googleSheetsClient, 'Google Sheets');
    } else {
      // Simulate network authentication delay
      setTimeout(() => {
        void performLocalFallback();
      }, 800);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-background via-surface-container-low to-surface-container-high p-4 select-text relative overflow-hidden font-sans text-on-background">
      
      {/* Background Accents (Minimal Red Curves) */}
      <div className="absolute top-0 left-0 w-64 h-full pointer-events-none opacity-20">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-primary fill-current">
          <path d="M0,0 C50,30 20,70 0,100 Z" />
        </svg>
      </div>
      <div className="absolute bottom-0 right-0 w-96 h-64 pointer-events-none opacity-20">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-primary fill-current">
          <path d="M100,100 C60,80 80,30 100,0 Z" />
        </svg>
      </div>
      
      {/* Optional subtle dotted pattern in corners */}
      <div className="absolute top-4 left-4 w-32 h-32 bg-[radial-gradient(#825500_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none"></div>
      <div className="absolute bottom-4 right-4 w-32 h-32 bg-[radial-gradient(#825500_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none"></div>

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        
        {/* Logo at the top center */}
          <img
            src="/redpoint-logo.png"
            alt="YSYD HRMS logo"
            className="h-16 w-auto mb-8 object-contain drop-shadow-sm"
            onError={(e) => {
              // Fallback if logo is missing
              e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement?.insertAdjacentHTML('afterbegin', '<div class="text-primary font-bold text-2xl mb-8 tracking-tight">YSYD HRMS</div>');
            }}
          />

        {/* Login Card */}
        <div className="w-full bg-white rounded-2xl shadow-[0_8px_30px_rgba(20,24,28,0.08)] border border-neutral-border p-8">
          
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-on-background">
              {loginPortal === 'admin' ? 'Admin User Sign In' : 'Employee Sign In'}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {loginPortal === 'admin'
                ? 'Access the YSYD HRMS console'
                : 'Access your personal employee workspace'}
            </p>
          </div>

          {/* Login Portal Switch */}
          <div className="mb-6 rounded-2xl border border-neutral-border bg-surface-container-low p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              {([
                {
                  id: 'admin' as const,
                  label: 'Admin User',
                  description: 'HRMS console',
                  Icon: ShieldCheck,
                },
                {
                  id: 'employee' as const,
                  label: 'Employee',
                  description: 'Self-service portal',
                  Icon: UserRound,
                },
              ]).map(({ id, label, description, Icon }) => {
                const isActive = loginPortal === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handlePortalChange(id)}
                    className={`flex min-h-[66px] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isActive
                        ? 'bg-white text-primary shadow-sm ring-1 ring-primary/15'
                        : 'text-on-surface-variant hover:bg-white/70'
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isActive ? 'bg-primary/10' : 'bg-white/70'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="mt-0.5 block text-[11px] opacity-75">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Notification HUD */}
          {error && (
            <div className="mb-6 p-4 bg-error/10 border border-error/30 text-error text-sm rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
          {authNotice && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">{authNotice}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            
            {/* Username Input Group */}
            <div>
              <label className="block text-sm font-semibold text-on-background mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full h-12 pl-11 pr-4 bg-white border border-neutral-border rounded-xl text-sm text-on-background placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>
            </div>

            {/* Password Input Group */}
            <div>
              <label className="block text-sm font-semibold text-on-background mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-12 pl-11 pr-11 bg-white border border-neutral-border rounded-xl text-sm text-on-background placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-on-surface-variant hover:text-on-background focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex justify-between items-center mt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-primary"
                />
                <span className="text-sm text-on-surface-variant group-hover:text-on-background transition-colors">Remember Me</span>
              </label>
              
              <a 
                href="#forgot" 
                onClick={(e) => {
                  e.preventDefault();
                  void showInfoModal({
                    title: 'Password Recovery',
                    message: loginPortal === 'admin'
                      ? 'Admin accounts are provisioned by HR.'
                      : 'Employee accounts use the company-issued username and temporary password. If you do not have your credentials, please contact HR.',
                    acknowledgeLabel: 'Understood',
                  });
                }}
                className="text-sm text-primary hover:text-primary-container font-semibold transition-colors"
              >
                Forgot Password?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-12 mt-4 bg-primary hover:bg-primary-container text-white text-base font-semibold rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 ${
                isLoading ? 'opacity-80 cursor-wait' : 'hover:-translate-y-0.5'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            {loginPortal === 'employee' && (
              <a
                href="/employee-portal/demo"
                className="mt-3 w-full h-11 inline-flex items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
              >
                Open employee preview
              </a>
            )}
          </form>

        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 w-full text-center z-10">
        <p className="text-sm font-medium text-gray-500">
          © 2026 YSYD HRMS. All rights reserved.
        </p>
      </footer>

    </div>
  );
}
