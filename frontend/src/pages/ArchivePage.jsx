import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import { toast } from "sonner";
import { Archive, RotateCcw, Trash2, Eye, X, Briefcase, MapPin, DollarSign, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_COLOR = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  fulfilled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ArchivePage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [confirmPerm, setConfirmPerm] = useState(null);

  const fetchArchive = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/jobs/archive`);
      setJobs(res.data);
    } catch (e) {
      toast.error("Failed to load archive");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArchive(); }, [fetchArchive]);

  const unarchive = async (jobId) => {
    try {
      const res = await axios.post(`${API}/jobs/${jobId}/unarchive`);
      toast.success(`Job restored to "${res.data.status}"`);
      fetchArchive();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to unarchive"); }
  };

  const permanentDelete = async (jobId) => {
    try {
      await axios.delete(`${API}/jobs/${jobId}/permanent`);
      toast.success("Job permanently deleted");
      setConfirmPerm(null);
      fetchArchive();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to delete"); }
  };

  if (!user || !["contractor", "admin", "superadmin"].includes(user.role)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117]">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-400">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--theme-nav-bg)" }}>
            <Archive className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              Job Archive
            </h1>
            <p className="text-sm text-slate-500">
              {jobs.length} archived job{jobs.length !== 1 ? "s" : ""} — unarchive to repost or permanently delete
            </p>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#0000FF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="card p-16 text-center">
            <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold">Archive is empty</p>
            <p className="text-sm text-slate-400 mt-1">Deleted or cancelled jobs will appear here</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="archive-list">
            {jobs.map(job => (
              <div key={job.id}
                className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                data-testid={`archive-row-${job.id}`}>

                {/* Left: job info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-[#050A30] dark:text-white text-sm truncate" style={{ fontFamily: "Manrope, sans-serif" }}>
                      {job.title}
                    </span>
                    {job.pre_archive_status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOR[job.pre_archive_status] || "bg-slate-100 text-slate-500"}`}>
                        was {job.pre_archive_status}
                      </span>
                    )}
                    {job.is_boosted && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 font-semibold">Boosted</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {job.trade}</span>
                    {job.location?.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location.city}</span>}
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${job.pay_rate}/hr</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Archived {fmtDate(job.archived_at)}</span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setPreview(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    data-testid={`archive-preview-${job.id}`}>
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                  <button
                    onClick={() => unarchive(job.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: "var(--theme-brand)" }}
                    data-testid={`archive-unarchive-${job.id}`}>
                    <RotateCcw className="w-3.5 h-3.5" /> Unarchive
                  </button>
                  <button
                    onClick={() => setConfirmPerm(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    data-testid={`archive-delete-${job.id}`}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)} data-testid="archive-preview-modal">
          <div className="card max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreview(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
            {preview.is_emergency && (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-700 text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Emergency Job</div>
            )}
            <h2 className="font-extrabold text-[#050A30] dark:text-white text-xl mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>{preview.title}</h2>
            <p className="text-slate-500 text-sm mb-4 capitalize">{preview.trade}</p>
            {preview.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">{preview.description}</p>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Pay Rate</span><span className="font-bold" style={{ color: "var(--theme-brand)" }}>${preview.pay_rate}/hr</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Crew Needed</span><span className="font-semibold text-slate-700 dark:text-slate-300">{preview.crew_needed}</span></div>
              {preview.location?.city && (
                <div className="flex justify-between"><span className="text-slate-500">Location</span><span className="font-semibold text-slate-700 dark:text-slate-300">{preview.location.city}</span></div>
              )}
              {preview.archived_at && (
                <div className="flex justify-between"><span className="text-slate-500">Archived</span><span className="font-semibold text-slate-700 dark:text-slate-300">{fmtDate(preview.archived_at)}</span></div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { unarchive(preview.id); setPreview(null); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "var(--theme-brand)" }}
                data-testid="preview-unarchive-btn">
                Unarchive Job
              </button>
              <button onClick={() => { setConfirmPerm(preview); setPreview(null); }}
                className="px-4 py-2.5 rounded-xl font-bold text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 text-sm"
                data-testid="preview-delete-btn">
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation */}
      {confirmPerm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" data-testid="confirm-perm-modal">
          <div className="card max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-bold text-[#050A30] dark:text-white text-center mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
              Permanently Delete?
            </h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              "<strong>{confirmPerm.title}</strong>" will be gone forever. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmPerm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-slate-600 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 text-sm"
                data-testid="cancel-perm-delete-btn">
                Cancel
              </button>
              <button onClick={() => permanentDelete(confirmPerm.id)}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 text-sm"
                data-testid="confirm-perm-delete-btn">
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
