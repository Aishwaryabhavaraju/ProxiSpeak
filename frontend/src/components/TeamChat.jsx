import React, { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Hash, Smile, Plus } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { QUICK_REACTIONS } from "../utils/emojiData";
import "../styles/TeamChat.css";

export default function TeamChat({
  roomId,
  roomName,
  messages = [],
  onSendMessage,
  onSendReaction,
  currentUsername,
}) {
  const [inputText, setInputText] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [activeMessageReactionPicker, setActiveMessageReactionPicker] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
    setShowPicker(false);
  }

  function handleEmojiInsert(emoji) {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || inputText.length;
      const end = input.selectionEnd || inputText.length;
      const updated = inputText.substring(0, start) + emoji + inputText.substring(end);
      setInputText(updated);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setInputText((prev) => prev + emoji);
    }
  }

  function handleReactionClick(messageId, emoji) {
    if (onSendReaction && messageId && emoji) {
      onSendReaction({ messageId, emoji });
    }
    setActiveMessageReactionPicker(null);
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
            const messageId = msg.id || msg.messageId || `msg-${index}`;
            const isMe =
              msg.username === currentUsername ||
              (msg.userId && msg.userId === currentUsername) ||
              (msg.senderId && msg.senderId === currentUsername);
            const userInitial = (msg.username || "U").charAt(0).toUpperCase();
            const senderColor = msg.color || msg.senderColor || "#818CF8";
            const reactionsMap = msg.reactions || {};
            const reactionEntries = Object.entries(reactionsMap).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );

            return (
              <div
                key={messageId}
                className={`team-chat-msg-wrapper ${isMe ? "me" : "other"}`}
              >
                <div className={`team-chat-msg ${isMe ? "team-chat-msg-me" : "team-chat-msg-other"}`}>
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
                        {formatTime(msg.timestamp || msg.createdAt)}
                      </span>
                    </div>

                    <div className="team-chat-bubble-container">
                      <div className="team-chat-bubble">
                        <p className="team-chat-text">{msg.text}</p>
                      </div>

                      {/* Quick message reaction hover bar */}
                      <div className="msg-reaction-hover-bar">
                        {QUICK_REACTIONS.slice(0, 5).map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="reaction-quick-btn"
                            onClick={() => handleReactionClick(messageId, emoji)}
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="reaction-quick-btn plus-btn"
                          onClick={() =>
                            setActiveMessageReactionPicker(
                              activeMessageReactionPicker === messageId ? null : messageId
                            )
                          }
                          title="More reactions"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Individual message emoji picker modal */}
                      {activeMessageReactionPicker === messageId && (
                        <div className="msg-picker-anchor">
                          <EmojiPicker
                            onSelectEmoji={(emoji) => handleReactionClick(messageId, emoji)}
                            onClose={() => setActiveMessageReactionPicker(null)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Render message reaction chips below the message */}
                    {reactionEntries.length > 0 && (
                      <div className="msg-reaction-chips">
                        {reactionEntries.map(([emoji, users]) => {
                          const hasReacted = users.includes(currentUsername);
                          const tooltip = users.join(", ");
                          return (
                            <button
                              key={emoji}
                              type="button"
                              className={`reaction-chip ${hasReacted ? "active" : ""}`}
                              onClick={() => handleReactionClick(messageId, emoji)}
                              title={tooltip}
                            >
                              <span className="chip-emoji">{emoji}</span>
                              <span className="chip-count">{users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
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
          placeholder="Send message to room..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />

        <button
          type="submit"
          className="team-chat-send-btn"
          disabled={!inputText.trim()}
          title="Send message"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
