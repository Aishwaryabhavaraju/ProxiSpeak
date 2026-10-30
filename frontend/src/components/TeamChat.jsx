import React, { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Hash } from "lucide-react";
import "../styles/TeamChat.css";

export default function TeamChat({ roomId, roomName, messages = [], onSendMessage, currentUsername }) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    onSendMessage(text);
    setInputText("");
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
    <div className="team-chat-container">
      {/* Chat Header */}
      <div className="team-chat-header">
        <div className="team-chat-title-group">
          <Hash size={16} className="team-chat-hash-icon" />
          <span className="team-chat-room-name">{roomName || roomId || "Team Chat"}</span>
        </div>
        <span className="team-chat-badge">{messages.length} msgs</span>
      </div>

      {/* Messages Scroll Area */}
      <div className="team-chat-body">
        {messages.length === 0 ? (
          <div className="team-chat-empty">
            <MessageSquare size={32} className="team-chat-empty-icon" />
            <p className="team-chat-empty-text">No messages yet in this office.</p>
            <span className="team-chat-empty-sub">Say hello to your colleagues!</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe =
              msg.username === currentUsername ||
              (msg.userId && msg.userId === currentUsername);
            const userInitial = (msg.username || "U").charAt(0).toUpperCase();
            const senderColor = msg.color || "#818CF8";

            return (
              <div
                key={msg.id || index}
                className={`team-chat-msg ${isMe ? "team-chat-msg-me" : "team-chat-msg-other"}`}
              >
                {!isMe && (
                  <div
                    className="team-chat-avatar"
                    style={{ backgroundColor: senderColor }}
                  >
                    {userInitial}
                  </div>
                )}
                <div className="team-chat-content">
                  <div className="team-chat-meta">
                    <span className="team-chat-sender">
                      {isMe ? "You" : msg.username}
                    </span>
                    <span className="team-chat-time">
                      {formatTime(msg.timestamp)}
                    </span>
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

      {/* Message Input Box */}
      <form onSubmit={handleSend} className="team-chat-footer">
        <input
          type="text"
          className="team-chat-input"
          placeholder="Send a message to this office..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={500}
        />
        <button
          type="submit"
          className="team-chat-send-btn"
          disabled={!inputText.trim()}
          title="Send message (Enter)"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

