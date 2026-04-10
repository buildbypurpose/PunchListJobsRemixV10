import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { Menu, X, ClipboardList, ChevronDown, User, Settings, LogOut, LayoutDashboard, Sliders, Archive, DollarSign } from "lucide-react";

export default function Navbar({ minimal = false }) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/"); };

  const dashboardPath = user?.role === "crew" ? "/crew/dashboard"
    : user?.role === "contractor" ? "/contractor/dashboard"
    : "/admin/dashboard";

  return (
    <nav className="shadow-lg sticky top-0 z-50" style={{ backgroundColor: "var(--theme-nav-bg)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--theme-brand)" }}>
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-extrabold text-lg leading-none" style={{ fontFamily: "Manrope, sans-serif" }}>PunchListJobs</div>
              <div className="text-xs" style={{ color: "var(--theme-accent)" }}>A Blue Collar ME Company</div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="relative">
                <button onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 bg-[#000C66] text-white px-3 py-2 rounded-lg hover:bg-blue-900 transition-colors"
                  data-testid="user-menu-btn">
                  {user.profile_photo || user.logo ? (
                    <img src={`${process.env.REACT_APP_BACKEND_URL}${user.profile_photo || user.logo}`}
                      className="w-7 h-7 rounded-full object-cover" alt="avatar" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "var(--theme-brand)" }}>
                      {user.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="font-semibold text-sm max-w-24 truncate">{user.name}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50"
                    onMouseLeave={() => setDropdownOpen(false)}>
                    <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                      <p className="font-semibold text-[#050A30] dark:text-white text-sm">{user.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                    </div>
                    <div className="p-2">
                      <Link to={dashboardPath} onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-dashboard">
                        <LayoutDashboard className="w-4 h-4" /> Dashboard
                      </Link>
                      <Link to="/profile" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-profile">
                        <User className="w-4 h-4" /> My Profile
                      </Link>
                      <Link to="/subscription" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-subscription">
                        <Settings className="w-4 h-4" /> Subscription
                      </Link>
                      <Link to="/pay-history" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-pay-history">
                        <DollarSign className="w-4 h-4" /> Pay History
                      </Link>
                      {["contractor","admin","superadmin"].includes(user.role) && (
                        <Link to="/archive" onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-archive">
                          <Archive className="w-4 h-4" /> Job Archive
                        </Link>
                      )}
                      <Link to="/settings" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm text-[#050A30] dark:text-white" data-testid="nav-app-settings">
                        <Sliders className="w-4 h-4" /> App Settings
                      </Link>
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm text-red-600 mt-1" data-testid="nav-logout">
                        <LogOut className="w-4 h-4" /> Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !minimal && (
                <div className="flex items-center gap-3">
                  <Link to="/auth?mode=login" className="text-white hover:opacity-80 font-semibold text-sm transition-opacity" data-testid="nav-login">Log In</Link>
                  <Link to="/auth?mode=register" className="text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: "var(--theme-brand)" }} data-testid="nav-signup">Sign Up</Link>
                </div>
              )
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-2">
            <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-2" data-testid="mobile-menu-btn">
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-opacity-20 border-white px-4 pb-4 pt-2" style={{ backgroundColor: "var(--theme-nav-bg)" }}>
          {user ? (
            <>
              <div className="flex items-center gap-3 py-3 border-b border-white border-opacity-20 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: "var(--theme-brand)" }}>
                  {user.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-semibold">{user.name}</p>
                  <p className="text-xs capitalize" style={{ color: "var(--theme-accent)" }}>{user.role}</p>
                </div>
              </div>
              <Link to={dashboardPath} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><LayoutDashboard className="w-4 h-4" /> Dashboard</Link>
              <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><User className="w-4 h-4" /> Profile</Link>
              <Link to="/subscription" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm"><Settings className="w-4 h-4" /> Subscription</Link>
              <Link to="/pay-history" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm" data-testid="mobile-nav-pay-history"><DollarSign className="w-4 h-4" /> Pay History</Link>
              {["contractor","admin","superadmin"].includes(user.role) && (
                <Link to="/archive" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm" data-testid="mobile-nav-archive"><Archive className="w-4 h-4" /> Job Archive</Link>
              )}
              <Link to="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 py-2 text-white text-sm" data-testid="mobile-nav-app-settings">
                <Sliders className="w-4 h-4" /> App Settings
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-2 py-2 text-red-400 text-sm"><LogOut className="w-4 h-4" /> Log Out</button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/auth?mode=login" className="text-white font-semibold py-2">Log In</Link>
              <Link to="/auth?mode=register" className="text-white py-2 px-4 rounded-lg font-bold text-center" style={{ backgroundColor: "var(--theme-brand)" }}>Sign Up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
