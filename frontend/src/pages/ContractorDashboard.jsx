import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import TradeSelect from "../components/TradeSelect";
import Navbar from "../components/Navbar";
import { isFreeUser, UPGRADE_MSG } from "../utils/subscription";
import JobCard from "../components/JobCard";
import JobMap from "../components/JobMap";
import { toast } from "sonner";
import axios from "axios";
import {
  Search, Plus, Zap, Users, ClipboardList, Star, MapPin, X, AlertTriangle,
  AlertCircle, Copy, ExternalLink, Share2, UserCheck, Clock,
  PauseCircle, PlayCircle, Ban, Trash2, Eye, Archive
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_LABELS = {
  open: "Posted",
  fulfilled: "Accepted",
  in_progress: "In Progress",
  completed_pending_review: "Completed",
  completed: "Verified",
  suspended: "Suspended",
  cancelled: "Cancelled",
  draft: "Draft",
};

function RatingModal({ job, onClose, onSubmit }) {
  const [ratings, setRatings] = useState({});
  const [reviews, setReviews] = useState({});
  return (
    <div className="fixed inset-0 bg-black/50 z-[10] flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400"><X className="w-5 h-5" /></button>
        <h2 className="font-extrabold text-[#050A30] dark:text-white text-xl mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Rate Workers</h2>
        {job.crew_accepted?.map(crewId => (
          <div key={crewId} className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm font-semibold mb-2">Worker: {crewId.slice(0, 8)}...</p>
            <div className="flex gap-1 mb-2">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setRatings(r => ({ ...r, [crewId]: s }))}
                  className={`text-2xl transition-colors ${(ratings[crewId] || 0) >= s ? "text-amber-400" : "text-slate-300"}`}>★</button>
              ))}
            </div>
            <textarea placeholder="Write a review..." value={reviews[crewId] || ""}
              onChange={e => setReviews(r => ({ ...r, [crewId]: e.target.value }))}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm dark:bg-slate-700 dark:text-white" rows={2} />
          </div>
        ))}
        <button onClick={() => onSubmit(job, ratings, reviews)}
          className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700"
          data-testid="submit-ratings-btn">Submit Ratings</button>
      </div>
    </div>
  );
}

function CrewProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/users/public/${userId}`)
      .then(r => { setProfile(r.data); setLoading(false); })
      .catch(() => { toast.error("Failed to load profile"); onClose(); });
  }, [userId]);

  const shareProfile = () => {
    const url = `${window.location.origin}/profile/${userId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Profile link copied!"));
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="card p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0000FF] mx-auto" /></div>
    </div>
  );

  if (!profile) return null;
  const photo = profile.profile_photo || profile.logo;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-sm w-full p-6 relative" onClick={e => e.stopPropagation()} data-testid="crew-profile-modal">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>

        <div className="text-center mb-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-[#050A30] flex items-center justify-center mx-auto border-4 border-[#7EC8E3] mb-3">
            {photo ? (
              <img src={`${process.env.REACT_APP_BACKEND_URL}${photo}`} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-extrabold">{profile.name?.[0]?.toUpperCase()}</span>
            )}
          </div>
          <h2 className="font-extrabold text-[#050A30] dark:text-white text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>{profile.name}</h2>
          <p className="text-slate-500 text-sm capitalize">{profile.trade || "General Labor"}</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            {[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(profile.rating || 0) ? "text-amber-400 fill-current" : "text-slate-300"}`} />)}
            <span className="text-xs text-slate-400 ml-1">({profile.rating_count || 0})</span>
          </div>
          {profile.is_online && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Online
            </span>
          )}
        </div>

        {profile.bio && <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 text-center">{profile.bio}</p>}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center bg-blue-50 dark:bg-blue-950 rounded-lg p-2">
            <div className="font-extrabold text-[#0000FF] text-lg">{profile.jobs_completed || 0}</div>
            <div className="text-xs text-slate-500">Jobs Done</div>
          </div>
          <div className="text-center bg-amber-50 dark:bg-amber-950 rounded-lg p-2">
            <div className="font-extrabold text-amber-500 text-lg">{profile.rating_count > 0 ? profile.rating?.toFixed(1) : "New"}</div>
            <div className="text-xs text-slate-500">Rating</div>
          </div>
        </div>

        {profile.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {profile.skills.map(s => (
              <span key={s} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        )}

        {profile.recent_ratings?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">Recent Reviews</p>
            {profile.recent_ratings.slice(0, 2).map((r, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 mb-1">
                <div className="flex gap-0.5 mb-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= r.stars ? "text-amber-400 fill-current" : "text-slate-300"}`} />)}
                </div>
                {r.review && <p className="text-xs text-slate-600 dark:text-slate-400">{r.review}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={shareProfile}
            className="flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors"
            data-testid="modal-share-profile">
            <Share2 className="w-4 h-4" /> Share
          </button>
          <a href={`/profile/${profile.id}`} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg bg-[#0000FF] text-white hover:bg-blue-700 transition-colors"
            data-testid="modal-view-full-profile">
            <ExternalLink className="w-4 h-4" /> Full Profile
          </a>
        </div>
      </div>
    </div>
  );
}

