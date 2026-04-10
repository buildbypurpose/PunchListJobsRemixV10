import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import axios from "axios";

const WS_URL = process.env.REACT_APP_BACKEND_URL
  ? process.env.REACT_APP_BACKEND_URL.replace(/^https?/, "wss").replace(/^http/, "ws")
  : "ws://localhost:8001";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { token, user } = useAuth();
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const listeners = useRef([]);
  const reconnectTimer = useRef(null);

  // Poll unread message count
  useEffect(() => {
    if (!token) { setUnreadMessages(0); return; }
    const fetch = () => axios.get(`${BACKEND_URL}/api/messages/unread-count`)
      .then(r => setUnreadMessages(r.data.count || 0)).catch(() => {});
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [token]);

  // Request browser notification permission on first connection
  useEffect(() => {
    if (token && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [token]);

  const connect = useCallback(() => {
    if (!token || ws.current?.readyState === WebSocket.OPEN) return;

    ws.current = new WebSocket(`${WS_URL}/api/ws/${token}`);

    ws.current.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.current.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setLastMessage(data);
        listeners.current.forEach(fn => fn(data));
        // Increment unread badge for new messages from others
        if (data.type === "new_message") {
          setUnreadMessages(c => c + 1);
          // Mobile/browser push notification
          const msg = data.message || {};
          const senderName = msg.sender_name || "New message";
          const content = msg.content || "";
          if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "hidden") {
            new Notification(`${senderName}`, {
              body: content.length > 80 ? content.slice(0, 77) + "…" : content,
              icon: "/logo192.png",
              tag: data.thread_id,
            });
          }
          // In-app banner via sonner toast (always shown)
          if (document.visibilityState === "visible") {
            const { toast: showToast } = require("sonner");
            showToast(`${senderName}: ${content.length > 60 ? content.slice(0, 57) + "…" : content}`, {
              duration: 4000,
              action: { label: "View", onClick: () => { window.location.href = `/messages?thread=${data.thread_id}`; } },
            });
          }
        }
      } catch { }
    };

    ws.current.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [token, connect]);

  const sendMessage = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const addListener = useCallback((fn) => {
    listeners.current.push(fn);
    return () => {
      listeners.current = listeners.current.filter(l => l !== fn);
    };
  }, []);

  const sendLocation = useCallback((lat, lng, city = "") => {
    sendMessage({ type: "location_update", lat, lng, city });
  }, [sendMessage]);

  return (
    <WebSocketContext.Provider value={{ connected, lastMessage, sendMessage, addListener, sendLocation, unreadMessages, setUnreadMessages }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
};
