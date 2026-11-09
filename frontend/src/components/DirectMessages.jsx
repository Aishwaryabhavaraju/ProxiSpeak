import React, { useState, useEffect, useRef } from "react";
import { Send, User, MessageCircle, ArrowLeft, Smile } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { API_BASE_URL } from "../services/authApi";
import "../styles/TeamChat.css";

export default function DirectMessages({
  currentUsername,
  colleagues = [],
  directMessages = [],
  onSendDirectMessage,
  unreadCounts = {},
  onClearUnread,
}) {
  const [selectedColleague, setSelectedColleague] = useState(null);
  const [inputText, setInputText] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [historyMessages, setHistoryMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [historyMessages, directMessages]);

  // Fetch DM history when colleague is selected
  useEffect(() => {
    if (!selectedColleague || !currentUsername) return;

    if (onClearUnread) {
      onClearUnread(selectedColleague.userId || selectedColleague.id);
    }

    let isMounted = true;
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const targetId = selectedColleague.userId || selectedColleague.id;
        const res = await fetch(
          `${API_BASE_URL}/chat/direct/${encodeURIComponent(currentUsername)}/${encodeURIComponent(targetId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && Array.isArray(data.messages)) {
            setHistoryMessages(data.messages);
          }
        }
      } catch (err) {
        console.warn("Failed to load direct message history:", err.message);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [selectedColleague, currentUsername, onClearUnread]);

  // Merge loaded history with incoming real-time DMs for this recipient
  const activeConversationMessages = React.useMemo(() => {
    if (!selectedColleague) return [];
    const targetId = selectedColleague.userId || selectedColleague.id;

    // Filter real-time directMessages
    const rtFiltered = directMessages.filter((m) => {
      const isWithColleague =
        (m.senderId === currentUsername && m.recipientId === targetId) ||
        (m.senderId === targetId && m.recipientId === currentUsername);
      return isWithColleague;
    });

    const seenIds = new Set();
    const combined = [];
    for (const msg of [...historyMessages, ...rtFiltered]) {
      const id = msg.messageId || msg.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push(msg);
      }
    }
    return combined;
  }, [selectedColleague, currentUsername, historyMessages, directMessages]);

  function handleSend(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !selectedColleague) return;

    onSendDirectMessage({
      recipientId: selectedColleague.userId || selectedColleague.id,
      recipientUsername: selectedColleague.username,
      text,
    });

    setInputText("");
    setShowPicker(false);
  }

  function handleEmojiInsert(emoji) {
    setInputText((prev) => prev + emoji);
  }

  function formatTime(isoString) {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return (
    <div className="team-chat-container dm-container">
      {/* View A: Select a Colleague list */}
      {!selectedColleague ? (
        <div className="dm-user-picker">
          <div className="team-chat-header">
            <div className="team-chat-title-group">
              <MessageCircle size={16} className="team-chat-hash-icon" />
              <span className="team-chat-room-name">Direct Messages</span>
            </div>
            <span className="team-chat-badge">{colleagues.length} online</span>
          </div>

          <div className="dm-user-list">
            {colleagues.length === 0 ? (
              <div className="team-chat-empty">
                <User size={32} className="team-chat-empty-icon" />
                <p className="team-chat-empty-text">No colleagues online</p>
                <span className="team-chat-empty-sub">Invite your team to start chatting!</span>
              </div>
            ) : (
              colleagues.map((colleague) => {
                const id = colleague.userId || colleague.id;
                const unread = unreadCounts[id] || 0;
                return (
                  <button
                    key={id}
                    type="button"
                    className="dm-user-row"
                    onClick={() => setSelectedColleague(colleague)}
                  >
                    <div
                      className="team-chat-avatar"
                      style={{ backgroundColor: colleague.color || "#5EEAD4" }}
                    >
                      {(colleague.username || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="dm-user-info">
                      <span className="dm-user-name">{colleague.username}</span>
                      <span className="dm-user-status">Online in room</span>
                    </div>
                    {unread > 0 && <span className="dm-unread-badge">{unread}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* View B: Active 1-to-1 Conversation */
        <>
          <div className="team-chat-header">
            <button
              type="button"
              className="dm-back-btn"
              onClick={() => setSelectedColleague(null)}
              title="Back to colleagues"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="team-chat-title-group">
              <div
                className="team-chat-avatar"
                style={{ backgroundColor: selectedColleague.color || "#5EEAD4", width: 22, height: 22 }}
              >
                {(selectedColleague.username || "U").charAt(0).toUpperCase()}
              </div>
              <span className="team-chat-room-name">{selectedColleague.username}</span>
            </div>
            <span className="team-chat-badge">Direct</span>
          </div>

          <div className="team-chat-body">
            {loadingHistory ? (
              <div className="team-chat-empty">Loading history...</div>
            ) : activeConversationMessages.length === 0 ? (
              <div className="team-chat-empty">
                <MessageCircle size={32} className="team-chat-empty-icon" />
                <p className="team-chat-empty-text">Private conversation with {selectedColleague.username}</p>
                <span className="team-chat-empty-sub">Only you two can see these messages.</span>
              </div>
            ) : (
              activeConversationMessages.map((msg, index) => {
                const isMe = msg.senderId === currentUsername || msg.senderUsername === currentUsername;
                return (
                  <div
                    key={msg.id || msg.messageId || index}
                    className={`team-chat-msg ${isMe ? "team-chat-msg-me" : "team-chat-msg-other"}`}
                  >
                    <div className="team-chat-content">
                      <div className="team-chat-meta">
                        <span className="team-chat-sender">{isMe ? "You" : selectedColleague.username}</span>
                        <span className="team-chat-time">{formatTime(msg.timestamp || msg.createdAt)}</span>
                      </div>
                      <div className="team-chat-bubble">
                        <p className="team-chat-text">{msg.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="team-chat-footer">
            {showPicker && (
              <div className="input-picker-anchor">
                <EmojiPicker
                  onSelectEmoji={handleEmojiInsert}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}

            <button
              type="button"
              className={`team-chat-emoji-trigger-btn ${showPicker ? "active" : ""}`}
              onClick={() => setShowPicker((v) => !v)}
              title="Insert Emoji"
            >
              <Smile size={18} />
            </button>

            <input
              ref={inputRef}
              type="text"
              className="team-chat-input"
              placeholder={`Message ${selectedColleague.username}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />

            <button
              type="submit"
              className="team-chat-send-btn"
              disabled={!inputText.trim()}
              title="Send direct message"
            >
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

