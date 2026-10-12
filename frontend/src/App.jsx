import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const canvasRef = useRef(null);

  const [position, setPosition] = useState({
    x: 400,
    y: 250,
  });

  // Users currently in the virtual office
  const otherUsers = [
    {
      name: "Alex",
      initial: "A",
      x: 180,
      y: 220,
    },
    {
      name: "John",
      initial: "J",
      x: 580,
      y: 220,
    },
    {
      name: "Sarah",
      initial: "S",
      x: 650,
      y: 380,
    },
  ];

  // Draw the virtual office
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    const gridSize = 40;

    for (let x = 0; x <= canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Office areas
    ctx.fillStyle = "#eef2ff";
    ctx.fillRect(40, 40, 220, 120);

    ctx.fillStyle = "#ecfdf5";
    ctx.fillRect(540, 40, 220, 120);

    ctx.fillStyle = "#fff7ed";
    ctx.fillRect(40, 340, 220, 120);

    // Room labels
    ctx.fillStyle = "#374151";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillText("Meeting Room", 60, 70);
    ctx.fillText("Work Area", 560, 70);
    ctx.fillText("Break Area", 60, 370);

    // --------------------------------
    // Draw other users
    // --------------------------------

    otherUsers.forEach((user) => {
      // Avatar circle
      ctx.beginPath();
      ctx.arc(user.x, user.y, 22, 0, Math.PI * 2);

      ctx.fillStyle = "#22c55e";
      ctx.fill();

      // Avatar border
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Initial
      ctx.fillStyle = "white";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(user.initial, user.x, user.y);

      // Name
      ctx.fillStyle = "#111827";
      ctx.font = "bold 13px Arial";
      ctx.textBaseline = "alphabetic";

      ctx.fillText(user.name, user.x, user.y + 38);
    });

    // --------------------------------
    // Draw your avatar
    // --------------------------------

    ctx.beginPath();
    ctx.arc(position.x, position.y, 22, 0, Math.PI * 2);

    // Avatar color
    ctx.fillStyle = "#6366f1";
    ctx.fill();

    // Avatar border
    ctx.strokeStyle = "#4338ca";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Your initial
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText("Y", position.x, position.y);

    // Your name
    ctx.fillStyle = "#111827";
    ctx.font = "bold 13px Arial";
    ctx.textBaseline = "alphabetic";

    ctx.fillText(
      "You",
      position.x,
      position.y + 38
    );

  }, [position]);


  // --------------------------------
  // Keyboard movement
  // --------------------------------

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();

      setPosition((current) => {
        let newX = current.x;
        let newY = current.y;

        const speed = 10;

        if (key === "w" || key === "arrowup") {
          newY -= speed;
        }

        if (key === "s" || key === "arrowdown") {
          newY += speed;
        }

        if (key === "a" || key === "arrowleft") {
          newX -= speed;
        }

        if (key === "d" || key === "arrowright") {
          newX += speed;
        }

        // Keep avatar inside Canvas
        newX = Math.max(25, Math.min(775, newX));
        newY = Math.max(25, Math.min(475, newY));

        return {
          x: newX,
          y: newY,
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };

  }, []);


  return (
    <div className="app">

      {/* Header */}
      <header className="header">

        <div className="logo">

          <div className="logo-icon">
            P
          </div>

          <div>
            <h1>ProxiSpeak</h1>
            <p>Virtual Office</p>
          </div>

        </div>

        <div className="online-status">
          <span className="online-dot"></span>
          {otherUsers.length + 1} Online
        </div>

      </header>


      {/* Main */}
      <main className="main-content">

        {/* Virtual Office */}
        <section className="office">

          <div className="office-heading">

            <div>
              <h2>Virtual Office</h2>

              <p>
                Move around and interact with nearby users
              </p>
            </div>

            <span className="room-status">
              🟢 Room Active
            </span>

          </div>


          {/* Canvas */}
          <div className="canvas-container">

            <canvas
              ref={canvasRef}
              width={800}
              height={500}
            />

          </div>


          {/* Controls */}
          <div className="controls">

            <div>
              <strong>Movement</strong>
              <span>W A S D / Arrow Keys</span>
            </div>

            <div>
              <strong>Audio</strong>
              <span>Voice proximity enabled</span>
            </div>

          </div>

        </section>


        {/* Sidebar */}
        <aside className="sidebar">

          {/* People Online */}
          <div className="panel">

            <h3>
              👥 People Online
            </h3>


            {/* You */}
            <div className="user">

              <div className="user-avatar">
                Y
              </div>

              <div>
                <strong>You</strong>
                <span>Active</span>
              </div>

            </div>


            {/* Other Users */}
            {otherUsers.map((user) => (

              <div
                className="user"
                key={user.name}
              >

                <div className="user-avatar other-avatar">
                  {user.initial}
                </div>

                <div>
                  <strong>{user.name}</strong>
                  <span>Active</span>
                </div>

              </div>

            ))}

          </div>


          {/* Controls */}
          <div className="panel">

            <h3>
              🎮 Controls
            </h3>

            <p>
              Use your keyboard to move around
              the virtual office.
            </p>

            <div className="keys">

              <span>W</span>
              <span>A</span>
              <span>S</span>
              <span>D</span>

            </div>

          </div>

        </aside>

      </main>


      {/* Footer */}
      <footer className="footer">

        <span>
          ProxiSpeak
        </span>

        <div>
          🎤 Microphone&nbsp;&nbsp;
          🔊 Audio&nbsp;&nbsp;
          ⚙ Settings
        </div>

      </footer>

    </div>
  );
}

export default App;