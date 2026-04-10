import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import axios from "axios";
import {
  CreditCard, Check, Zap, Clock, Calendar, Star, Shield, ChevronLeft, Loader2, X,
  DollarSign, ArrowRight
} from "lucide-react";
import { PaymentForm, CreditCard as SquareCard } from "react-square-web-payments-sdk";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const SQUARE_APP_ID = process.env.REACT_APP_SQUARE_APP_ID;
const SQUARE_LOCATION_ID = process.env.REACT_APP_SQUARE_LOCATION_ID;
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || "sb";

export default function SubscriptionPage() {
  const [plans, setPlans] = useState([]);
  const [subStatus, setSubStatus] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, statusRes, txRes, userRes] = await Promise.all([
        axios.get(`${API}/payments/plans`),
        axios.get(`${API}/payments/subscription/status`),
        axios.get(`${API}/payments/transactions`),
        axios.get(`${API}/users/me`),
      ]);
      setPlans(plansRes.data);
      setSubStatus(statusRes.data);
      setTransactions(txRes.data);
      setUser(userRes.data);
    } catch {
      toast.error("Failed to load subscription data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSquarePayment = async (token) => {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const res = await axios.post(`${API}/payments/square/pay`, {
        source_id: token.token,
        plan: selectedPlan.id,
        verification_token: token.verificationToken || undefined,
      });
      toast.success(res.data.message || "Payment successful!");
      setShowPayment(false);
      setSelectedPlan(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
    }
    setPaying(false);
  };

  const handleCashApp = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const res = await axios.post(`${API}/payments/cashapp/pay`, { plan: selectedPlan.id });
      toast.success(res.data.message);
      setShowPayment(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "CashApp payment failed");
    }
    setPaying(false);
  };

  // PayPal SDK loader + render
  const paypalContainerRef = useRef(null);
  const paypalRendered = useRef(false);

  useEffect(() => {
    if (!showPayment || !selectedPlan || paypalRendered.current) return;
    // Load PayPal SDK script if not already loaded
    const existing = document.querySelector('script[src*="paypal.com/sdk/js"]');
    const render = () => {
      if (!paypalContainerRef.current || !window.paypal) return;
      paypalContainerRef.current.innerHTML = "";
      paypalRendered.current = true;
      window.paypal.Buttons({
        style: { layout: "horizontal", color: "blue", shape: "pill", label: "paypal", height: 45 },
        createOrder: (_data, actions) => actions.order.create({
          purchase_units: [{ amount: { value: String(selectedPlan.amount) }, description: `PunchListJobs ${selectedPlan.id} plan` }],
        }),
        onApprove: async (_data, actions) => {
          const order = await actions.order.capture();
          setPaying(true);
          try {
            const res = await axios.post(`${API}/payments/paypal/pay`, {
              plan: selectedPlan.id,
              order_id: order.id,
            });
            toast.success(res.data.message || "PayPal payment successful!");
            setShowPayment(false);
            setSelectedPlan(null);
            fetchData();
          } catch (err) {
            toast.error(err.response?.data?.detail || "PayPal payment failed");
          }
          setPaying(false);
        },
        onError: () => toast.error("PayPal encountered an error"),
      }).render(paypalContainerRef.current);
    };
    if (existing && window.paypal) { render(); }
    else if (!existing) {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
      s.async = true;
      s.onload = render;
      document.body.appendChild(s);
    }
  }, [showPayment, selectedPlan, fetchData]);

  // Reset paypal render flag when modal closes
  useEffect(() => { if (!showPayment) paypalRendered.current = false; }, [showPayment]);

  const handleRedeemPoints = async () => {
    setPaying(true);
    try {
      const res = await axios.post(`${API}/payments/points/redeem`);
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Redemption failed");
    }
    setPaying(false);
  };

  const planIcons = { daily: Clock, weekly: Calendar, monthly: Star, annual: Shield };
  const planColors = {
    daily: "from-slate-500 to-slate-600",
    weekly: "from-blue-500 to-blue-600",
    monthly: "from-[#0000FF] to-blue-700",
    annual: "from-amber-500 to-amber-600",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#0000FF]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a1a]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#050A30] to-[#0000FF] text-white py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <a href="/" className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm mb-4">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </a>
          <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ fontFamily: "Manrope, sans-serif" }}>
            Subscription Plans
          </h1>
          <p className="text-white/70 mt-2">Unlock all features and grow your business</p>
          {subStatus?.is_paid && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-sm">
              <Check className="w-4 h-4 text-green-400" />
              <span>Active: <strong className="capitalize">{subStatus.plan}</strong> plan</span>
              <span className="text-white/50">• Expires {new Date(subStatus.end_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {plans.map((plan) => {
            const Icon = planIcons[plan.id] || Zap;
            const isCurrentPlan = subStatus?.plan === plan.id && subStatus?.is_paid;
            const colorClass = planColors[plan.id] || "from-slate-500 to-slate-600";
            return (
              <div
                key={plan.id}
                data-testid={`plan-card-${plan.id}`}
                onClick={() => { if (!isCurrentPlan) { setSelectedPlan(plan); setShowPayment(true); } }}
                className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl ${
                  isCurrentPlan ? "ring-2 ring-green-500" : selectedPlan?.id === plan.id ? "ring-2 ring-[#0000FF]" : ""
                }`}
              >
                <div className={`bg-gradient-to-br ${colorClass} p-5 text-white`}>
                  <Icon className="w-8 h-8 mb-3 opacity-80" />
                  <h3 className="font-extrabold text-lg capitalize" style={{ fontFamily: "Manrope, sans-serif" }}>{plan.id}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">${plan.amount}</span>
                    <span className="text-white/70 text-sm">/ {plan.days} day{plan.days > 1 ? "s" : ""}</span>
                  </div>
                  {isCurrentPlan && (
                    <div className="mt-3 bg-white/20 rounded-lg px-3 py-1 text-xs font-semibold inline-block">
                      Current Plan
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Points Redemption */}
        {user && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-10" data-testid="points-redemption-card">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Redeem Points
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  You have <strong className="text-[#0000FF]">{user.points || 0}</strong> points. 500 points = 1 day subscription.
                </p>
              </div>
              <button
                onClick={handleRedeemPoints}
                disabled={paying || (user.points || 0) < 500}
                className="px-5 py-2.5 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                data-testid="redeem-points-btn"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Redeem 500 pts
              </button>
            </div>
          </div>
        )}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="transaction-history">
            <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
              Payment History
            </h3>
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      tx.status === "completed" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                    }`}>
                      {tx.status === "completed" ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">{tx.plan} Plan</p>
                      <p className="text-xs text-slate-400">{tx.payment_method} • {new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-700 dark:text-white">${tx.amount}</p>
                    <p className={`text-xs font-semibold ${tx.status === "completed" ? "text-green-500" : "text-amber-500"}`}>
                      {tx.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && selectedPlan && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" data-testid="payment-modal">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => { setShowPayment(false); setSelectedPlan(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h3 className="font-extrabold text-xl text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                Subscribe to {selectedPlan.id} plan
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                ${selectedPlan.amount} for {selectedPlan.days} day{selectedPlan.days > 1 ? "s" : ""}
              </p>
            </div>

            {/* Square Card Payment */}
            <div className="mb-5">
              <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Pay with Card
              </h4>
              <PaymentForm
                applicationId={SQUARE_APP_ID}
                locationId={SQUARE_LOCATION_ID}
                cardTokenizeResponseReceived={handleSquarePayment}
                createPaymentRequest={() => ({
                  countryCode: "US",
                  currencyCode: "USD",
                  total: { amount: String(selectedPlan.amount), label: `PunchListJobs ${selectedPlan.id} plan` },
                })}
              >
                <SquareCard />
              </PaymentForm>
            </div>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-700" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-slate-900 px-2 text-slate-400">or</span></div>
            </div>

            {/* CashApp */}
            <button
              onClick={handleCashApp}
              disabled={paying}
              className="w-full py-3 rounded-xl font-bold text-white bg-[#00D632] hover:bg-[#00b82b] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              data-testid="cashapp-pay-btn"
            >
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              Pay with CashApp (${selectedPlan.amount})
            </button>
            <p className="text-xs text-slate-400 text-center mt-2">CashApp payments require admin verification</p>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-700" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-slate-900 px-2 text-slate-400">or</span></div>
            </div>

            {/* PayPal */}
            <div ref={paypalContainerRef} data-testid="paypal-button-container" className="min-h-[50px]" />
          </div>
        </div>
      )}
    </div>
  );
}
