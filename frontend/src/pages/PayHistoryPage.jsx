import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import axios from "axios";
import { toast } from "sonner";
import { DollarSign, Calendar, TrendingUp, Check, Clock, User } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const METHOD_COLORS = {
  square: "bg-blue-100 text-blue-700",
  paypal: "bg-yellow-100 text-yellow-700",
  cashapp: "bg-green-100 text-green-700",
  points: "bg-purple-100 text-purple-700",
};

function TotalCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
        ${value.toFixed(2)}
      </p>
    </div>
  );
}

export default function PayHistoryPage() {
  const { user } = useAuth();
  const isAdmin = ["admin", "superadmin"].includes(user?.role);

  const [data, setData] = useState({ transactions: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("");

  useEffect(() => {
    const url = isAdmin
      ? `${API}/admin/payments/history`
      : `${API}/payments/history`;

    axios.get(url)
      .then(r => setData(r.data))
      .catch(() => toast.error("Failed to load payment history"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const filtered = data.transactions.filter(tx => {
    const matchSearch = !search ||
      tx.plan?.toLowerCase().includes(search.toLowerCase()) ||
      tx.payment_method?.toLowerCase().includes(search.toLowerCase()) ||
      tx.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      tx.user_email?.toLowerCase().includes(search.toLowerCase());
    const matchMethod = !filterMethod || tx.payment_method === filterMethod;
    return matchSearch && matchMethod;
  });

  return (
    <div className="min-h-screen bg-[#050A30]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>
            Payment History
          </h1>
          <p className="text-slate-400 text-sm">
            {isAdmin ? "All platform transactions" : "Your subscription payments"}
          </p>
        </div>

        {/* Totals */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7EC8E3]" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <TotalCard label="Today"        value={data.totals.daily   || 0} icon={Calendar}   color="bg-blue-100 text-blue-600" />
              <TotalCard label="This Week"    value={data.totals.weekly  || 0} icon={TrendingUp}  color="bg-green-100 text-green-600" />
              <TotalCard label="This Month"   value={data.totals.monthly || 0} icon={DollarSign}  color="bg-purple-100 text-purple-600" />
              <TotalCard label="This Year"    value={data.totals.yearly  || 0} icon={TrendingUp}  color="bg-amber-100 text-amber-600" />
            </div>

            {/* All-time total */}
            <div className="bg-gradient-to-r from-[#0000FF] to-[#000C66] rounded-2xl p-5 mb-8 flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm font-medium">All-Time Revenue</p>
                <p className="text-white text-3xl font-extrabold" style={{ fontFamily: "Manrope, sans-serif" }}>
                  ${(data.totals.all_time || 0).toFixed(2)}
                </p>
              </div>
              <DollarSign className="w-12 h-12 text-white opacity-30" />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <input
                type="text"
                placeholder={isAdmin ? "Search by user, plan, method…" : "Search by plan or method…"}
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="pay-history-search"
                className="flex-1 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-white text-sm focus:outline-none"
              />
              <select
                value={filterMethod}
                onChange={e => setFilterMethod(e.target.value)}
                data-testid="pay-history-method-filter"
                className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-white text-sm focus:outline-none"
              >
                <option value="">All Methods</option>
                <option value="square">Square</option>
                <option value="paypal">PayPal</option>
                <option value="cashapp">CashApp</option>
                <option value="points">Points</option>
              </select>
            </div>

            {/* Transactions Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No transactions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pay-history-table">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                        {isAdmin && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">User</th>}
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Plan</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Method</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Amount</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(tx => (
                        <tr key={tx.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <div>
                                  <p className="font-medium text-slate-700 dark:text-white text-xs">{tx.user_name}</p>
                                  <p className="text-slate-400 text-xs">{tx.user_email}</p>
                                </div>
                              </div>
                            </td>
                          )}
                          <td className="px-5 py-3 capitalize text-slate-700 dark:text-white font-medium">{tx.plan}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${METHOD_COLORS[tx.payment_method] || "bg-slate-100 text-slate-600"}`}>
                              {tx.payment_method}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-bold text-slate-700 dark:text-white">${tx.amount}</td>
                          <td className="px-5 py-3">
                            {tx.status === "completed" ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                                <Check className="w-3.5 h-3.5" /> Completed
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
                                <Clock className="w-3.5 h-3.5" /> Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-slate-500 text-xs text-right mt-3">
              {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
