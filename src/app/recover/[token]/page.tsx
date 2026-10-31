'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Database, RecoveryStatus } from '@/types/database.types';

// Browser-safe Supabase Client (Anon Key)
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface InvoiceDetails {
  invoice_id: string;
  business_name: string;
  support_email: string;
  customer_email: string;
  customer_name: string | null;
  amount: number;
  currency: string;
  status: RecoveryStatus;
  is_expired: boolean;
  paystack_public_key: string | null;
}

export default function PaymentRecoveryPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 1. Fetch Invoice on Mount via Secure RPC
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    async function fetchInvoice() {
      try {
        const { data, error } = await supabase.rpc('get_recovery_invoice', {
          token_input: token,
        });

        if (error || !data || data.length === 0) {
          setInvoice(null);
        } else {
          const item = data[0];
          setInvoice(item);
          if (item.status === 'recovered') {
            setIsSuccess(true);
          }
        }
      } catch (err) {
        console.error('Failed to load invoice details:', err);
        setInvoice(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvoice();
  }, [token]);

  // 2. Format Currency
  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'ZAR',
    }).format(amount);
  };

  // 3. Paystack Inline Checkout Trigger
  const handlePaystackPayment = async () => {
    if (!invoice || !invoice.paystack_public_key) {
      setErrorMessage('Payment gateway is currently unconfigured. Please contact support.');
      return;
    }

    setErrorMessage(null);
    setIsProcessingPayment(true);

    try {
      // Lazy load @paystack/inline-js in browser only to eliminate window/SSR mismatches
      const PaystackPop = (await import('@paystack/inline-js')).default;
      const popup = new PaystackPop();

      // Paystack amounts are in subunits (e.g., 100.00 ZAR = 10000 kobo/cents)
      const subunitAmount = Math.round(invoice.amount * 100);

      popup.newTransaction({
        key: invoice.paystack_public_key,
        email: invoice.customer_email,
        amount: subunitAmount,
        currency: invoice.currency,
        onSuccess: async (tx: { reference: string }) => {
          try {
            const res = await fetch('/api/recover/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, reference: tx.reference }),
            });

            if (!res.ok) {
              const resData = await res.json();
              throw new Error(resData.error || 'Failed to update invoice record');
            }

            startTransition(() => {
              setIsSuccess(true);
              setIsProcessingPayment(false);
            });
          } catch (confirmErr: unknown) {
            const msg = confirmErr instanceof Error ? confirmErr.message : 'Confirmation error';
            setErrorMessage(`Payment succeeded but failed to sync: ${msg}. Please reach out to support.`);
            setIsProcessingPayment(false);
          }
        },
        onCancel: () => {
          setIsProcessingPayment(false);
        },
      });
    } catch (popupErr: unknown) {
      console.error('Paystack initialization error:', popupErr);
      setErrorMessage('Could not open payment window. Please try again or disable your popup blocker.');
      setIsProcessingPayment(false);
    }
  };

  // ==========================================
  // STATE 1: LOADING SKELETON
  // ==========================================
  if (isLoading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl animate-pulse">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-neutral-800 rounded-xl"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-neutral-800 rounded w-1/3"></div>
              <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
            </div>
          </div>
          <div className="h-28 bg-neutral-800/60 rounded-xl mb-6"></div>
          <div className="space-y-3 mb-8">
            <div className="h-4 bg-neutral-800 rounded w-full"></div>
            <div className="h-4 bg-neutral-800 rounded w-4/5"></div>
          </div>
          <div className="h-12 bg-neutral-800 rounded-xl w-full"></div>
        </div>
      </main>
    );
  }

  // ==========================================
  // STATE 2: EXPIRED OR INVALID TOKEN
  // ==========================================
  if (!invoice || invoice.is_expired) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl mx-auto flex items-center justify-center mb-5">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100 mb-2">
            {invoice?.is_expired ? 'Recovery Link Expired' : 'Invalid Payment Link'}
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed mb-6">
            {invoice?.is_expired
              ? 'This recovery link has expired for your security. Please request a new link or contact the billing team.'
              : 'This payment authorization link is invalid or no longer active. Check your email for the latest notification.'}
          </p>
          {invoice?.support_email ? (
            <a
              href={`mailto:${invoice.support_email}`}
              className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition"
            >
              Contact {invoice.business_name || 'Support'}
            </a>
          ) : (
            <div className="text-xs text-neutral-500">
              Please contact the service provider directly.
            </div>
          )}
        </div>
      </main>
    );
  }

  // ==========================================
  // STATE 3: PAYMENT ALREADY RECOVERED / SUCCESS CONFIRMATION
  // ==========================================
  if (isSuccess || invoice.status === 'recovered') {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center mb-5">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
            Payment Settled
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100 mb-2">
            Payment Recovered!
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed mb-6">
            Thank you, <span className="text-neutral-200 font-medium">{invoice.customer_name || invoice.customer_email}</span>. 
            Your invoice of <strong className="text-neutral-100">{formatAmount(invoice.amount, invoice.currency)}</strong> with{' '}
            <strong className="text-neutral-100">{invoice.business_name}</strong> is completely settled. Your subscription access remains uninterrupted.
          </p>
          <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-left mb-6 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-500">Billed to</span>
              <span className="text-neutral-300 font-mono">{invoice.customer_email}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-neutral-500">Status</span>
              <span className="text-emerald-400 font-medium">Active / Good Standing</span>
            </div>
          </div>
          <a
            href={`mailto:${invoice.support_email}`}
            className="text-xs text-neutral-500 hover:text-neutral-400 underline transition"
          >
            Need an invoice receipt? Contact billing
          </a>
        </div>
      </main>
    );
  }

  // ==========================================
  // STATE 4: ACTIVE RECOVERY / PAYSTACK INLINE FORM
  // ==========================================
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {/* Merchant Header */}
        <div className="flex items-center justify-between pb-6 border-b border-neutral-800 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {invoice.business_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100 leading-tight">
                {invoice.business_name}
              </h2>
              <span className="text-xs text-neutral-500">Payment Recovery Portal</span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Payment Overdue
          </span>
        </div>

        {/* Amount Due Card */}
        <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-5 mb-6 text-center">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
            Outstanding Balance
          </span>
          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1">
            {formatAmount(invoice.amount, invoice.currency)}
          </div>
          <p className="text-xs text-neutral-400 mt-2">
            Subscription charge for <span className="text-neutral-200">{invoice.customer_email}</span>
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start space-x-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Paystack Inline Action Button */}
        <button
          onClick={handlePaystackPayment}
          disabled={isProcessingPayment}
          className="w-full relative group overflow-hidden bg-white hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-60 disabled:hover:bg-white text-neutral-950 font-semibold py-3.5 px-6 rounded-xl transition duration-150 shadow-lg flex items-center justify-center space-x-2 text-sm"
        >
          {isProcessingPayment ? (
            <>
              <svg className="animate-spin h-4 w-4 text-neutral-950" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Connecting to Paystack...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-neutral-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span>Pay {formatAmount(invoice.amount, invoice.currency)} Now</span>
            </>
          )}
        </button>

        {/* Security & Support Guarantee */}
        <div className="mt-6 pt-5 border-t border-neutral-800 text-center space-y-2">
          <div className="flex items-center justify-center space-x-1.5 text-[11px] text-neutral-400">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>256-bit SSL encrypted • Powered by Paystack</span>
          </div>
          <p className="text-[11px] text-neutral-500">
            Questions? Contact{' '}
            <a
              href={`mailto:${invoice.support_email}`}
              className="text-neutral-400 hover:text-white underline transition"
            >
              {invoice.support_email}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}