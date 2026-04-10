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
