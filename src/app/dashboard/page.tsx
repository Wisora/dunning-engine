'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

// Browser-safe client using public credentials
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Tenant = Database['public']['Tables']['tenants']['Row'];
type FailedInvoice = Database['public']['Tables']['failed_invoices']['Row'];

export default function FounderDashboard() {
  // --- Auth State ---
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Dashboard State ---
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [invoices, setInvoices] = useState<FailedInvoice[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // --- Settings Form State ---
  const [settingsForm, setSettingsForm] = useState({
    business_name: '',
    support_email: '',
    currency: 'ZAR',
    paystack_public_key: '',
    paystack_secret_key: '',
    resend_api_key: '',
  });
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsNotification, setSettingsNotification] = useState<string | null>(null);

  // 1. Initial Session Handshake
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch Tenant Profile & Invoices
  const fetchTenantData = async (userId: string) => {
    setDataLoading(true);
    try {
      // 2.1 Fetch Tenant Record
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (tenantErr) throw tenantErr;

      if (tenantData) {
        setTenant(tenantData);
        setSettingsForm({
          business_name: tenantData.business_name || '',
          support_email: tenantData.support_email || '',
          currency: tenantData.currency || 'ZAR',
          paystack_public_key: tenantData.paystack_public_key || '',
          paystack_secret_key: tenantData.paystack_secret_key || '',
          resend_api_key: tenantData.resend_api_key || '',
        });

        // 2.2 Fetch Failed Invoices
        const { data: invoiceData, error: invoiceErr } = await supabase
          .from('failed_invoices')
          .select('*')
          .eq('tenant_id', tenantData.id)
          .order('created_at', { ascending: false });

        if (invoiceErr) throw invoiceErr;
        setInvoices(invoiceData || []);
      }
    } catch (err: unknown) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchTenantData(session.user.id);
    }
  }, [session]);

  // 3. Computed KPI Metrics
  const metrics = useMemo(() => {
    const recovered = invoices
      .filter((inv) => inv.status === 'recovered')
      .reduce((sum, inv) => sum + Number(inv.amount), 0);

    const pendingAtRisk = invoices
      .filter((inv) => inv.status === 'pending' || inv.status === 'retrying')
      .reduce((sum, inv) => sum + Number(inv.amount), 0);

    const totalCount = invoices.length;
    const recoveredCount = invoices.filter((inv) => inv.status === 'recovered').length;
    const recoveryRate = totalCount > 0 ? ((recoveredCount / totalCount) * 100).toFixed(1) : '0';

    return { recovered, pendingAtRisk, totalCount, recoveredCount, recoveryRate };
  }, [invoices]);

  const formatCurrency = (val: number, cur: string = tenant?.currency || 'ZAR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
    }).format(val);
  };

  // 4. Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: passwordInput,
      });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email: emailInput,
        password: passwordInput,
      });
      if (error) setAuthError(error.message);
      else setAuthError('Account registered! You can now log in.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTenant(null);
    setInvoices([]);
  };

  // 5. Settings Save Handler (Upsert Tenant)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setSavingSettings(true);
    setSettingsNotification(null);

    try {
      if (tenant) {
        // Update existing tenant
        const { error } = await supabase
          .from('tenants')
          .update({
            business_name: settingsForm.business_name,
            support_email: settingsForm.support_email,
            currency: settingsForm.currency.toUpperCase(),
            paystack_public_key: settingsForm.paystack_public_key || null,
            paystack_secret_key: settingsForm.paystack_secret_key || null,
            resend_api_key: settingsForm.resend_api_key || null,
          })
          .eq('id', tenant.id);

        if (error) throw error;
        setSettingsNotification('Settings successfully saved.');
      } else {
        // Create initial tenant
        const { data, error } = await supabase
          .from('tenants')
          .insert({
            user_id: session.user.id,
            business_name: settingsForm.business_name,
            support_email: settingsForm.support_email,
            currency: settingsForm.currency.toUpperCase(),
            paystack_public_key: settingsForm.paystack_public_key || null,
            paystack_secret_key: settingsForm.paystack_secret_key || null,
            resend_api_key: settingsForm.resend_api_key || null,
          })
          .select()
          .single();

        if (error) throw error;
        setTenant(data);
        setSettingsNotification('Workspace created successfully.');
      }
      await fetchTenantData(session.user.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving settings';
      setSettingsNotification(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  const copyRecoveryLink = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/recover/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // ==========================================
  // VIEW: AUTH SCREEN (If Not Logged In)
  // ==========================================
  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-5 w-5 text-neutral-200" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium">Verifying founder session...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              DE
            </div>
            <div>
              <h1 className="text-base font-semibold text-neutral-100">DunningEngine</h1>
              <p className="text-xs text-neutral-500">Founder Authentication</p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="founder@saas.com"
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                {authError}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-neutral-100 hover:bg-white text-neutral-950 font-semibold py-2.5 rounded-xl text-sm transition"
            >
              {authMode === 'login' ? 'Sign In' : 'Create Founder Account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
              }}
              className="w-full text-center text-xs text-neutral-400 hover:text-neutral-200 transition"
            >
              {authMode === 'login'
                ? "Don't have a workspace? Register here"
                : 'Already registered? Sign in'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW: MAIN FOUNDER DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
      {/* Top Navigation */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
              DE
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight text-neutral-100">
                {tenant?.business_name || 'My SaaS'}
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">
                {tenant?.id ? `ID: ${tenant.id.slice(0, 8)}...` : 'Setup Pending'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === 'overview'
                    ? 'bg-neutral-800 text-neutral-100 shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === 'settings'
                    ? 'bg-neutral-800 text-neutral-100 shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Settings
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs text-neutral-400 hover:text-red-400 transition px-2 py-1"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'overview' ? (
          <div className="space-y-8">
            {/* KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Total Recovered Revenue
                </span>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-2">
                  {formatCurrency(metrics.recovered)}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Settled through automated dunning sequences
                </p>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Active Dunning Balance
                </span>
                <div className="text-2xl sm:text-3xl font-bold text-amber-400 mt-2">
                  {formatCurrency(metrics.pendingAtRisk)}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Currently retrying or awaiting customer update
                </p>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Recovery Success Rate
                </span>
                <div className="text-2xl sm:text-3xl font-bold text-neutral-100 mt-2">
                  {metrics.recoveryRate}%
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {metrics.recoveredCount} of {metrics.totalCount} failed invoices recovered
                </p>
              </div>
            </div>

            {/* Invoices Ledger */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-100">Failed Invoices Ledger</h2>
                  <p className="text-xs text-neutral-500">Live payment recovery stream</p>
                </div>
                {session?.user && (
                  <button
                    onClick={() => fetchTenantData(session.user.id)}
                    disabled={dataLoading}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition"
                  >
                    <span>{dataLoading ? 'Syncing...' : 'Refresh'}</span>
                  </button>
                )}
              </div>

              {invoices.length === 0 ? (
                <div className="p-12 text-center text-neutral-500 text-sm">
                  No failed payments logged yet. Webhook events received from Paystack will appear here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950/50 text-neutral-400 uppercase tracking-wider text-[11px] border-b border-neutral-800">
                      <tr>
                        <th className="py-3.5 px-4 font-medium">Customer</th>
                        <th className="py-3.5 px-4 font-medium">Amount</th>
                        <th className="py-3.5 px-4 font-medium">Attempts</th>
                        <th className="py-3.5 px-4 font-medium">Status</th>
                        <th className="py-3.5 px-4 font-medium">Last Attempt</th>
                        <th className="py-3.5 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-neutral-900/50 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-neutral-200">
                              {inv.customer_name || 'Customer'}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono">
                              {inv.customer_email}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-neutral-100">
                            {formatCurrency(Number(inv.amount), inv.currency)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-neutral-400">
                              {inv.attempt_count} / 4
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                inv.status === 'recovered'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : inv.status === 'retrying'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : inv.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-neutral-400">
                            {new Date(inv.last_attempt_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => copyRecoveryLink(inv.recovery_token)}
                              className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-medium transition"
                            >
                              {copiedToken === inv.recovery_token ? 'Copied!' : 'Copy Link'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ==========================================
             SETTINGS TAB: TENANT & API KEYS
             ========================================== */
          <div className="max-w-2xl bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-neutral-100">Workspace & Gateway Settings</h2>
              <p className="text-xs text-neutral-400">
                Configure your business billing credentials and gateway integration.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.business_name}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, business_name: e.target.value })
                    }
                    placeholder="Acme SaaS"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    required
                    value={settingsForm.support_email}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, support_email: e.target.value })
                    }
                    placeholder="support@acme.com"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Default Currency (ISO 4217)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  required
                  value={settingsForm.currency}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, currency: e.target.value.toUpperCase() })
                  }
                  placeholder="ZAR"
                  className="w-32 px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 font-mono uppercase focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="pt-4 border-t border-neutral-800 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Paystack Public Key
                  </label>
                  <input
                    type="text"
                    value={settingsForm.paystack_public_key}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, paystack_public_key: e.target.value })
                    }
                    placeholder="pk_live_... or pk_test_..."
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 font-mono focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Paystack Secret Key
                  </label>
                  <input
                    type="password"
                    value={settingsForm.paystack_secret_key}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, paystack_secret_key: e.target.value })
                    }
                    placeholder="sk_live_... or sk_test_..."
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 font-mono focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Resend API Key
                  </label>
                  <input
                    type="password"
                    value={settingsForm.resend_api_key}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, resend_api_key: e.target.value })
                    }
                    placeholder="re_..."
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 font-mono focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {settingsNotification && (
                <div className="p-3 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-xs text-neutral-200">
                  {settingsNotification}
                </div>
              )}

              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 font-semibold rounded-xl text-xs transition disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}