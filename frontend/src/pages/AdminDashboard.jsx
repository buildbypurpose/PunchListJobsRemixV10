import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import WysiwygEditor from "../components/WysiwygEditor";
import { toast } from "sonner";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import {
  Users, ClipboardList, DollarSign, TrendingUp, Shield, Settings, FileText,
  Edit, Trash2, Check, X, Search, ChevronLeft, ChevronRight,
  PlusCircle, Download, Upload, Key, BookOpen, HelpCircle, Info,
  UserPlus, Star, ChevronDown, ChevronUp, Pause, Play, Ban, Award, MessageCircle
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BASE_TABS = [
  "Overview", "Users", "Jobs", "Payments", "Top Performers",
  "Settings", "Logs", "CMS", "Coupons", "Trades"
];

const CMS_PAGES = [
  { slug: "terms",                icon: FileText,    label: "Terms & Conditions" },
  { slug: "privacy",              icon: Shield,      label: "Privacy Policy" },
  { slug: "community-guidelines", icon: Users,       label: "Community Guidelines" },
  { slug: "about",                icon: Info,        label: "About" },
  { slug: "faqs",                 icon: HelpCircle,  label: "FAQs" },
  { slug: "what-is-a-punch-list", icon: BookOpen,    label: "What is a Punch List?" },
];

const PIE_COLORS = ["#0000FF", "#7EC8E3", "#10B981", "#F59E0B"];

const JOB_STATUS_COLORS = {
  open:        "bg-green-100 text-green-700",
  fulfilled:   "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed:   "bg-emerald-100 text-emerald-700",
  suspended:   "bg-orange-100 text-orange-700",
  cancelled:   "bg-red-100 text-red-600",
  archived:    "bg-slate-100 text-slate-500",
  draft:       "bg-purple-100 text-purple-700",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "superadmin";
  const isAdminRole  = user?.role === "admin";
  const TABS = [
    ...BASE_TABS,
    ...(isAdminRole   ? ["SubAdmins"] : []),
    ...(isSuperAdmin  ? ["SubAdmins", "Admins"] : []),
  ];

  const [tab, setTab]                   = useState("Overview");
  const [analytics, setAnalytics]       = useState(null);
  const [users, setUsers]               = useState([]);
  const [jobs, setJobs]                 = useState([]);
  const [payments, setPayments]         = useState([]);
  const [settings, setSettings]         = useState(null);
  const [userSearch, setUserSearch]     = useState("");
  const [userPage, setUserPage]         = useState(1);
  const [userTotal, setUserTotal]       = useState(0);
  const [editSettings, setEditSettings] = useState({});
  const [loading, setLoading]           = useState(true);

  // Admin / SubAdmin management
  const [admins, setAdmins]                         = useState([]);
  const [showCreateAdmin, setShowCreateAdmin]       = useState(false);
  const [newAdmin, setNewAdmin]                     = useState({ name: "", email: "", password: "" });
  const [subadmins, setSubadmins]                   = useState([]);
  const [showCreateSubadmin, setShowCreateSubadmin] = useState(false);
  const [newSubadmin, setNewSubadmin]               = useState({ name: "", email: "", password: "" });

  // Password reset
  const [resetUserId, setResetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  // Import
  const importRef = useRef(null);

  // Logs
  const [logs, setLogs]             = useState([]);
  const [logPage, setLogPage]       = useState(1);
  const [logTotal, setLogTotal]     = useState(0);
  const [logCategory, setLogCategory] = useState("");

  // CMS
  const [cmsPages, setCmsPages]         = useState([]);
  const [activeCmsSlug, setActiveCmsSlug] = useState("terms");
  const [cmsForm, setCmsForm]           = useState({ title: "", header_text: "", content: "", youtube_url: "" });

  // Coupons
  const [coupons, setCoupons]           = useState([]);
  const [couponForm, setCouponForm]     = useState({ code: "", type: "percent", value: "", max_uses: "", expires_at: "", plan_restriction: "" });
  const [editCouponId, setEditCouponId] = useState(null);
  const [editCouponForm, setEditCouponForm] = useState({});

  // Trades
  const [tradeCategories, setTradeCategories] = useState([]);
  const [trades, setTrades]                   = useState([]);
  const [selectedCatId, setSelectedCatId]     = useState(null);
  const [tradeForm, setTradeForm]             = useState({ name: "", category_id: "" });
  const [catForm, setCatForm]                 = useState({ name: "" });
  const [editCat, setEditCat]                 = useState(null);
  const [editTrade, setEditTrade]             = useState(null);

  // Edit / create user
  const [editUser, setEditUser]           = useState(null);
  const [editUserForm, setEditUserForm]   = useState({});
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser]             = useState({ name: "", email: "", password: "", role: "crew" });

  // Jobs
  const [jobStatusFilter, setJobStatusFilter] = useState("");

  // Payments by user
  const [paymentsByUser, setPaymentsByUser]   = useState([]);
  const [expandedPayUser, setExpandedPayUser] = useState(null);

  // Top performers
  const [topPerformers, setTopPerformers] = useState(null);

  // ─── Fetch Functions ──────────────────────────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    const res = await axios.get(`${API}/admin/analytics`);
    setAnalytics(res.data);
  }, []);

  const fetchUsers = useCallback(async (page = 1, search = "") => {
    const params = new URLSearchParams({ page, limit: 15 });
    if (search) params.append("search", search);
    const res = await axios.get(`${API}/admin/users?${params}`);
    setUsers(res.data.users);
    setUserTotal(res.data.total);
  }, []);

  const fetchJobs = useCallback(async (statusFilter = "") => {
    const qs = statusFilter ? `?status=${statusFilter}&limit=100` : "?limit=100";
    const res = await axios.get(`${API}/admin/jobs${qs}`);
    setJobs(res.data.jobs || []);
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await axios.get(`${API}/admin/settings`);
    setSettings(res.data);
    setEditSettings(res.data);
  }, []);

  const fetchPaymentsByUser = useCallback(async () => {
    const res = await axios.get(`${API}/admin/payments/by-user`);
    setPaymentsByUser(res.data);
  }, []);

  const fetchAdmins = useCallback(async () => {
    const res = await axios.get(`${API}/admin/admins`);
    setAdmins(res.data.admins || []);
  }, []);

  const fetchSubadmins = useCallback(async () => {
    const res = await axios.get(`${API}/admin/subadmins`);
    setSubadmins(res.data.subadmins || []);
  }, []);

  const fetchLogs = useCallback(async (page = 1, category = "") => {
    const params = new URLSearchParams({ page, limit: 50 });
    if (category) params.append("category", category);
    const res = await axios.get(`${API}/admin/activity-logs?${params}`);
    setLogs(res.data.logs || []);
    setLogTotal(res.data.total || 0);
  }, []);

  const fetchCmsPages = useCallback(async () => {
    const res = await axios.get(`${API}/cms/pages`);
    setCmsPages(res.data || []);
    const first = (res.data || [])[0];
    if (first) {
      setActiveCmsSlug(first.slug);
      setCmsForm({ title: first.title, header_text: first.header_text || "", content: first.content || "", youtube_url: first.youtube_url || "" });
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    const res = await axios.get(`${API}/coupons`);
    setCoupons(res.data || []);
  }, []);

  const fetchTradeCategories = useCallback(async () => {
    const res = await axios.get(`${API}/trades/admin/categories`);
    setTradeCategories(res.data.categories || []);
  }, []);

  const fetchTrades = useCallback(async (catId = null) => {
    const url = catId ? `${API}/trades/admin/trades?category_id=${catId}` : `${API}/trades/admin/trades`;
    const res = await axios.get(url);
    setTrades(res.data.trades || []);
  }, []);

  const fetchTopPerformers = useCallback(async () => {
    const res = await axios.get(`${API}/admin/top-performers`);
    setTopPerformers(res.data);
  }, []);

  // ─── Action Functions ─────────────────────────────────────────────────────

  const createAdmin = async () => {
    if (!newAdmin.name || !newAdmin.email || !newAdmin.password) { toast.error("Name, email, and password are required"); return; }
    try {
      await axios.post(`${API}/admin/admins`, newAdmin);
      toast.success("Admin account created!");
      setNewAdmin({ name: "", email: "", password: "" });
      setShowCreateAdmin(false);
      fetchAdmins();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create admin"); }
  };

  const suspendAdmin = async (adminId, isActive) => {
    await axios.post(`${API}/admin/admins/${adminId}/${isActive ? "suspend" : "activate"}`);
    toast.success(isActive ? "Admin suspended" : "Admin activated");
    fetchAdmins();
  };

  const deleteAdmin = async (adminId) => {
    if (!window.confirm("Delete this admin account?")) return;
    await axios.delete(`${API}/admin/admins/${adminId}`);
    toast.success("Admin deleted");
    fetchAdmins();
  };

  const createSubadmin = async () => {
    if (!newSubadmin.name || !newSubadmin.email || !newSubadmin.password) { toast.error("Name, email, and password are required"); return; }
    try {
      await axios.post(`${API}/admin/subadmins`, newSubadmin);
      toast.success("SubAdmin account created!");
      setNewSubadmin({ name: "", email: "", password: "" });
      setShowCreateSubadmin(false);
      fetchSubadmins();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create subadmin"); }
  };

  const suspendSubadmin = async (id, isActive) => {
    await axios.post(`${API}/admin/subadmins/${id}/${isActive ? "suspend" : "activate"}`);
    toast.success(isActive ? "SubAdmin suspended" : "SubAdmin activated");
    fetchSubadmins();
  };

  const deleteSubadmin = async (id) => {
    if (!window.confirm("Delete this subadmin account?")) return;
    await axios.delete(`${API}/admin/subadmins/${id}`);
    toast.success("SubAdmin deleted");
    fetchSubadmins();
  };

  const submitPasswordReset = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    try {
      await axios.post(`${API}/admin/users/${resetUserId}/reset-password`, { new_password: newPassword });
      toast.success("Password reset successfully");
      setResetUserId(null);
      setNewPassword("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to reset password"); }
  };

  const exportUsers = (format = "csv") => {
    if (format === "json") {
      window.open(`${API}/admin/users/export-json`, "_blank");
    } else {
      window.open(`${API}/admin/users/export`, "_blank");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/admin/users/import`, form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Import done: ${res.data.created} created, ${res.data.updated} updated`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} row(s) had errors`);
      fetchUsers(userPage, userSearch);
    } catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    e.target.value = "";
  };

  const exportLogs = () => {
    const cat = logCategory ? `?category=${logCategory}` : "";
    window.open(`${API}/admin/activity-logs/export${cat}`, "_blank");
  };

  const saveCmsPage = async () => {
    try {
      await axios.put(`${API}/cms/pages/${activeCmsSlug}`, cmsForm);
      toast.success("Page saved");
      setCmsPages(p => p.map(pg => pg.slug === activeCmsSlug ? { ...pg, ...cmsForm } : pg));
    } catch (e) { toast.error("Failed to save page"); }
  };

  const createCoupon = async () => {
    if (!couponForm.code || !couponForm.value) { toast.error("Code and value are required"); return; }
    try {
      await axios.post(`${API}/coupons`, {
        ...couponForm,
        value: Number(couponForm.value),
        max_uses: couponForm.max_uses ? Number(couponForm.max_uses) : null,
        expires_at: couponForm.expires_at || null,
        plan_restriction: couponForm.plan_restriction || null,
      });
      toast.success("Coupon created");
      setCouponForm({ code: "", type: "percent", value: "", max_uses: "", expires_at: "", plan_restriction: "" });
      fetchCoupons();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create coupon"); }
  };

  const toggleCoupon = async (id) => {
    await axios.patch(`${API}/coupons/${id}/toggle`);
    fetchCoupons();
  };

  const deleteCoupon = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;
    await axios.delete(`${API}/coupons/${id}`);
    toast.success("Coupon deleted");
    fetchCoupons();
  };

  const openEditCoupon = (c) => {
    setEditCouponId(c.id);
    setEditCouponForm({
      code: c.code,
      type: c.type,
      value: c.value,
      max_uses: c.max_uses ?? "",
      expires_at: c.expires_at ?? "",
      plan_restriction: c.plan_restriction ?? "",
    });
  };

  const saveEditCoupon = async () => {
    try {
      await axios.patch(`${API}/coupons/${editCouponId}`, {
        ...editCouponForm,
        value: Number(editCouponForm.value),
        max_uses: editCouponForm.max_uses ? Number(editCouponForm.max_uses) : null,
        expires_at: editCouponForm.expires_at || null,
        plan_restriction: editCouponForm.plan_restriction || null,
      });
      toast.success("Coupon updated");
      setEditCouponId(null);
      setEditCouponForm({});
      fetchCoupons();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to update coupon"); }
  };

  const suspendUser = async (userId, isActive) => {
    await axios.post(`${API}/admin/users/${userId}/${isActive ? "suspend" : "activate"}`);
    toast.success(isActive ? "User suspended" : "User activated");
    fetchUsers(userPage, userSearch);
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    await axios.delete(`${API}/admin/users/${userId}`);
    toast.success("User deleted");
    fetchUsers(userPage, userSearch);
  };

  const openEditUser = (u) => {
    setEditUser(u);
    setEditUserForm({
      name: u.name || "",
      email: u.email || "",
      role: u.role || "crew",
      subscription_status: u.subscription_status || "free",
      is_active: u.is_active !== false,
    });
  };

  const saveEditUser = async () => {
    try {
      await axios.put(`${API}/admin/users/${editUser.id}`, editUserForm);
      toast.success("User updated");
      setEditUser(null);
      fetchUsers(userPage, userSearch);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to update user"); }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) { toast.error("Name, email, and password are required"); return; }
    try {
      await axios.post(`${API}/admin/users`, newUser);
      toast.success("User created!");
      setNewUser({ name: "", email: "", password: "", role: "crew" });
      setShowCreateUser(false);
      fetchUsers(userPage, userSearch);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create user"); }
  };

  const adminJobAction = async (jobId, action) => {
    try {
      if (action === "delete") {
        if (!window.confirm("Permanently delete this job?")) return;
        await axios.delete(`${API}/admin/jobs/${jobId}`);
      } else {
        await axios.post(`${API}/jobs/${jobId}/${action}`);
      }
      toast.success(`Job ${action}d successfully`);
      fetchJobs(jobStatusFilter);
    } catch (e) { toast.error(e?.response?.data?.detail || `Failed to ${action} job`); }
  };

  const saveSettings = async () => {
    await axios.put(`${API}/admin/settings`, editSettings);
    toast.success("Settings saved");
    setSettings(editSettings);
  };

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await fetchAnalytics();
        if (tab === "Users")          await fetchUsers(userPage, userSearch);
        if (tab === "Jobs")           await fetchJobs(jobStatusFilter);
        if (tab === "Settings")       await fetchSettings();
        if (tab === "Payments")       await fetchPaymentsByUser();
        if (tab === "Admins")         await fetchAdmins();
        if (tab === "SubAdmins")      await fetchSubadmins();
        if (tab === "Logs")           await fetchLogs(logPage, logCategory);
        if (tab === "CMS")            await fetchCmsPages();
        if (tab === "Coupons")        await fetchCoupons();
        if (tab === "Trades")         { await fetchTradeCategories(); await fetchTrades(); }
        if (tab === "Top Performers") await fetchTopPerformers();
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [tab, userPage]); // eslint-disable-line

  const statCards = analytics ? [
    { label: "Total Users",    value: analytics.total_users,                   icon: Users,      color: "#0000FF", bg: "#EEF2FF" },
    { label: "Active Jobs",    value: analytics.active_jobs,                   icon: ClipboardList,  color: "#10B981", bg: "#ECFDF5" },
    { label: "Completed Jobs", value: analytics.completed_jobs,                icon: TrendingUp, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "Revenue",        value: `$${analytics.total_revenue?.toFixed(2)}`, icon: DollarSign, color: "#8B5CF6", bg: "#F5F3FF" },
  ] : [];

  const metricsCards = analytics ? [
    { label: "Crew Utilization", value: `${analytics.crew_utilization}%`,    note: "with jobs done" },
    { label: "Online Now",       value: analytics.online_crew,               note: "crew online" },
    { label: "Job Completion",   value: `${analytics.job_completion_rate}%`, note: "success rate" },
    { label: "Expired Subs",     value: analytics.expired_subscriptions,     note: "need renewal" },
  ] : [];

  const pieData = analytics ? [
    { name: "Crew",        value: analytics.crew_count },
    { name: "Contractors", value: analytics.contractor_count },
    { name: "Active Sub",  value: analytics.active_subscriptions },
    { name: "Trial",       value: analytics.trial_subscriptions },
  ] : [];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Admin Dashboard</h1>
            <p className="text-slate-500 text-sm">Platform management & analytics</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isSuperAdmin ? "bg-purple-50 dark:bg-purple-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
            <Shield className={`w-4 h-4 ${isSuperAdmin ? "text-purple-500" : "text-red-500"}`} />
            <span className={`font-semibold text-sm ${isSuperAdmin ? "text-purple-600" : "text-red-600"}`} data-testid="admin-role-badge">
              {isSuperAdmin ? "Super Admin" : "Admin"}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap ${tab === t ? "bg-[#050A30] text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
              data-testid={`admin-tab-${t.toLowerCase().replace(/\s+/g, "-")}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ─── Overview ─── */}
        {tab === "Overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map(card => (
                <div key={card.label} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-500">{card.label}</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: card.bg }}>
                      <card.icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                  </div>
                  <div className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metricsCards.map(m => (
                <div key={m.label} className="card p-3 text-center">
                  <div className="text-xl font-extrabold text-[#0000FF]">{m.value}</div>
                  <div className="text-xs font-semibold text-[#050A30] dark:text-white mt-0.5">{m.label}</div>
                  <div className="text-xs text-slate-400">{m.note}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-6">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>User Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                      label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                      labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Jobs by Trade</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics?.jobs_by_trade || []} margin={{ top: 0, right: 0, left: -30, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="trade" tick={{ fill: "#94A3B8", fontSize: 10 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, color: "#fff" }} />
                    <Bar dataKey="count" fill="#0000FF" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Top Crew</h3>
                <div className="space-y-2">
                  {(analytics?.top_crew || []).map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4">#{i+1}</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-[#050A30] dark:text-white truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{c.trade || "—"}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-600">{c.jobs_completed} jobs</span>
                    </div>
                  ))}
                  {(!analytics?.top_crew || analytics.top_crew.length === 0) && (
                    <p className="text-xs text-slate-400">No completed jobs yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Recent Users</h3>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {analytics?.recent_users?.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                    <div className="w-8 h-8 bg-[#0000FF] rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {u.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#050A30] dark:text-white truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{u.role}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.subscription_status === "trial" ? "bg-blue-100 text-blue-700" : u.subscription_status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {u.subscription_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Users ─── */}
        {tab === "Users" && (
          <div>
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search users..." value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); fetchUsers(1, e.target.value); }}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="admin-user-search" />
              </div>
              <button onClick={() => setShowCreateUser(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#0000FF] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                data-testid="create-user-btn">
                <UserPlus className="w-4 h-4" /> Create User
              </button>
              <div className="relative group">
                <button
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-[#0000FF] hover:text-[#0000FF] transition-colors"
                  data-testid="export-users-btn">
                  <Download className="w-4 h-4" /> Export
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[120px]">
                  <button onClick={() => exportUsers("csv")}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded-t-lg"
                    data-testid="export-users-csv-btn">
                    Export CSV
                  </button>
                  <button onClick={() => exportUsers("json")}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded-b-lg"
                    data-testid="export-users-json-btn">
                    Export JSON
                  </button>
                </div>
              </div>
              <button onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-[#0000FF] hover:text-[#0000FF] transition-colors"
                data-testid="import-users-btn">
                <Upload className="w-4 h-4" /> Import
              </button>
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </div>

            {/* Create User Form */}
            {showCreateUser && (
              <div className="card p-5 mb-4" data-testid="create-user-form">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>New User Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <input type="text" placeholder="Full Name" value={newUser.name}
                    onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-user-name" />
                  <input type="email" placeholder="Email Address" value={newUser.email}
                    onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-user-email" />
                  <input type="password" placeholder="Password" value={newUser.password}
                    onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-user-password" />
                  <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none"
                    data-testid="new-user-role">
                    {["crew", "contractor", "subadmin"].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={createUser}
                      className="flex-1 bg-[#0000FF] text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
                      data-testid="submit-create-user">Create</button>
                    <button onClick={() => setShowCreateUser(false)}
                      className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Subscription</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Points</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`admin-user-row-${u.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-[#050A30] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-[#050A30] dark:text-white">{u.name}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="capitalize px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-semibold">{u.role}</span></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {u.is_active ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs capitalize">{u.subscription_status}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-semibold">{u.points || 0}</span></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditUser(u)}
                              className="p-1.5 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title="Edit User" data-testid={`admin-edit-user-${u.id}`}>
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setResetUserId(u.id); setNewPassword(""); }}
                              className="p-1.5 rounded text-amber-500 hover:bg-amber-50"
                              title="Reset Password" data-testid={`admin-reset-pw-${u.id}`}>
                              <Key className="w-4 h-4" />
                            </button>
                            <button onClick={() => suspendUser(u.id, u.is_active)}
                              className={`p-1.5 rounded ${u.is_active ? "text-red-500 hover:bg-red-50" : "text-green-500 hover:bg-green-50"}`}
                              title={u.is_active ? "Suspend" : "Activate"} data-testid={`admin-${u.is_active ? "suspend" : "activate"}-${u.id}`}>
                              {u.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete" data-testid={`admin-delete-user-${u.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {!["admin","superadmin","subadmin"].includes(u.role) && (
                              <button
                                onClick={async () => {
                                  try {
                                    const { data } = await axios.post(`${API}/messages/threads/initiate/${u.id}`);
                                    navigate(`/messages?thread=${data.id}`);
                                  } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                                }}
                                className="p-1.5 rounded text-blue-500 hover:bg-blue-50"
                                title="Message User"
                                data-testid={`admin-message-user-${u.id}`}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-500">Showing {users.length} of {userTotal} users</p>
                <div className="flex gap-2">
                  <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} className="p-1.5 rounded border border-slate-200 disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 text-sm">{userPage}</span>
                  <button onClick={() => setUserPage(p => p + 1)} disabled={userPage * 15 >= userTotal} className="p-1.5 rounded border border-slate-200 disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Jobs ─── */}
        {tab === "Jobs" && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-[#050A30] dark:text-white flex-1" style={{ fontFamily: "Manrope, sans-serif" }}>
                All Jobs <span className="text-sm font-normal text-slate-400 ml-2">({jobs.length} shown)</span>
              </h2>
              <select value={jobStatusFilter}
                onChange={e => { setJobStatusFilter(e.target.value); fetchJobs(e.target.value); }}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none"
                data-testid="job-status-filter">
                <option value="">All Statuses</option>
                {["open", "fulfilled", "in_progress", "completed", "suspended", "cancelled", "archived"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Title</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Contractor</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Trade</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Crew</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {jobs.map(j => (
                      <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`admin-job-row-${j.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#050A30] dark:text-white truncate max-w-[180px]">{j.title}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[180px]">{j.address}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">{j.contractor_name || "—"}</td>
                        <td className="px-4 py-3"><span className="text-xs capitalize text-slate-500">{j.trade || "—"}</span></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${JOB_STATUS_COLORS[j.status] || "bg-slate-100 text-slate-500"}`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{j.crew_accepted?.length || 0}/{j.crew_needed || 1}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{j.date || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {j.status === "suspended" ? (
                              <button onClick={() => adminJobAction(j.id, "reactivate")}
                                className="p-1.5 rounded text-green-500 hover:bg-green-50"
                                title="Reactivate" data-testid={`admin-reactivate-job-${j.id}`}>
                                <Play className="w-4 h-4" />
                              </button>
                            ) : ["open", "fulfilled", "in_progress"].includes(j.status) && (
                              <button onClick={() => adminJobAction(j.id, "suspend")}
                                className="p-1.5 rounded text-orange-500 hover:bg-orange-50"
                                title="Suspend" data-testid={`admin-suspend-job-${j.id}`}>
                                <Pause className="w-4 h-4" />
                              </button>
                            )}
                            {!["completed", "cancelled", "archived"].includes(j.status) && (
                              <button onClick={() => adminJobAction(j.id, "cancel")}
                                className="p-1.5 rounded text-red-500 hover:bg-red-50"
                                title="Cancel" data-testid={`admin-cancel-job-${j.id}`}>
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => adminJobAction(j.id, "delete")}
                              className="p-1.5 rounded text-red-600 hover:bg-red-50"
                              title="Delete permanently" data-testid={`admin-delete-job-${j.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No jobs found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Payments ─── */}
        {tab === "Payments" && (
          <div>
            <h2 className="text-lg font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
              Payments by User
              <span className="text-sm font-normal text-slate-400 ml-2">({paymentsByUser.length} users)</span>
            </h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="w-8 px-4 py-3"></th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Transactions</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Total Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paymentsByUser.map(p => (
                      <React.Fragment key={p.user_id}>
                        <tr
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${expandedPayUser === p.user_id ? "bg-slate-50 dark:bg-slate-800/50" : ""}`}
                          onClick={() => setExpandedPayUser(expandedPayUser === p.user_id ? null : p.user_id)}
                          data-testid={`pay-user-row-${p.user_id}`}>
                          <td className="px-4 py-3">
                            {expandedPayUser === p.user_id
                              ? <ChevronUp className="w-4 h-4 text-slate-400" />
                              : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#050A30] dark:text-white">{p.user_name}</p>
                            <p className="text-xs text-slate-500">{p.user_email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full font-semibold">{p.user_role || "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{p.count}</td>
                          <td className="px-4 py-3 font-extrabold text-[#050A30] dark:text-white">${p.total?.toFixed(2)}</td>
                        </tr>
                        {expandedPayUser === p.user_id && (
                          <tr>
                            <td colSpan={5} className="px-6 pb-4 bg-slate-50 dark:bg-slate-900/40">
                              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800">
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">ID</th>
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Amount</th>
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Plan</th>
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Method</th>
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Status</th>
                                      <th className="px-3 py-2 text-left text-slate-500 font-semibold">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {(p.transactions || []).map((t, idx) => (
                                      <tr key={t.id || idx} className="hover:bg-white dark:hover:bg-slate-800">
                                        <td className="px-3 py-2 font-mono text-slate-400">{(t.id || "").slice(0, 8)}</td>
                                        <td className="px-3 py-2 font-bold text-[#050A30] dark:text-white">${t.amount?.toFixed(2)}</td>
                                        <td className="px-3 py-2 capitalize text-slate-500">{t.plan}</td>
                                        <td className="px-3 py-2 capitalize text-slate-500">{t.payment_method}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${t.payment_status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                            {t.payment_status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {paymentsByUser.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No payment records found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Top Performers ─── */}
        {tab === "Top Performers" && (
          <div className="space-y-6" data-testid="top-performers-tab">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top by Jobs */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <ClipboardList className="w-5 h-5 text-[#0000FF]" />
                  <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Top by Jobs Completed</h3>
                </div>
                <div className="space-y-3">
                  {(topPerformers?.top_by_jobs || []).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" data-testid={`top-jobs-${c.id}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${i === 0 ? "bg-yellow-400 text-white" : i === 1 ? "bg-slate-300 text-slate-700" : i === 2 ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                        {i+1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#050A30] dark:text-white text-sm truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{c.trade || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-500 flex-shrink-0">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="text-xs font-semibold text-slate-500">{c.rating_count > 0 ? c.rating?.toFixed(1) : "—"}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-extrabold text-emerald-600">{c.jobs_completed}</p>
                        <p className="text-xs text-slate-400">jobs</p>
                      </div>
                    </div>
                  ))}
                  {(!topPerformers?.top_by_jobs || topPerformers.top_by_jobs.length === 0) && (
                    <p className="text-sm text-slate-400 text-center py-8">No performers yet</p>
                  )}
                </div>
              </div>

              {/* Top by Rating */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Award className="w-5 h-5 text-yellow-500" />
                  <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Top by Rating</h3>
                </div>
                <div className="space-y-3">
                  {(topPerformers?.top_by_rating || []).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" data-testid={`top-rating-${c.id}`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${i === 0 ? "bg-yellow-400 text-white" : i === 1 ? "bg-slate-300 text-slate-700" : i === 2 ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                        {i+1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#050A30] dark:text-white text-sm truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{c.trade || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-extrabold text-[#050A30] dark:text-white">{c.rating?.toFixed(1)}</span>
                        <span className="text-xs text-slate-400">({c.rating_count})</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-600">{c.jobs_completed}</p>
                        <p className="text-xs text-slate-400">jobs</p>
                      </div>
                    </div>
                  ))}
                  {(!topPerformers?.top_by_rating || topPerformers.top_by_rating.length === 0) && (
                    <p className="text-sm text-slate-400 text-center py-8">No rated performers yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Settings ─── */}
        {tab === "Settings" && settings && (
          <div className="card p-6 max-w-xl">
            <h3 className="font-bold text-[#050A30] dark:text-white text-lg mb-5" style={{ fontFamily: "Manrope, sans-serif" }}>Subscription Pricing</h3>
            <div className="space-y-4 mb-6">
              {[["daily_price", "Daily Pass Price ($)"], ["weekly_price", "Weekly Pass Price ($)"], ["monthly_price", "Monthly Pass Price ($)"], ["annual_price", "Annual Pass Price ($)"]].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">{label}</label>
                  <input type="number" step="0.01" value={editSettings[key] || ""}
                    onChange={e => setEditSettings(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Job Visibility (hours after complete)</label>
                <input type="number" value={editSettings.job_visibility_hours || ""}
                  onChange={e => setEditSettings(f => ({ ...f, job_visibility_hours: parseInt(e.target.value) }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white" />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-bold text-[#050A30] dark:text-white mb-4 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Social Profile Sharing</h4>
              <div className="space-y-3">
                {[["social_linkedin_enabled", "LinkedIn"], ["social_twitter_enabled", "X (Twitter)"], ["social_facebook_enabled", "Facebook"], ["social_native_share_enabled", "Native Share / Copy Link"]].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-sm font-semibold text-[#050A30] dark:text-white">{label}</span>
                    <div onClick={() => setEditSettings(f => ({ ...f, [key]: !f[key] }))}
                      className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors flex items-center px-0.5 ${editSettings[key] ? "bg-[#0000FF]" : "bg-slate-300"}`}
                      data-testid={`setting-${key}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${editSettings[key] ? "translate-x-5" : ""}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-bold text-[#050A30] dark:text-white mb-4 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>UI Visibility</h4>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-[#050A30] dark:text-white">Verification Sidebar</p>
                  <p className="text-xs text-slate-400">Show profile completion panel to crew</p>
                </div>
                <div onClick={() => setEditSettings(f => ({ ...f, show_verification_sidebar: !f.show_verification_sidebar }))}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors flex items-center px-0.5 ${editSettings.show_verification_sidebar !== false ? "bg-[#0000FF]" : "bg-slate-300"}`}
                  data-testid="setting-show_verification_sidebar">
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${editSettings.show_verification_sidebar !== false ? "translate-x-5" : ""}`} />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-bold text-[#050A30] dark:text-white mb-4 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Boost & Feature Pricing</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[["profile_boost_price", "Profile Boost (7-day)", "4.99"], ["job_boost_price", "Job Boost (7-day)", "9.99"], ["emergency_post_price", "Emergency Post", "2.99"]].map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                    <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                      <span className="px-2 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 text-sm">$</span>
                      <input type="number" step="0.01" min="0"
                        value={editSettings[key] ?? ""}
                        onChange={e => setEditSettings(f => ({ ...f, [key]: Number(e.target.value) }))}
                        placeholder={placeholder}
                        className="flex-1 px-2 py-2.5 text-sm focus:outline-none dark:bg-slate-900 dark:text-white"
                        data-testid={`setting-${key}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-bold text-[#050A30] dark:text-white mb-4 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Theme Colors</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[["accent_color", "Accent Color", "#ccff00"], ["brand_color", "Brand / Button Color", "#0000FF"], ["nav_bg_color", "Nav Background", "#050A30"]].map(([key, label, def]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                    <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900">
                      <input type="color" value={editSettings[key] || def}
                        onChange={e => setEditSettings(f => ({ ...f, [key]: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
                        data-testid={`setting-${key}`} />
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{editSettings[key] || def}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Changes apply globally after Save.</p>

              <div className="mt-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-md" data-testid="theme-preview">
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-slate-400 ml-1 font-mono">live preview</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: editSettings.nav_bg_color || "#050A30" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: editSettings.brand_color || "#0000FF" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                    </div>
                    <div>
                      <div className="text-white font-extrabold text-xs leading-none" style={{ fontFamily: "Manrope, sans-serif" }}>PunchListJobs</div>
                      <div className="text-xs leading-none mt-0.5" style={{ color: editSettings.accent_color || "#ccff00", fontSize: 9 }}>A Blue Collar ME Company</div>
                    </div>
                  </div>
                  <span className="text-white text-xs font-bold px-2.5 py-1 rounded-md" style={{ backgroundColor: editSettings.brand_color || "#0000FF" }}>Sign Up</span>
                </div>
                <div className="px-4 py-4" style={{ background: "linear-gradient(135deg, #0d1117 0%, #050a30 100%)" }}>
                  <p className="text-white font-extrabold text-sm mb-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>Find Work Today.</p>
                  <p className="font-extrabold text-sm" style={{ color: editSettings.accent_color || "#ccff00", fontFamily: "Manrope, sans-serif" }}>Find Workers Now.</p>
                  <div className="mt-3">
                    <span className="text-white text-xs font-bold px-3 py-1.5 rounded-lg inline-block" style={{ backgroundColor: editSettings.brand_color || "#0000FF" }}>Get Started</span>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={saveSettings} className="mt-6 bg-[#0000FF] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors" data-testid="save-settings-btn">
              Save Settings
            </button>
          </div>
        )}

        {/* ─── Logs ─── */}
        {tab === "Logs" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Activity Logs</h2>
                <p className="text-sm text-slate-500">{logTotal} total entries</p>
              </div>
              <div className="flex gap-2">
                <select value={logCategory} onChange={e => { setLogCategory(e.target.value); fetchLogs(1, e.target.value); }}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none"
                  data-testid="log-category-filter">
                  <option value="">All categories</option>
                  {["auth", "job", "admin", "payment", "subscription", "crew_request"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={exportLogs}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-[#0000FF] hover:text-[#0000FF] transition-colors"
                  data-testid="export-logs-btn">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {["Time", "Category", "Action", "Actor", "Details"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logs.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`log-row-${l.id}`}>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                        <td className="px-4 py-2.5"><span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-semibold capitalize">{l.category}</span></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#0000FF]">{l.action}</td>
                        <td className="px-4 py-2.5 text-xs"><p className="font-semibold">{l.actor_name}</p><p className="text-slate-400 capitalize">{l.actor_role}</p></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                          {Object.entries(l.details || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No activity logs found</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-500">Page {logPage} · {logs.length} entries shown</p>
                <div className="flex gap-2">
                  <button onClick={() => { setLogPage(p => Math.max(1, p - 1)); fetchLogs(Math.max(1, logPage - 1), logCategory); }} disabled={logPage === 1} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => { setLogPage(p => p + 1); fetchLogs(logPage + 1, logCategory); }} disabled={logs.length < 50} className="p-1.5 rounded border border-slate-200 disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CMS ─── */}
        {tab === "CMS" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="card p-2 space-y-1">
                {CMS_PAGES.map(({ slug, icon: Icon, label }) => (
                  <button key={slug} onClick={() => {
                    setActiveCmsSlug(slug);
                    const page = cmsPages.find(p => p.slug === slug);
                    if (page) setCmsForm({ title: page.title || "", header_text: page.header_text || "", content: page.content || "", youtube_url: page.youtube_url || "" });
                  }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors text-left ${activeCmsSlug === slug ? "bg-[#050A30] text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    data-testid={`cms-page-${slug}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="lg:col-span-3 space-y-4">
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {CMS_PAGES.find(p => p.slug === activeCmsSlug)?.label}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">/{activeCmsSlug}</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Page Title</label>
                    <input type="text" value={cmsForm.title} onChange={e => setCmsForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                      data-testid="cms-title-input" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Header / Subtitle</label>
                    <input type="text" value={cmsForm.header_text} onChange={e => setCmsForm(f => ({ ...f, header_text: e.target.value }))}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                      data-testid="cms-header-input" />
                  </div>
                  {activeCmsSlug === "about" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">YouTube Video URL</label>
                      <input type="url" value={cmsForm.youtube_url} onChange={e => setCmsForm(f => ({ ...f, youtube_url: e.target.value }))}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                        placeholder="https://www.youtube.com/watch?v=..." data-testid="cms-youtube-input" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      {activeCmsSlug === "faqs" ? "Content (JSON array of {question, answer})" : "Content"}
                    </label>
                    {activeCmsSlug === "faqs" ? (
                      <textarea value={cmsForm.content} onChange={e => setCmsForm(f => ({ ...f, content: e.target.value }))}
                        rows={10}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                        data-testid="cms-content-editor" />
                    ) : (
                      <WysiwygEditor key={activeCmsSlug} value={cmsForm.content} onChange={v => setCmsForm(f => ({ ...f, content: v }))} placeholder={`Enter ${activeCmsSlug} content...`} />
                    )}
                  </div>
                </div>
                <button onClick={saveCmsPage}
                  className="mt-5 bg-[#0000FF] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                  data-testid="save-cms-btn">
                  Save Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── SubAdmins ─── */}
        {tab === "SubAdmins" && (
          <div className="space-y-4" data-testid="subadmins-tab">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>SubAdmin Management</h2>
                <p className="text-sm text-slate-500">Create limited-access sub-administrators</p>
              </div>
              <button onClick={() => setShowCreateSubadmin(!showCreateSubadmin)}
                className="flex items-center gap-2 bg-[#050A30] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#0a1240] transition-colors"
                data-testid="create-subadmin-btn">
                <PlusCircle className="w-4 h-4" /> Create SubAdmin
              </button>
            </div>
            {showCreateSubadmin && (
              <div className="card p-5">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4">New SubAdmin Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {[["name", "text", "Full Name", "new-subadmin-name"], ["email", "email", "Email Address", "new-subadmin-email"], ["password", "password", "Password", "new-subadmin-password"]].map(([f, t, p, tid]) => (
                    <input key={f} type={t} placeholder={p} value={newSubadmin[f]}
                      onChange={e => setNewSubadmin(s => ({ ...s, [f]: e.target.value }))}
                      className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-[#050A30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                      data-testid={tid} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={createSubadmin} className="bg-[#050A30] text-white px-4 py-2 rounded-lg font-semibold text-sm" data-testid="submit-create-subadmin">Create</button>
                  <button onClick={() => setShowCreateSubadmin(false)} className="px-4 py-2 rounded-lg font-semibold text-sm border border-slate-200 text-slate-500">Cancel</button>
                </div>
              </div>
            )}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>{["Name", "Email", "Status", "Created", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {subadmins.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`subadmin-row-${s.id}`}>
                        <td className="px-4 py-3 font-semibold text-[#050A30] dark:text-white">{s.name}</td>
                        <td className="px-4 py-3 text-slate-500">{s.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{s.is_active ? "Active" : "Suspended"}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(s.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => suspendSubadmin(s.id, s.is_active)}
                              className={`p-1.5 rounded ${s.is_active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                              title={s.is_active ? "Suspend" : "Activate"}>
                              {s.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteSubadmin(s.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {subadmins.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No subadmin accounts yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Admins (SuperAdmin only) ─── */}
        {tab === "Admins" && isSuperAdmin && (
          <div className="space-y-4" data-testid="admins-tab">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Admin Management</h2>
                <p className="text-sm text-slate-500">Manage administrator accounts (Super Admin only)</p>
              </div>
              <button onClick={() => setShowCreateAdmin(!showCreateAdmin)}
                className="flex items-center gap-2 bg-[#050A30] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#0a1240] transition-colors"
                data-testid="create-admin-btn">
                <PlusCircle className="w-4 h-4" /> Create Admin
              </button>
            </div>
            {showCreateAdmin && (
              <div className="card p-5" data-testid="create-admin-form">
                <h3 className="font-bold text-[#050A30] dark:text-white mb-4">New Administrator Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <input type="text" placeholder="Full Name" value={newAdmin.name}
                    onChange={e => setNewAdmin(p => ({ ...p, name: e.target.value }))}
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-[#050A30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-admin-name" />
                  <input type="email" placeholder="Email Address" value={newAdmin.email}
                    onChange={e => setNewAdmin(p => ({ ...p, email: e.target.value }))}
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-[#050A30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-admin-email" />
                  <input type="password" placeholder="Password" value={newAdmin.password}
                    onChange={e => setNewAdmin(p => ({ ...p, password: e.target.value }))}
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-[#050A30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]"
                    data-testid="new-admin-password" />
                </div>
                <div className="flex gap-2">
                  <button onClick={createAdmin} className="bg-[#050A30] text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#0a1240] transition-colors" data-testid="submit-create-admin">Create Administrator</button>
                  <button onClick={() => setShowCreateAdmin(false)} className="px-4 py-2 rounded-lg font-semibold text-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50" data-testid="cancel-create-admin">Cancel</button>
                </div>
              </div>
            )}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>{["Name", "Email", "Status", "Created", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {admins.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`admin-row-${a.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#050A30] flex items-center justify-center text-white text-xs font-bold">{a.name?.[0] || "A"}</div>
                            <span className="font-semibold text-[#050A30] dark:text-white">{a.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{a.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{a.is_active ? "Active" : "Suspended"}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => suspendAdmin(a.id, a.is_active)}
                              className={`p-1.5 rounded ${a.is_active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                              title={a.is_active ? "Suspend" : "Activate"}
                              data-testid={`admin-${a.is_active ? "suspend" : "activate"}-${a.id}`}>
                              {a.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteAdmin(a.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete" data-testid={`admin-delete-${a.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {admins.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No admin accounts found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Coupons ─── */}
        {tab === "Coupons" && (
          <div className="space-y-6" data-testid="coupons-tab">
            <div className="card p-5">
              <h3 className="font-bold text-[#050A30] dark:text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Create Discount Code</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <input placeholder="CODE (e.g. SAVE20)" value={couponForm.code}
                  onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white col-span-2 sm:col-span-1"
                  data-testid="coupon-code-input" />
                <select value={couponForm.type} onChange={e => setCouponForm(f => ({ ...f, type: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-type-select">
                  <option value="percent">% Percent</option>
                  <option value="fixed">$ Fixed</option>
                </select>
                <input type="number" placeholder="Value" min="0" step="0.01" value={couponForm.value}
                  onChange={e => setCouponForm(f => ({ ...f, value: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-value-input" />
                <input type="number" placeholder="Max uses (blank=∞)" min="1" value={couponForm.max_uses}
                  onChange={e => setCouponForm(f => ({ ...f, max_uses: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-max-uses-input" />
                <input type="datetime-local" value={couponForm.expires_at}
                  onChange={e => setCouponForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-expires-input" />
                <select value={couponForm.plan_restriction} onChange={e => setCouponForm(f => ({ ...f, plan_restriction: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none dark:bg-slate-800 dark:text-white"
                  data-testid="coupon-plan-select">
                  <option value="">Any plan</option>
                  {["daily", "weekly", "monthly", "annual"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button onClick={createCoupon} className="mt-4 bg-[#0000FF] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors text-sm" data-testid="create-coupon-btn">
                Create Coupon
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>{["Code", "Type", "Value", "Uses", "Expires", "Plan", "Status", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {coupons.map(c => (
                      <React.Fragment key={c.id}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`coupon-row-${c.id}`}>
                          <td className="px-4 py-3 font-mono font-bold text-[#050A30] dark:text-white">{c.code}</td>
                          <td className="px-4 py-3 capitalize text-slate-500">{c.type}</td>
                          <td className="px-4 py-3 font-semibold text-[#0000FF]">{c.type === "percent" ? `${c.value}%` : `$${c.value}`}</td>
                          <td className="px-4 py-3 text-slate-500">{c.used_count}/{c.max_uses ?? "∞"}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-slate-500 capitalize">{c.plan_restriction || "Any"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                              {c.is_active ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => editCouponId === c.id ? setEditCouponId(null) : openEditCoupon(c)}
                                title="Edit" className={`p-1.5 rounded ${editCouponId === c.id ? "bg-blue-100 text-blue-700" : "text-blue-500 hover:bg-blue-50"}`}
                                data-testid={`edit-coupon-${c.id}`}>
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => toggleCoupon(c.id)} title={c.is_active ? "Disable" : "Enable"}
                                className={`p-1.5 rounded ${c.is_active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                                data-testid={`toggle-coupon-${c.id}`}>
                                {c.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button onClick={() => deleteCoupon(c.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50" title="Delete" data-testid={`delete-coupon-${c.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editCouponId === c.id && (
                          <tr>
                            <td colSpan={8} className="px-4 pb-4 bg-blue-50/50 dark:bg-blue-900/10">
                              <div className="pt-3">
                                <p className="text-xs font-semibold text-blue-600 mb-2">Editing: {c.code}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                  <input placeholder="Code" value={editCouponForm.code || ""}
                                    onChange={e => setEditCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]"
                                    data-testid="edit-coupon-code" />
                                  <select value={editCouponForm.type || "percent"} onChange={e => setEditCouponForm(f => ({ ...f, type: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none">
                                    <option value="percent">% Percent</option>
                                    <option value="fixed">$ Fixed</option>
                                  </select>
                                  <input type="number" placeholder="Value" min="0" step="0.01" value={editCouponForm.value || ""}
                                    onChange={e => setEditCouponForm(f => ({ ...f, value: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]"
                                    data-testid="edit-coupon-value" />
                                  <input type="number" placeholder="Max uses" min="1" value={editCouponForm.max_uses || ""}
                                    onChange={e => setEditCouponForm(f => ({ ...f, max_uses: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]" />
                                  <input type="datetime-local" value={editCouponForm.expires_at || ""}
                                    onChange={e => setEditCouponForm(f => ({ ...f, expires_at: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]" />
                                  <select value={editCouponForm.plan_restriction || ""} onChange={e => setEditCouponForm(f => ({ ...f, plan_restriction: e.target.value }))}
                                    className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-white focus:outline-none">
                                    <option value="">Any plan</option>
                                    {["daily", "weekly", "monthly", "annual"].map(p => <option key={p} value={p}>{p}</option>)}
                                  </select>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button onClick={saveEditCoupon} className="bg-[#0000FF] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700" data-testid="save-edit-coupon-btn">Save Changes</button>
                                  <button onClick={() => setEditCouponId(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500">Cancel</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {coupons.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No coupons yet. Create one above.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── Trades ─── */}
        {tab === "Trades" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Trade Categories</h3>
                  <span className="text-xs text-slate-400">{tradeCategories.length} total</span>
                </div>
                <div className="flex gap-2 mb-4">
                  <input type="text"
                    value={editCat ? editCat.name : catForm.name}
                    onChange={e => editCat ? setEditCat(c => ({ ...c, name: e.target.value })) : setCatForm({ name: e.target.value })}
                    placeholder="Category name..."
                    className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]"
                    data-testid="cat-name-input" />
                  {editCat ? (
                    <>
                      <button onClick={async () => {
                        if (!editCat.name.trim()) return;
                        try { await axios.put(`${API}/trades/admin/categories/${editCat.id}`, { name: editCat.name }); toast.success("Category updated"); setEditCat(null); fetchTradeCategories(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                      }} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold" data-testid="save-cat-btn">Save</button>
                      <button onClick={() => setEditCat(null)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-500 rounded-lg text-xs" data-testid="cancel-cat-btn">×</button>
                    </>
                  ) : (
                    <button onClick={async () => {
                      if (!catForm.name.trim()) return;
                      try { await axios.post(`${API}/trades/admin/categories`, { name: catForm.name }); toast.success("Category created"); setCatForm({ name: "" }); fetchTradeCategories(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                    }} className="px-3 py-1.5 bg-[#0000FF] text-white rounded-lg text-xs font-bold" data-testid="add-cat-btn">+ Add</button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {tradeCategories.map(cat => (
                    <div key={cat.id}
                      onClick={() => { setSelectedCatId(cat.id); setTradeForm(f => ({ ...f, category_id: cat.id })); fetchTrades(cat.id); }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedCatId === cat.id ? "bg-blue-50 dark:bg-blue-900/20 border border-[#0000FF]" : "hover:bg-slate-50 dark:hover:bg-slate-700 border border-transparent"}`}
                      data-testid={`cat-row-${cat.id}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cat.is_active ? "bg-green-400" : "bg-slate-300"}`} />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{cat.name}</span>
                        <span className="text-xs text-slate-400">({cat.trade_count || 0})</span>
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditCat({ id: cat.id, name: cat.name })} className="text-xs px-2 py-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20" data-testid={`edit-cat-${cat.id}`}>Edit</button>
                        <button onClick={async () => {
                          try { await axios.post(`${API}/trades/admin/categories/${cat.id}/${cat.is_active ? "suspend" : "activate"}`); fetchTradeCategories(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                        }} className={`text-xs px-2 py-1 rounded ${cat.is_active ? "text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"}`} data-testid={`toggle-cat-${cat.id}`}>{cat.is_active ? "Suspend" : "Activate"}</button>
                        <button onClick={async () => {
                          if (!window.confirm("Delete category? All trades must be removed first.")) return;
                          try { await axios.delete(`${API}/trades/admin/categories/${cat.id}`); toast.success("Deleted"); if (selectedCatId === cat.id) setSelectedCatId(null); fetchTradeCategories(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                        }} className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-50" data-testid={`delete-cat-${cat.id}`}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {selectedCatId ? `Trades — ${tradeCategories.find(c => c.id === selectedCatId)?.name || ""}` : "Trades (select a category)"}
                  </h3>
                  <span className="text-xs text-slate-400">{trades.length} trades</span>
                </div>
                {selectedCatId && (
                  <div className="flex gap-2 mb-4">
                    <input type="text"
                      value={editTrade ? editTrade.name : tradeForm.name}
                      onChange={e => editTrade ? setEditTrade(t => ({ ...t, name: e.target.value })) : setTradeForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Trade name..."
                      className="flex-1 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-[#0000FF]"
                      data-testid="trade-name-input" />
                    {editTrade ? (
                      <>
                        <button onClick={async () => {
                          if (!editTrade.name.trim()) return;
                          try { await axios.put(`${API}/trades/admin/trades/${editTrade.id}`, { name: editTrade.name }); toast.success("Trade updated"); setEditTrade(null); fetchTrades(selectedCatId); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                        }} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold" data-testid="save-trade-btn">Save</button>
                        <button onClick={() => setEditTrade(null)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-500 rounded-lg text-xs" data-testid="cancel-trade-btn">×</button>
                      </>
                    ) : (
                      <button onClick={async () => {
                        if (!tradeForm.name.trim() || !selectedCatId) return;
                        try { await axios.post(`${API}/trades/admin/trades`, { name: tradeForm.name, category_id: selectedCatId }); toast.success("Trade created"); setTradeForm(f => ({ ...f, name: "" })); fetchTrades(selectedCatId); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                      }} className="px-3 py-1.5 bg-[#0000FF] text-white rounded-lg text-xs font-bold" data-testid="add-trade-btn">+ Add</button>
                    )}
                  </div>
                )}
                {!selectedCatId ? (
                  <p className="text-sm text-slate-400 text-center py-8">← Select a category to manage its trades</p>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {trades.map(trade => (
                      <div key={trade.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700" data-testid={`trade-row-${trade.id}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${trade.is_active ? "bg-green-400" : "bg-slate-300"}`} />
                          <span className="text-sm text-slate-700 dark:text-slate-200">{trade.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditTrade({ id: trade.id, name: trade.name })} className="text-xs px-2 py-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20" data-testid={`edit-trade-${trade.id}`}>Edit</button>
                          <button onClick={async () => {
                            try { await axios.post(`${API}/trades/admin/trades/${trade.id}/${trade.is_active ? "suspend" : "activate"}`); fetchTrades(selectedCatId); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                          }} className={`text-xs px-2 py-1 rounded ${trade.is_active ? "text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"}`} data-testid={`toggle-trade-${trade.id}`}>{trade.is_active ? "Suspend" : "Activate"}</button>
                          <button onClick={async () => {
                            if (!window.confirm("Delete this trade?")) return;
                            try { await axios.delete(`${API}/trades/admin/trades/${trade.id}`); toast.success("Deleted"); fetchTrades(selectedCatId); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
                          }} className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-50" data-testid={`delete-trade-${trade.id}`}>Del</button>
                        </div>
                      </div>
                    ))}
                    {trades.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No trades yet. Add one above.</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Password Reset Modal ─── */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Reset Password</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">Set a new password for this user.</p>
            <input type="password" placeholder="New password (min 6 chars)" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 dark:bg-slate-800 dark:text-white mb-4"
              data-testid="reset-password-input" />
            <div className="flex gap-3">
              <button onClick={() => setResetUserId(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg text-sm font-semibold"
                data-testid="cancel-reset-pw-btn">Cancel</button>
              <button onClick={submitPasswordReset}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600"
                data-testid="confirm-reset-pw-btn">Reset Password</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit User Modal ─── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="edit-user-modal">
          <div className="card max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Edit User</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                <input type="text" value={editUserForm.name || ""}
                  onChange={e => setEditUserForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="edit-user-name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                <input type="email" value={editUserForm.email || ""}
                  onChange={e => setEditUserForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  data-testid="edit-user-email" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Role</label>
                  <select value={editUserForm.role || "crew"}
                    onChange={e => setEditUserForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-800 dark:text-white"
                    data-testid="edit-user-role">
                    {["crew", "contractor", "subadmin"].map(r => <option key={r} value={r}>{r}</option>)}
                    {isSuperAdmin && <option value="admin">admin</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Subscription</label>
                  <select value={editUserForm.subscription_status || "free"}
                    onChange={e => setEditUserForm(f => ({ ...f, subscription_status: e.target.value }))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-800 dark:text-white"
                    data-testid="edit-user-subscription">
                    {["free", "trial", "active", "expired"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="text-sm font-semibold text-[#050A30] dark:text-white">Account Active</span>
                <div onClick={() => setEditUserForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors flex items-center px-0.5 ${editUserForm.is_active ? "bg-[#0000FF]" : "bg-slate-300"}`}
                  data-testid="edit-user-active-toggle">
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${editUserForm.is_active ? "translate-x-5" : ""}`} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg text-sm font-semibold"
                data-testid="cancel-edit-user-btn">Cancel</button>
              <button onClick={saveEditUser}
                className="flex-1 py-2.5 bg-[#0000FF] text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                data-testid="save-edit-user-btn">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
