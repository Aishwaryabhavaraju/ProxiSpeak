import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { EMOJI_CATEGORIES } from "../utils/emojiData";

export default function EmojiPicker({ onSelectEmoji, onClose }) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const pickerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const filteredEmojis = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCategory);
      return cat ? cat.emojis : [];
    }
    const all = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (item.name.toLowerCase().includes(query)) {
          all.push(item);
        }
      }
    }
    return all;
  }, [activeCategory, searchQuery]);

  return (
    <div className="emoji-picker-popover" ref={pickerRef} role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-header">
        <div className="emoji-search-box">
          <Search size={14} className="emoji-search-icon" />
          <input
            type="text"
            className="emoji-search-input"
            placeholder="Search emojis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button
          type="button"
          className="emoji-picker-close-btn"
          onClick={onClose}
          aria-label="Close emoji picker"
        >
          <X size={14} />
        </button>
      </div>

      {!searchQuery && (
        <div className="emoji-category-tabs">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`emoji-cat-btn ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.name}
            >
              <span>{cat.icon}</span>
            </button>
          ))}
        </div>
      )}

      <div className="emoji-grid-scroll">
        {filteredEmojis.length === 0 ? (
          <div className="emoji-empty-hint">No emojis found</div>
        ) : (
          <div className="emoji-grid">
            {filteredEmojis.map((item, idx) => (
              <button
                key={`${item.emoji}-${idx}`}
                type="button"
                className="emoji-cell-btn"
                onClick={() => {
                  onSelectEmoji(item.emoji);
                }}
                title={item.name}
              >
                {item.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

