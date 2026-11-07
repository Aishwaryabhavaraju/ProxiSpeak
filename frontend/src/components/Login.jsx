import React, { useState } from "react";
import { loginUser, registerUser } from "../services/authApi";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Radio,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import "../styles/Login.css";

export default function Login({ onAuthenticated }) {
  const [tab, setTab] = useState("login"); // "login" | "register"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form states
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [registerName, setRegisterName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  function getPasswordStrength(pw) {
    if (!pw) return { score: 0, label: "", color: "" };
    if (pw.length < 6) return { score: 1, label: "Too short (min 6 chars)", color: "#EF4444" };
    let score = 1;
    if (pw.length >= 8) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || /[A-Z]/.test(pw)) score++;

    if (score <= 2) return { score: 2, label: "Medium", color: "#F59E0B" };
    return { score: 3, label: "Strong", color: "#10B981" };
  }

  const pwStrength = getPasswordStrength(registerPassword);

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setError("");

    if (!loginIdentifier.trim()) {
      setError("Please enter your email or username.");
      return;
    }
    if (!loginPassword) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginUser(loginIdentifier.trim(), loginPassword);
      if (res && res.user) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setError("");

    if (!registerName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!registerUsername.trim()) {
      setError("Please choose a unique username.");
      return;
    }
    if (registerUsername.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!registerEmail.trim() || !registerEmail.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (registerPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser({
        name: registerName.trim(),
        username: registerUsername.trim().toLowerCase(),
        email: registerEmail.trim().toLowerCase(),
        password: registerPassword,
        confirmPassword: registerConfirmPassword,
      });
      if (res && res.user) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      {/* Background ambient decorative glow */}
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <div className="auth-card">
        {/* Header / Brand */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <Radio className="auth-icon-pulse" size={24} />
            <Headphones size={22} className="auth-icon-audio" />
          </div>
          <h1 className="auth-title">ProxiSpeak</h1>
          <p className="auth-subtitle">
            Geospatial Proximity-Based Virtual Office & Audio Ecosystem
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => {
              setTab("login");
              setError("");
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => {
              setTab("register");
              setError("");
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="auth-error-alert" role="alert">
            <span className="auth-error-dot" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In Form */}
        {tab === "login" && (
          <form onSubmit={handleLoginSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="login-identifier" className="auth-label">
                Email or Username
              </label>
              <div className="auth-input-wrapper">
                <Mail className="auth-input-icon" size={18} />
                <input
                  id="login-identifier"
                  type="text"
                  className="auth-input"
                  placeholder="name@domain.com or username"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="login-password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrapper">
                <Lock className="auth-input-icon" size={18} />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="auth-options-row">
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="auth-checkbox"
                />
                <span>Remember this workstation</span>
              </label>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : (
                <>
                  <span>Enter Virtual Office</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form onSubmit={handleRegisterSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="reg-name" className="auth-label">
                Full Name
              </label>
              <div className="auth-input-wrapper">
                <User className="auth-input-icon" size={18} />
                <input
                  id="reg-name"
                  type="text"
                  className="auth-input"
                  placeholder="e.g. Alex Morgan"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-username" className="auth-label">
                Avatar Username
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-prefix">@</span>
                <input
                  id="reg-username"
                  type="text"
                  className="auth-input auth-input-with-prefix"
                  placeholder="alexm"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-email" className="auth-label">
                Work Email
              </label>
              <div className="auth-input-wrapper">
                <Mail className="auth-input-icon" size={18} />
                <input
                  id="reg-email"
                  type="email"
                  className="auth-input"
                  placeholder="alex@team.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrapper">
                <Lock className="auth-input-icon" size={18} />
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Min 6 characters"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {registerPassword && (
                <div className="auth-pw-strength">
                  <div className="auth-pw-bars">
                    <div
                      className="auth-pw-bar"
                      style={{
                        backgroundColor: pwStrength.score >= 1 ? pwStrength.color : "#374151",
                      }}
                    />
                    <div
                      className="auth-pw-bar"
                      style={{
                        backgroundColor: pwStrength.score >= 2 ? pwStrength.color : "#374151",
                      }}
                    />
                    <div
                      className="auth-pw-bar"
                      style={{
                        backgroundColor: pwStrength.score >= 3 ? pwStrength.color : "#374151",
                      }}
                    />
                  </div>
                  <span className="auth-pw-text" style={{ color: pwStrength.color }}>
                    {pwStrength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm-pw" className="auth-label">
                Confirm Password
              </label>
              <div className="auth-input-wrapper">
                <Lock className="auth-input-icon" size={18} />
                <input
                  id="reg-confirm-pw"
                  type={showConfirmPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Re-enter password"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Create Account & Join</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Feature Pills Footer */}
        <div className="auth-footer-badges">
          <span className="auth-badge">
            <ShieldCheck size={14} className="auth-badge-icon" />
            JWT & Bcrypt Security
          </span>
          <span className="auth-badge">
            <Radio size={14} className="auth-badge-icon" />
            100px Proximity Audio
          </span>
        </div>
      </div>
    </div>
  );
}
