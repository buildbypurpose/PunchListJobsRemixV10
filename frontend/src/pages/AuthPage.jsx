import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import axios from "axios";
import { Eye, EyeOff, ClipboardList, Users, ArrowLeft, CheckCircle, KeyRound, Mail } from "lucide-react";
import TradeSelect from "../components/TradeSelect";
import ReCAPTCHA from "react-google-recaptcha";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const RECAPTCHA_SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY;

const HERO_BG = "https://images.unsplash.com/photo-1693478501743-799eefbc0ecd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwxfHxjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwdGVhbSUyMHdvcmtpbmd8ZW58MHx8fHwxNzczMzk4OTM5fDA&ixlib=rb-4.1.0&q=85";

export default function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState(params.get("mode") || "login");
  const [role, setRole] = useState(params.get("role") || "crew");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState([]);

  useEffect(() => {
    axios.get(`${API}/trades`).then(r => setGrouped(r.data.categories || [])).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    email: "", password: "", name: "", phone: "", address: "",
    company_name: "", referral_code_used: "", trade: ""
  });

  // Address autocomplete
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [showAddrSugg, setShowAddrSugg] = useState(false);
  const addrTimer = React.useRef(null);

  const searchAddr = (q) => {
    clearTimeout(addrTimer.current);
    if (!q || q.length < 3) { setAddrSuggestions([]); return; }
    addrTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/utils/address/search`, { params: { q, limit: 5 } });
        setAddrSuggestions(res.data || []);
        setShowAddrSugg(true);
      } catch { setAddrSuggestions([]); }
    }, 350);
  };

  // Agreement checkboxes (register only)
  const [agreed, setAgreed] = useState({ terms: false, privacy: false, community: false });

  // Forgot / Reset password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotDone, setForgotDone] = useState(null);
  const [resetToken, setResetToken] = useState(params.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (RECAPTCHA_SITE_KEY && !captchaToken) { toast.error("Please complete the CAPTCHA verification."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const user = await login(form.email, form.password, captchaToken);
        toast.success(`Welcome back, ${user.name}!`);
        if (user.role === "crew") navigate("/crew/dashboard");
        else if (user.role === "contractor") navigate("/contractor/dashboard");
        else navigate("/admin/dashboard");
      } else {
        if (!form.name.trim()) { toast.error("Name is required"); return; }
        if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
        if (!agreed.terms || !agreed.privacy || !agreed.community) {
          toast.error("Please accept all required agreements to continue.");
          return;
        }
        const payload = { ...form, role };
        if (role !== "contractor") delete payload.company_name;
        if (role !== "crew") delete payload.trade;
        const user = await register({ ...payload, captcha_token: captchaToken });
        toast.success(`Welcome to PunchListJobs, ${user.name}! You're on the free plan.`);
        if (user.role === "crew") navigate("/crew/dashboard");
        else navigate("/contractor/dashboard");
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
      setCaptchaToken(null);
      // Defer reCAPTCHA reset to avoid PostHog childNodes null error on Android
      setTimeout(() => {
        try { captchaRef.current?.reset(); } catch (_) {}
      }, 100);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, { email: forgotEmail });
      setForgotDone(res.data);
      toast.success("Reset link generated.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send reset link");
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token: resetToken, new_password: newPassword });
      toast.success("Password reset! You can now log in.");
      setMode("login");
      setResetToken("");
      setNewPassword("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired token");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Left Panel - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(135deg, rgba(5,10,48,0.95) 0%, rgba(0,0,255,0.3) 100%), url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#0000FF] rounded-xl flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-white font-extrabold text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>PunchListJobs</div>
              <div className="text-[#7EC8E3] text-xs">A Blue Collar ME Company</div>
            </div>
          </Link>

          <div>
            <h2 className="text-4xl font-extrabold text-white mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
              Your work.<br />Your terms.
            </h2>
            <p className="text-slate-300 text-lg mb-8">Real-time workforce marketplace for blue collar professionals.</p>
            <div className="space-y-3">
              {["Free plan included", "Live job map", "Instant payouts", "AI job matching"].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-[#7EC8E3]" />
                  <span className="text-slate-200">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 lg:w-1/2 bg-white dark:bg-[#020617] flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          {/* ── Forgot Password ────────────────────────────── */}
          {mode === "forgot" && (
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#0000FF]" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Forgot Password</h1>
                  <p className="text-xs text-slate-400">Enter your email to receive a reset link</p>
                </div>
              </div>

              {!forgotDone ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Email Address *</label>
                    <input type="email" required value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                      placeholder="you@example.com" data-testid="forgot-email-input" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                    data-testid="forgot-submit-btn">
                    {loading ? "Sending..." : "Send Reset Link"}
                  </button>
                  <button type="button" onClick={() => setMode("login")}
                    className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    data-testid="back-to-login-btn">
                    Back to Log In
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-700 rounded-xl p-4">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Check your email</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">A reset link has been sent if this email is registered.</p>
                  </div>
                  {forgotDone.demo_token && (
                    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2">Demo Mode — Reset Token</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-mono break-all mb-3">{forgotDone.demo_token}</p>
                      <Link to={forgotDone.reset_url}
                        className="text-xs text-[#0000FF] font-semibold hover:underline"
                        data-testid="go-to-reset-link">
                        Go to reset form →
                      </Link>
                    </div>
                  )}
                  <button onClick={() => { setMode("login"); setForgotDone(null); setForgotEmail(""); }}
                    className="w-full py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:border-slate-300 transition-colors"
                    data-testid="back-to-login-btn">
                    Back to Log In
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Reset Password ─────────────────────────────── */}
          {mode === "reset" && (
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-[#0000FF]" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Reset Password</h1>
                  <p className="text-xs text-slate-400">Enter your reset token and a new password</p>
                </div>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Reset Token *</label>
                  <input type="text" required value={resetToken}
                    onChange={e => setResetToken(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    placeholder="Paste your reset token" data-testid="reset-token-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">New Password *</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} required value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white pr-10"
                      placeholder="Min 6 characters" data-testid="reset-new-password-input" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                  data-testid="reset-submit-btn">
                  {loading ? "Resetting..." : "Set New Password"}
                </button>
                <button type="button" onClick={() => setMode("login")}
                  className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  Back to Log In
                </button>
              </form>
            </div>
          )}

          {/* ── Login / Register ───────────────────────────── */}
          {(mode === "login" || mode === "register") && (
            <>
          {/* Mode Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-8">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === "login" ? "bg-[#0000FF] text-white shadow-md" : "text-slate-500 dark:text-slate-400"}`}
              data-testid="auth-login-tab"
            >
              Log In
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${mode === "register" ? "bg-[#0000FF] text-white shadow-md" : "text-slate-500 dark:text-slate-400"}`}
              data-testid="auth-register-tab"
            >
              Sign Up
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#050A30] dark:text-white mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
            {mode === "login" ? "Sign in to your PunchListJobs account" : "Join thousands of workers and contractors"}
          </p>

          {/* Role Selector (Register only) */}
          {mode === "register" && (
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setRole("crew")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${role === "crew" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"}`}
                data-testid="role-crew-btn"
              >
                <Users className="w-5 h-5" />
                Crew Member
              </button>
              <button
                onClick={() => setRole("contractor")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 font-bold text-sm transition-all ${role === "contractor" ? "border-[#0000FF] bg-blue-50 dark:bg-blue-950 text-[#0000FF]" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"}`}
                data-testid="role-contractor-btn"
              >
                <ClipboardList className="w-5 h-5" />
                Contractor
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => update("name", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="John Smith"
                  required
                  data-testid="reg-name-input"
                />
              </div>
            )}

            {mode === "register" && role === "contractor" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={e => update("company_name", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="Smith Construction LLC"
                  data-testid="reg-company-input"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Email Address *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => update("email", e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                placeholder="john@example.com"
                required
                data-testid="auth-email-input"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => update("phone", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="+1 (555) 000-0000"
                  data-testid="reg-phone-input"
                />
              </div>
            )}

            {mode === "register" && (
              <div className="relative">
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => { update("address", e.target.value); searchAddr(e.target.value); }}
                  onFocus={() => addrSuggestions.length > 0 && setShowAddrSugg(true)}
                  onBlur={() => setTimeout(() => setShowAddrSugg(false), 200)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="123 Main St, City, State"
                  data-testid="reg-address-input"
                  autoComplete="off"
                />
                {showAddrSugg && addrSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl mt-1 overflow-hidden">
                    {addrSuggestions.map((s, i) => (
                      <button key={i} type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0"
                        onMouseDown={() => { update("address", s.full_address); setShowAddrSugg(false); setAddrSuggestions([]); }}>
                        <span className="font-semibold text-[#050A30] dark:text-white text-xs">{s.full_address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === "register" && role === "crew" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Primary Trade</label>
                <TradeSelect
                  grouped={grouped}
                  value={form.trade}
                  onChange={v => update("trade", v)}
                  placeholder="Select a trade"
                  data-testid="reg-trade-select"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Password *</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => update("password", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white pr-10"
                  placeholder="Min 6 characters"
                  required
                  data-testid="auth-password-input"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Forgot password link (login only) */}
              {mode === "login" && (
                <button type="button" onClick={() => setMode("forgot")}
                  className="mt-1.5 text-xs text-[#0000FF] hover:underline font-semibold float-right"
                  data-testid="forgot-password-link">
                  Forgot password?
                </button>
              )}
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1.5">Referral Code (optional)</label>
                <input
                  type="text"
                  value={form.referral_code_used}
                  onChange={e => update("referral_code_used", e.target.value.toUpperCase())}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="ABC12345"
                  data-testid="reg-referral-input"
                />
              </div>
            )}

            {/* Agreement checkboxes (register only) */}
            {mode === "register" && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-3">
                {[
                  { key: "terms",     label: "Terms & Conditions",    slug: "terms" },
                  { key: "privacy",   label: "Privacy Policy",        slug: "privacy" },
                  { key: "community", label: "Community Guidelines",  slug: "community-guidelines" },
                ].map(({ key, label, slug }) => (
                  <label key={key} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreed[key]}
                      onChange={e => setAgreed(a => ({ ...a, [key]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-[#0000FF] flex-shrink-0"
                      data-testid={`agree-${key}`}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                      I agree to the{" "}
                      <Link to={`/pages/${slug}`} target="_blank" rel="noopener noreferrer"
                        className="text-[#0000FF] font-semibold hover:underline"
                        data-testid={`cms-link-${slug}`}>
                        {label}
                      </Link>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* reCAPTCHA */}
            {RECAPTCHA_SITE_KEY && (
              <div className="flex justify-center" data-testid="recaptcha-container">
                <ReCAPTCHA
                  ref={captchaRef}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                  onExpired={() => setCaptchaToken(null)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (RECAPTCHA_SITE_KEY ? !captchaToken : false)}
              className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold text-base hover:bg-blue-700 transition-colors disabled:opacity-60 mt-2"
              data-testid="auth-submit-btn"
            >
              {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          {/* Admin login hint */}
          {mode === "login" && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Admin? Use your admin credentials to access the platform.
            </p>
          )}

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
            {mode === "login" ? (
              <>Don't have an account? <button onClick={() => setMode("register")} className="text-[#0000FF] font-semibold hover:underline" data-testid="switch-to-register">Sign up free</button></>
            ) : (
              <>Already have an account? <button onClick={() => setMode("login")} className="text-[#0000FF] font-semibold hover:underline" data-testid="switch-to-login">Log in</button></>
            )}
          </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