function CrewCard({ member, onRequest, onViewProfile, isViewerFree }) {
  const shareProfile = () => {
    const url = `${window.location.origin}/profile/${member.id}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Profile link copied!"));
  };

  return (
    <div className="card p-4 space-y-3" data-testid={`crew-card-${member.id}`}>
      <div className="flex items-start gap-3">
        {member.profile_photo ? (
          <img src={`${process.env.REACT_APP_BACKEND_URL}${member.profile_photo}`} alt={member.name}
            className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 bg-[#050A30] rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
            {member.name?.[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-[#050A30] dark:text-white truncate">{member.name}</p>
            {member.is_online && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Online" />}
          </div>
          <p className="text-xs text-slate-500 capitalize">{member.trade || "General Labor"}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="w-3 h-3 text-amber-400 fill-current" />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {member.rating_count > 0 ? member.rating?.toFixed(1) : "New"} ({member.rating_count || 0})
            </span>
          </div>
        </div>
        <div className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
          {member.jobs_completed || 0} jobs
        </div>
      </div>
      {member.bio && <p className="text-xs text-slate-500 line-clamp-2">{member.bio}</p>}
      {member.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {member.skills.slice(0, 3).map(s => (
            <span key={s} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">{s}</span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => onViewProfile(member.id)}
          className="flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors"
          data-testid={`view-profile-${member.id}`}>
          <ExternalLink className="w-3 h-3" /> View
        </button>
        <button onClick={shareProfile}
          className="flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors"
          data-testid={`share-profile-${member.id}`}>
          <Share2 className="w-3 h-3" /> Share
        </button>
        <button onClick={() => onRequest(member)}
          className={`flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${isViewerFree ? "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-[#0000FF] text-white hover:bg-blue-700"}`}
          data-testid={`request-crew-${member.id}`}
          title={isViewerFree ? UPGRADE_MSG : "Request crew"}>
          {isViewerFree
            ? <><AlertCircle className="w-3 h-3" /> Locked</>
            : <><UserCheck className="w-3 h-3" /> Request</>
          }
        </button>
      </div>
    </div>
  );
}

export default function ContractorDashboard() {
  const { user } = useAuth();
  const { addListener, connected } = useWebSocket();
  const [jobs, setJobs] = useState([]);
  const [crew, setCrew] = useState([]);
  const [crewSearch, setCrewSearch] = useState({ name: "", trade: "", address: "" });
  const [crewSmartMatch, setCrewSmartMatch] = useState(false);
  const [grouped, setGrouped] = useState([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [ratingJob, setRatingJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subStatus, setSubStatus] = useState(null);
  const [viewingCrewId, setViewingCrewId] = useState(null);
  const [requestingCrew, setRequestingCrew] = useState(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [crewRequests, setCrewRequests] = useState([]);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const [showCompleteProfilePopup, setShowCompleteProfilePopup] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: "", description: "", trade: "", crew_needed: 1,
    start_time: "", pay_rate: "", address: "", is_emergency: false, is_boosted: false
  });
  // Address autofill
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [fetchingAddressSuggestions, setFetchingAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef(null);
  const addressSuggestionsRef = useRef(null);
  // Job action state
  const [previewData, setPreviewData] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [copyEditMode, setCopyEditMode] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jobs/`);
      setJobs(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchCrew = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (crewSearch.name) params.append("name", crewSearch.name);
      if (crewSearch.trade) params.append("trade", crewSearch.trade);
      if (crewSearch.address) params.append("address", crewSearch.address);
      if (crewSmartMatch) params.append("smart_match", "true");
      const res = await axios.get(`${API}/users/crew?${params}`);
      setCrew(res.data);
    } catch (e) { console.error(e); }
  }, [crewSearch, crewSmartMatch]);

  const fetchSubStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/payments/subscription/status`);
      setSubStatus(res.data);
    } catch { }
  }, []);

  const fetchCrewRequests = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/users/requests`);
      setCrewRequests(res.data);
    } catch { }
  }, []);

  const fetchProfileCompletion = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/users/profile-completion`);
      setProfileCompletion(res.data);
      if (!res.data.is_complete) setShowCompleteProfilePopup(true);
    } catch { }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchCrew(), fetchSubStatus(), fetchCrewRequests(), fetchProfileCompletion()]);
      setLoading(false);
    };
    init();
    axios.get(`${API}/trades`).then(r => setGrouped(r.data.categories || [])).catch(() => {});
  }, [fetchJobs, fetchCrew, fetchSubStatus, fetchCrewRequests, fetchProfileCompletion]);

  useEffect(() => {
    const remove = addListener(msg => {
      if (msg.type === "job_accepted") {
        toast.success(`Worker accepted your job! (${msg.crew_count}/${msg.crew_needed} filled)`);
        fetchJobs();
      }
      if (msg.type === "job_completed") {
        toast.info(`Job "${msg.job_title}" marked complete. Please verify.`);
        fetchJobs();
      }
      if (msg.type === "crew_request_accepted") {
        toast.success(`${msg.crew_name} accepted your crew request!`);
        fetchCrewRequests();
      }
      if (msg.type === "crew_request_declined") {
        toast.info(`${msg.crew_name} declined your crew request.`);
        fetchCrewRequests();
      }
    });
    return remove;
  }, [addListener, fetchJobs, fetchCrewRequests]);

  const createJob = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/jobs/`, { ...jobForm, crew_needed: Number(jobForm.crew_needed), pay_rate: Number(jobForm.pay_rate) });
      const msg = jobForm.is_emergency ? "Emergency alert sent! Crew will be notified." : "Job posted! Workers will be notified instantly.";
      toast.success(msg);
      closeJobForm();
      fetchJobs();
    } catch (e) {
      const detail = e?.response?.data?.detail || "Failed to post job";
      if (detail.includes("SUBSCRIPTION_EXPIRED") || detail.includes("FREE_LIMIT_REACHED")) {
        toast.error("Free plan limit reached. Upgrade to post more jobs.");
      } else {
        toast.error(detail);
      }
    }
  };

  const duplicateJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/duplicate`);
      toast.success("Job duplicated and reposted!");
      fetchJobs();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to duplicate");
    }
  };

  const startJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/start`);
      toast.success("Job started!");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const verifyJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/verify`);
      toast.success("Job verified and completed!");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submitRatings = async (job, ratings, reviews) => {
    try {
      for (const [crewId, stars] of Object.entries(ratings)) {
        if (stars > 0) {
          await axios.post(`${API}/jobs/${job.id}/rate`, { rated_id: crewId, job_id: job.id, stars, review: reviews[crewId] || "" });
        }
      }
      toast.success("Ratings submitted!");
      setRatingJob(null);
    } catch { toast.error("Failed to submit ratings"); }
  };

  const requestCrew = (member) => {
    if (isFreeUser(user)) {
      toast.error(UPGRADE_MSG);
      return;
    }
    setRequestingCrew(member);
    setRequestMessage("");
  };

  const sendCrewRequest = async () => {
    if (!requestingCrew) return;
    if (isFreeUser(user)) { toast.error(UPGRADE_MSG); return; }
    try {
      await axios.post(`${API}/users/request/${requestingCrew.id}`, {
        crew_id: requestingCrew.id,
        message: requestMessage,
        job_context: { trade: requestingCrew.trade || "General Labor" }
      });
      toast.success(`Request sent to ${requestingCrew.name}!`);
      setRequestingCrew(null);
      setRequestMessage("");
      fetchCrewRequests();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send request");
    }
  };

  const updateForm = (k, v) => setJobForm(f => ({ ...f, [k]: v }));

  // Address autofill helpers
  const fetchAddressSuggestions = useCallback(async (q) => {
    if (!q || q.length < 3) { setAddressSuggestions([]); setShowAddressSuggestions(false); return; }
    setFetchingAddressSuggestions(true);
    try {
      const res = await axios.get(`${API}/utils/address/search`, { params: { q, limit: 5 } });
      setAddressSuggestions(res.data.results || []);
      setShowAddressSuggestions(true);
    } catch { setAddressSuggestions([]); }
    finally { setFetchingAddressSuggestions(false); }
  }, []);

  const handleJobAddressChange = (val) => {
    updateForm("address", val);
    clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(() => fetchAddressSuggestions(val), 380);
  };

  const selectAddressSuggestion = (s) => {
    updateForm("address", s.full_address);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  };

  const closeJobForm = () => {
    setShowJobForm(false);
    setCopyEditMode(false);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setJobForm({ title: "", description: "", trade: "", crew_needed: 1, start_time: "", pay_rate: "", address: "", is_emergency: false, is_boosted: false });
  };

  // Job lifecycle actions
  const cancelJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/cancel`);
      toast.success("Job cancelled. Crew has been notified.");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to cancel"); }
  };

  const suspendJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/suspend`);
      toast.success("Job suspended. Crew has been notified.");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to suspend"); }
  };

  const reactivateJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/reactivate`);
      toast.success("Job reactivated. Crew has been notified.");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to reactivate"); }
  };

  const deleteJobConfirmed = async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`${API}/jobs/${confirmDeleteId}`);
      toast.success("Job archived — find it in Job Archive.");
      setConfirmDeleteId(null);
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to archive"); }
  };

  const archiveCancelledJob = async (jobId) => {
    try {
      await axios.post(`${API}/jobs/${jobId}/archive`);
      toast.success("Job archived.");
      fetchJobs();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to archive"); }
  };

  const copyJobToForm = (job) => {
    setJobForm({
      title: job.title,
      description: job.description || "",
      trade: job.trade || "",
      crew_needed: job.crew_needed,
      start_time: job.start_time || "",
      pay_rate: job.pay_rate,
      address: job.address || job.location?.full_address || job.location?.address || "",
      is_emergency: false,
      is_boosted: false,
    });
    setCopyEditMode(true);
    setShowJobForm(true);
  };

  const shareJob = (job) => {
    const url = `${window.location.origin}/jobs/${job.id}`;
    if (navigator.share) {
      navigator.share({ title: job.title, text: `$${job.pay_rate}/hr · ${job.trade}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success("Job link copied!"));
    }
  };
  const isExpired = subStatus?.status === "free" && subStatus?.usage_remaining === 0;

  const statusCount = (s) => jobs.filter(j => j.status === s).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />

      <div className="max-w-[1400px] mx-auto px-4 py-4">
        {/* Free limit reached banner */}
        {isExpired && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 rounded-xl p-3 mb-4 flex items-center gap-3" data-testid="contractor-expired-banner">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Free plan limit reached</p>
              <p className="text-xs text-amber-600">Upgrade to post unlimited jobs this month</p>
            </div>
            <a href="/subscription" className="bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-700">Upgrade</a>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#050A30] dark:text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {user?.company_name || user?.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full" data-testid="user-role-badge">
                Contractor
              </span>
              <span className="text-slate-400 text-xs">·</span>
              <p className="text-sm text-slate-500 flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-400"}`} />
                {connected ? "Live updates active" : "Connecting..."}
              </p>
            </div>
          </div>
          <button onClick={() => setShowJobForm(true)}
            className="flex items-center gap-2 bg-[#0000FF] text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors"
            data-testid="post-job-btn">
            <Plus className="w-4 h-4" /> Post Job
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT SIDEBAR - Crew Search */}
          <div className="lg:col-span-3 space-y-3">
            <div className="card p-4">
              <h3 className="font-bold text-[#050A30] dark:text-white text-sm mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>Search Crew</h3>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Name..."
                    value={crewSearch.name}
                    onChange={e => setCrewSearch(s => ({ ...s, name: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid="crew-search-name" />
                </div>
                <TradeSelect
                  grouped={grouped}
                  value={crewSearch.trade}
                  onChange={v => setCrewSearch(s => ({ ...s, trade: v }))}
                  placeholder="All Trades"
                  data-testid="crew-search-trade"
                />
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Location (city, zip)..."
                    value={crewSearch.address}
                    onChange={e => setCrewSearch(s => ({ ...s, address: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid="crew-search-location" />
                </div>
                <div className="flex gap-2">
                  <button onClick={fetchCrew}
                    className="flex-1 bg-[#0000FF] text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                    data-testid="crew-search-btn">
                    Search
                  </button>
                  <button onClick={() => setCrewSmartMatch(s => !s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${crewSmartMatch ? "border-transparent text-[#050A30]" : "border-slate-200 dark:border-slate-600 text-slate-500 hover:border-[#0000FF]"}`}
                    style={crewSmartMatch ? { backgroundColor: "var(--theme-accent)" } : {}}
                    data-testid="crew-smart-match-btn">
                    <Zap className="w-4 h-4" /> Smart
                  </button>
                </div>
              </div>
            </div>

            {/* Crew Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#050A30] dark:text-white text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Available Crew ({crew.length})
                </h3>
              </div>
              {crew.length === 0 ? (
                <div className="card p-6 text-center">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No crew found</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-350px)] overflow-y-auto space-y-3">
                  {crew.map(member => (
                    <div key={member.id} className="relative">
                      {crewSmartMatch && member.match_score !== undefined && (
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shadow"
                          style={{
                            backgroundColor: member.match_score >= 0.7 ? "var(--theme-accent)" : member.match_score >= 0.45 ? "#fbbf24" : "#94a3b8",
                            color: "#050A30",
                          }}
                          data-testid={`crew-score-${member.id}`}>
                          <Zap className="w-3 h-3" />
                          {Math.round(member.match_score * 100)}%
                        </div>
                      )}
                      <CrewCard member={member} onRequest={requestCrew} onViewProfile={setViewingCrewId} isViewerFree={isFreeUser(user)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CENTER - Map */}
          <div className="lg:col-span-6">
            <JobMap
              jobs={jobs.filter(j => ["open", "fulfilled", "in_progress"].includes(j.status))}
              crew={crew}
              profileAddress={user?.address}
              height="580px"
            />
          </div>

          {/* RIGHT SIDEBAR - Jobs */}
          <div className="lg:col-span-3 space-y-3">
            <div className="card p-4">
              <h3 className="font-bold text-[#050A30] dark:text-white text-sm mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>My Jobs ({jobs.length})</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                <div className="text-center bg-emerald-50 dark:bg-emerald-950 rounded-lg p-2">
                  <div className="font-extrabold text-emerald-600 text-lg">{statusCount("open")}</div>
                  <div className="text-xs text-slate-500">Posted</div>
                </div>
                <div className="text-center bg-blue-50 dark:bg-blue-950 rounded-lg p-2">
                  <div className="font-extrabold text-blue-600 text-lg">{statusCount("in_progress")}</div>
                  <div className="text-xs text-slate-500">Active</div>
                </div>
                <div className="text-center bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                  <div className="font-extrabold text-gray-600 text-lg">{statusCount("completed")}</div>
                  <div className="text-xs text-slate-500">Done</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {jobs.length === 0 ? (
                <div className="card p-6 text-center">
                  <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold text-sm">No jobs yet</p>
                  <button onClick={() => setShowJobForm(true)} className="mt-3 text-[#0000FF] text-sm font-semibold">Post your first job</button>
                </div>
              ) : jobs.map(job => (
                <div key={job.id} className="space-y-1">
                  <JobCard job={job} onStart={startJob} onVerify={verifyJob} onRate={setRatingJob} currentUser={user} />
                  {/* Job action bar */}
                  <div className="flex items-center gap-1 px-1 pb-1">
                    <button onClick={() => shareJob(job)} title="Share job link"
                      className="p-1.5 rounded text-slate-400 hover:text-[#0000FF] hover:bg-blue-50 transition-colors"
                      data-testid={`share-job-${job.id}`}>
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setPreviewData(job)} title="Preview"
                      className="p-1.5 rounded text-slate-400 hover:text-[#0000FF] hover:bg-blue-50 transition-colors"
                      data-testid={`preview-job-${job.id}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => copyJobToForm(job)} title="Copy & edit"
                      className="p-1.5 rounded text-slate-400 hover:text-[#0000FF] hover:bg-blue-50 transition-colors"
                      data-testid={`copy-job-${job.id}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {["open", "fulfilled"].includes(job.status) && (
                      <button onClick={() => suspendJob(job.id)} title="Suspend"
                        className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        data-testid={`suspend-job-${job.id}`}>
                        <PauseCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {job.status === "suspended" && (
                      <button onClick={() => reactivateJob(job.id)} title="Reactivate"
                        className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        data-testid={`reactivate-job-${job.id}`}>
                        <PlayCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {["open", "fulfilled", "suspended"].includes(job.status) && (
                      <button onClick={() => cancelJob(job.id)} title="Cancel job"
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        data-testid={`cancel-job-${job.id}`}>
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {job.status === "cancelled" && (
                      <button onClick={() => archiveCancelledJob(job.id)} title="Archive"
                        className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        data-testid={`archive-cancelled-${job.id}`}>
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {job.status !== "in_progress" && job.status !== "cancelled" && (
                      <button onClick={() => setConfirmDeleteId(job.id)} title="Archive job"
                        className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        data-testid={`delete-job-${job.id}`}>
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showJobForm && (
        <div className="fixed inset-0 bg-black/50 z-[10] flex items-center justify-center p-4 overflow-y-auto">
          <div className="card max-w-lg w-full p-6 relative my-4">
            <button onClick={closeJobForm} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            <h2 className="font-extrabold text-[#050A30] dark:text-white text-xl mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>
              {copyEditMode ? "Copy & Edit Job" : "Post a Job"}
            </h2>
            <p className="text-slate-500 text-sm mb-5">
              {copyEditMode ? "Edit the copied job details, then post." : "Workers will be notified in real-time"}
            </p>

            <form onSubmit={createJob} className="space-y-4">
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => updateForm("is_emergency", false)}
                  className={`flex-1 py-2.5 rounded-lg font-bold text-sm border-2 transition-colors ${!jobForm.is_emergency ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200"}`}
                  data-testid="regular-job-btn">Regular Job</button>
                <button type="button" onClick={() => updateForm("is_emergency", true)}
                  className={`flex-1 py-2.5 rounded-lg font-bold text-sm border-2 flex items-center justify-center gap-1 transition-colors ${jobForm.is_emergency ? "bg-red-600 text-white border-red-600" : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200"}`}
                  data-testid="emergency-job-btn">
                  <AlertTriangle className="w-4 h-4" /> Emergency
                </button>
              </div>

              {/* Boost flag (paid feature) */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-[#050A30] dark:text-white">Job Boost <span className="text-purple-500 text-[10px] font-semibold ml-1">PAID</span></p>
                  <p className="text-xs text-slate-400">Priority placement in crew feed</p>
                </div>
                <button type="button"
                  onClick={() => updateForm("is_boosted", !jobForm.is_boosted)}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${jobForm.is_boosted ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-600"}`}
                  data-testid="boost-job-toggle">
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${jobForm.is_boosted ? "translate-x-5" : ""}`} />
                </button>
              </div>

              {jobForm.is_emergency && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg p-3 text-xs text-red-700 dark:text-red-300">
                  Emergency jobs broadcast to all nearby crew. First to accept wins the slot.
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Job Title *</label>
                <input type="text" required value={jobForm.title} onChange={e => updateForm("title", e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="e.g. Framing Crew Needed" data-testid="job-title-input" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Description</label>
                <textarea value={jobForm.description} onChange={e => updateForm("description", e.target.value)} rows={3}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                  placeholder="Describe the work..." data-testid="job-desc-input" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Trade *</label>
                  <TradeSelect
                    grouped={grouped}
                    value={jobForm.trade}
                    onChange={v => updateForm("trade", v)}
                    required
                    placeholder="Select trade"
                    data-testid="job-trade-select"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Crew Needed *</label>
                  <input type="number" min="1" max="50" required value={jobForm.crew_needed} onChange={e => updateForm("crew_needed", e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid="job-crew-needed-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Start Time *</label>
                  <input type="datetime-local" required value={jobForm.start_time} onChange={e => updateForm("start_time", e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    data-testid="job-start-time-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Pay Rate ($/hr) *</label>
                  <input type="number" min="1" step="0.50" required value={jobForm.pay_rate} onChange={e => updateForm("pay_rate", e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    placeholder="25.00" data-testid="job-pay-rate-input" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#050A30] dark:text-white mb-1">Job Location (Address) *</label>
                <div className="relative" ref={addressSuggestionsRef}>
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10" />
                  <input type="text" required value={jobForm.address}
                    onChange={e => handleJobAddressChange(e.target.value)}
                    onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                    autoComplete="off"
                    className="w-full pl-9 pr-8 border border-slate-300 dark:border-slate-600 rounded-lg py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white"
                    placeholder="123 Main St, Atlanta, GA" data-testid="job-address-input" />
                  {fetchingAddressSuggestions && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[#0000FF] border-t-transparent rounded-full animate-spin" />
                  )}
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <ul className="absolute z-[11] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {addressSuggestions.map((s, i) => (
                        <li key={i} onMouseDown={() => selectAddressSuggestion(s)}
                          className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0">
                          <MapPin className="w-3.5 h-3.5 text-[#0000FF] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-[#050A30] dark:text-white leading-tight">
                              {s.city && s.state ? `${s.city}, ${s.state}` : s.full_address.split(",").slice(0, 2).join(",")}
                            </p>
                            <p className="text-xs text-slate-400 truncate max-w-xs">{s.full_address}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setPreviewData({ ...jobForm, contractor_name: user?.company_name || user?.name, status: "open", crew_accepted: [], location: { city: jobForm.address?.split(",")[1]?.trim() || jobForm.address } })}
                  className="flex-1 flex items-center justify-center gap-1.5 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 py-3 rounded-xl font-bold text-sm hover:border-slate-300 transition-colors"
                  data-testid="preview-form-btn">
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button type="submit"
                  className="flex-1 bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
                  data-testid="submit-job-btn">
                  {copyEditMode ? "Post Copy" : jobForm.is_emergency ? "Send Emergency Alert" : "Post Job Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Crew Request Modal */}
      {requestingCrew && (
        <div className="fixed inset-0 bg-black/50 z-[10] flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 relative" data-testid="crew-request-modal">
            <button onClick={() => setRequestingCrew(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            <h2 className="font-extrabold text-[#050A30] dark:text-white text-xl mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>
              Request {requestingCrew.name}
            </h2>
            <p className="text-slate-500 text-sm mb-4">{requestingCrew.trade || "General Labor"}</p>
            <textarea
              value={requestMessage}
              onChange={e => setRequestMessage(e.target.value)}
              placeholder="Add a message (optional)... e.g. I need help with a framing job next week"
              rows={3}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white mb-4"
              data-testid="crew-request-message"
            />
            <button onClick={sendCrewRequest}
              className="w-full bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
              data-testid="send-crew-request-btn">
              Send Request
            </button>
          </div>
        </div>
      )}

      {ratingJob && <RatingModal job={ratingJob} onClose={() => setRatingJob(null)} onSubmit={submitRatings} />}
      {viewingCrewId && <CrewProfileModal userId={viewingCrewId} onClose={() => setViewingCrewId(null)} />}

      {/* Job Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/60 z-[11] flex items-center justify-center p-4" onClick={() => setPreviewData(null)}>
          <div className="max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="card p-3 mb-3 bg-blue-50 dark:bg-blue-950 flex items-center justify-center gap-2">
              <Eye className="w-4 h-4 text-blue-500" />
              <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Crew Preview</p>
            </div>
            <JobCard
              job={{ ...previewData, id: previewData.id || "preview", status: previewData.status || "open", crew_accepted: [] }}
              currentUser={{ role: "crew" }}
            />
            <button onClick={() => setPreviewData(null)}
              className="mt-3 w-full py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl text-sm font-semibold"
              data-testid="close-preview-btn">
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Confirm Archive Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 z-[11] flex items-center justify-center p-4">
          <div className="card max-w-sm w-full p-6" data-testid="confirm-delete-modal">
            <div className="text-center mb-4">
              <Archive className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--theme-accent)" }} />
              <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Archive this job?</h3>
              <p className="text-slate-500 text-sm mt-1">The job will be moved to your archive. You can unarchive or permanently delete it there.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 dark:border-slate-700 text-slate-600 rounded-xl text-sm font-semibold"
                data-testid="cancel-delete-btn">Cancel</button>
              <button onClick={deleteJobConfirmed}
                className="flex-1 py-2.5 text-white rounded-xl text-sm font-bold hover:opacity-90"
                style={{ backgroundColor: "var(--theme-brand)" }}
                data-testid="confirm-delete-btn">Archive Job</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Completion Popup */}
      {showCompleteProfilePopup && profileCompletion && !profileCompletion.is_complete && (
        <div className="fixed inset-0 bg-black/50 z-[12] flex items-center justify-center p-4" data-testid="profile-completion-popup">
          <div className="card max-w-sm w-full p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCompleteProfilePopup(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="font-extrabold text-[#050A30] dark:text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                Complete Your Profile
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                You can have a better experience, Please complete profile!
              </p>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-500">Progress</span>
                <span className="text-[#0000FF]">{profileCompletion.percentage}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                <div className="bg-[#0000FF] h-2.5 rounded-full transition-all" style={{ width: `${profileCompletion.percentage}%` }} />
              </div>
            </div>
            <a href="/profile"
              className="block w-full text-center bg-[#0000FF] text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
              data-testid="popup-complete-profile-btn">
              Complete Profile
            </a>
            <button onClick={() => setShowCompleteProfilePopup(false)}
              className="block w-full text-center text-slate-400 text-sm mt-2 hover:text-slate-600"
              data-testid="popup-dismiss-btn">
              Maybe Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
