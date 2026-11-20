'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigate } from '@/lib/router';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { bootstrap } from '@/store/thunks';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui';

type Phase = 'verifying' | 'approved' | 'failed';
type Kind = 'payment' | 'card';

/**
 * Landing page Paystack redirects the tenant back to. Confirms the transaction
 * server-side (the webhook is the backstop), then routes on.
 */
export function PortalPayCallback() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const [phase, setPhase] = useState<Phase>('verifying');
  const [message, setMessage] = useState('Confirming your payment with Paystack…');
  const [kind, setKind] = useState<Kind>('payment');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!reference) {
      setPhase('failed');
      setMessage('No payment reference was returned.');
      return;
    }

    (async () => {
      try {
        const res = await api.paystackVerify(reference);

        // A card-setup checkout for auto-debit rather than an invoice payment.
        if (res.autoDebit) {
          setKind('card');
          if (res.autoDebit.status === 'approved') {
            setPhase('approved');
            setMessage(`Auto-debit is on${res.autoDebit.card ? ` — ${res.autoDebit.card.label} will be charged on each due date` : ''}. The ₦50 check is being refunded.`);
          } else {
            setPhase('failed');
            setMessage(res.autoDebit.message || 'We couldn’t save that card.');
          }
          return;
        }

        if (res.status === 'approved') {
          setPhase('approved');
          setMessage('Payment received — your balance has been updated.');
          void dispatch(bootstrap());
        } else {
          setPhase('failed');
          setMessage('This payment wasn’t completed. You can try again from your bills.');
        }
      } catch (err) {
        setPhase('failed');
        setMessage(err instanceof ApiError ? err.message : 'We couldn’t confirm this payment.');
      }
    })();
  }, [reference, dispatch]);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Payment" />
      <Card className="flex flex-col items-center gap-4 py-12 text-center">
        {phase === 'verifying' && <Loader2 className="h-10 w-10 animate-spin text-brand-500" />}
        {phase === 'approved' && <CheckCircle2 className="h-10 w-10 text-brand-600" />}
        {phase === 'failed' && <XCircle className="h-10 w-10 text-red-500" />}

        <div>
          <p className="text-lg font-bold text-ink-900">
            {phase === 'verifying' ? 'Verifying…' : phase === 'approved' ? (kind === 'card' ? 'Auto-debit is on' : 'Payment successful') : (kind === 'card' ? 'Card not saved' : 'Payment not completed')}
          </p>
          <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>
        </div>

        {phase !== 'verifying' && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {kind === 'card' ? (
              <button className="btn-primary" onClick={() => navigate('/portal/pay')}>Back to payments</button>
            ) : (
              <>
                <button className="btn-primary" onClick={() => navigate('/portal/payments')}>View payment history</button>
                <button className="btn-secondary" onClick={() => navigate('/portal/bills')}>Back to bills</button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
