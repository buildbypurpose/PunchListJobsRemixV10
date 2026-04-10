import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import Navbar from "../components/Navbar";
import axios from "axios";
import { toast } from "sonner";
import {
  MessageCircle, Send, ChevronLeft, Briefcase, Shield, Loader2,
  MessageSquare, Lock, Trash2
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ThreadItem({ thread, active, myId, isAdmin, onDelete, onClick }) {
  const isJob = thread.type === "job_chat";
  const other = thread.participants?.find(p => p.user_id !== myId);
  const label = isJob ? thread.job_title : (thread.user_name || other?.name || "Support");
  const sub = isJob ? `with ${other?.name || ""}` : (isJob ? "" : thread.user_role || "");

  return (
    <button
      onClick={onClick}
      data-testid={`thread-item-${thread.id}`}
      className={`w-full text-left px-4 py-3 border-b border-slate-200 dark:border-slate-800 transition-colors flex items-start gap-3 group ${
        active ? "bg-blue-50 dark:bg-blue-950/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold ${
        isJob ? "bg-[#0000FF]" : "bg-emerald-600"
      }`}>
        {isJob ? <Briefcase className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-semibold text-[#050A30] dark:text-white truncate">{label}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-slate-400">{formatTime(thread.last_message_at)}</span>
            {isAdmin && (
              <button
                onClick={(e) => onDelete(thread.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-400 hover:text-red-600 transition-all"
                data-testid={`delete-thread-${thread.id}`}
                title="Delete thread"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 truncate">{sub}</p>
        <p className="text-xs text-slate-400 truncate mt-0.5">{thread.last_message || "No messages yet"}</p>
      </div>
      {thread.my_unread > 0 && (
        <span className="w-5 h-5 rounded-full bg-[#0000FF] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {thread.my_unread > 9 ? "9+" : thread.my_unread}
        </span>
      )}
    </button>
  );
}

function MessageBubble({ msg, isOwn }) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isOwn
          ? "bg-[#0000FF] text-white rounded-br-sm"
          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm"
      }`}>
        {!isOwn && (
          <p className="text-xs font-semibold mb-0.5 capitalize text-[#0000FF] dark:text-blue-400">
            {msg.sender_name}
          </p>
        )}
        <p className="text-sm leading-relaxed break-words">{msg.content}</p>
        <p className={`text-xs mt-1 ${isOwn ? "text-blue-200" : "text-slate-400"} text-right`}>
          {formatTime(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { addListener, setUnreadMessages } = useWebSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true);
  const messagesEndRef = useRef(null);
  const isAdmin = ["admin", "superadmin", "subadmin"].includes(user?.role);

  const fetchThreads = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/messages/threads`);
      setThreads(data);
      return data;
    } catch { return []; }
  }, []);

  const openThread = useCallback(async (threadId) => {
    setActiveThread(null);
    setMessages([]);
    try {
      const { data } = await axios.get(`${API}/messages/threads/${threadId}`);
      setActiveThread(data.thread);
      setMessages(data.messages);
      setShowList(false);
      setSearchParams({ thread: threadId });
      // Mark as read
      await axios.post(`${API}/messages/threads/${threadId}/read`);
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, my_unread: 0 } : t));
      if (setUnreadMessages) setUnreadMessages(c => Math.max(0, c - (data.thread.my_unread || 0)));
    } catch { toast.error("Failed to load messages"); }
  }, [setSearchParams, setUnreadMessages]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchThreads().then(tList => {
      setLoading(false);
      const tid = searchParams.get("thread");
      if (tid) openThread(tid);
    });
  }, []);

  // WS: real-time new messages
  useEffect(() => {
    const remove = addListener((msg) => {
      if (msg.type === "new_message") {
        // Update thread list
        setThreads(prev => prev.map(t =>
          t.id === msg.thread_id
            ? { ...t, last_message: msg.message.content, last_message_at: msg.message.created_at, my_unread: (t.my_unread || 0) + 1 }
            : t
        ));
        // If this thread is currently open, append message + mark read
        setActiveThread(curr => {
          if (curr?.id === msg.thread_id) {
            setMessages(prev => [...prev, msg.message]);
            axios.post(`${API}/messages/threads/${msg.thread_id}/read`).catch(() => {});
            setThreads(prev2 => prev2.map(t => t.id === msg.thread_id ? { ...t, my_unread: 0 } : t));
          }
          return curr;
        });
      }
    });
    return remove;
  }, [addListener]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = async () => {
    const content = input.trim();
    if (!content || !activeThread) return;
    setSending(true);
    setInput("");
    try {
      const { data } = await axios.post(`${API}/messages/threads/${activeThread.id}/send`, { content });
      setMessages(prev => [...prev, data]);
      setThreads(prev => prev.map(t => t.id === activeThread.id
        ? { ...t, last_message: content, last_message_at: data.created_at }
        : t
      ));
    } catch (e) {
      const detail = e?.response?.data?.detail || "";
      if (detail.includes("UPGRADE_REQUIRED")) {
        toast.error("Upgrade your plan to send messages");
      } else {
        toast.error(detail || "Failed to send");
      }
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const deleteThread = async (threadId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this thread and all messages?")) return;
    try {
      await axios.delete(`${API}/messages/threads/${threadId}`);
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) { setActiveThread(null); setMessages([]); setShowList(true); }
      toast.success("Thread deleted");
    } catch { toast.error("Failed to delete thread"); }
  };
  return (
    <div className="min-h-screen bg-[#050A30]" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>
          <div className="flex h-full">

            {/* Thread List */}
            <div className={`${showList ? "flex" : "hidden"} md:flex flex-col w-full md:w-80 border-r border-slate-200 dark:border-slate-800 flex-shrink-0`}>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-extrabold text-[#050A30] dark:text-white text-base flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                  <MessageCircle className="w-4 h-4 text-[#0000FF]" /> Messages
                </h2>
                {isAdmin && <p className="text-xs text-slate-400 mt-0.5">Support + job conversations</p>}
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="py-12 text-center px-4">
                    <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No conversations yet</p>
                    <p className="text-slate-400 text-xs mt-1">Start a chat from a job card or contact admin support</p>
                  </div>
                ) : (
                  threads.map(t => (
                    <ThreadItem
                      key={t.id}
                      thread={t}
                      active={activeThread?.id === t.id}
                      myId={user?.id}
                      isAdmin={isAdmin}
                      onDelete={deleteThread}
                      onClick={() => openThread(t.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Chat Panel */}
            <div className={`${!showList ? "flex" : "hidden"} md:flex flex-col flex-1 min-w-0`}>
              {!activeThread ? (
                <div className="flex-1 flex items-center justify-center flex-col gap-3">
                  <MessageCircle className="w-14 h-14 text-slate-200" />
                  <p className="text-slate-400 font-semibold">Select a conversation</p>
                  <p className="text-slate-300 text-sm">Choose a thread from the left to start chatting</p>
                </div>
              ) : (
                <>
                  {/* Chat Header */}
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                    <button onClick={() => { setShowList(true); setActiveThread(null); }} className="md:hidden text-slate-400 hover:text-slate-600">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${activeThread.type === "job_chat" ? "bg-[#0000FF]" : "bg-emerald-600"}`}>
                      {activeThread.type === "job_chat" ? <Briefcase className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-bold text-[#050A30] dark:text-white text-sm">
                        {activeThread.type === "job_chat" ? activeThread.job_title : (activeThread.user_name || "Admin Support")}
                      </p>
                      <p className="text-xs text-slate-400">
                        {activeThread.type === "job_chat" ? "Job Chat" : "Support Thread"} · {activeThread.participants?.length || 0} participants
                      </p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50 dark:bg-slate-950/50">
                    {messages.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">No messages yet. Say hello!</div>
                    ) : (
                      messages.map(msg => (
                        <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user?.id} />
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800">
                    {isFree ? (
                      <div className="flex items-center gap-2 py-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                        <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">Upgrade your plan to send messages</p>
                        <button onClick={() => navigate("/subscription")} className="text-xs font-bold text-[#0000FF] hover:underline">Upgrade</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
                          placeholder="Type a message…"
                          data-testid="message-input"
                          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0000FF]/30"
                        />
                        <button
                          onClick={sendMsg}
                          disabled={sending || !input.trim()}
                          data-testid="send-message-btn"
                          className="w-10 h-10 rounded-xl bg-[#0000FF] text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
