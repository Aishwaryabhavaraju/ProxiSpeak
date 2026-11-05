export const OFFICE_CONFIG = {
  width: 600,
  height: 450,
  gridSize: 40,
  avatarRadius: 15,
  defaultAudioRadius: 100,
  hysteresisBuffer: 18,
  entrance: { x: 300, y: 410, label: "Main Entrance" },
  zones: [
    { id: "zone-work-nw", label: "Engineering Pods", x: 30, y: 30, w: 200, h: 120, color: "rgba(56, 189, 248, 0.08)" },
    { id: "zone-work-ne", label: "Design Studio", x: 370, y: 30, w: 200, h: 120, color: "rgba(99, 102, 241, 0.08)" },
    { id: "zone-meeting", label: "Central Collaboration Hub", x: 175, y: 155, w: 250, h: 125, color: "rgba(16, 185, 129, 0.09)" },
    { id: "zone-lounge", label: "Casual Lounge", x: 30, y: 285, w: 200, h: 130, color: "rgba(245, 158, 11, 0.08)" },
    { id: "zone-focus", label: "Quiet Focus Zone", x: 370, y: 285, w: 200, h: 130, color: "rgba(236, 72, 153, 0.08)" },
  ],
  walls: [
    { id: "wall-top", x: 0, y: 0, w: 600, h: 10 },
    { id: "wall-bottom-l", x: 0, y: 440, w: 250, h: 10 },
    { id: "wall-bottom-r", x: 350, y: 440, w: 250, h: 10 },
    { id: "wall-left", x: 0, y: 0, w: 10, h: 450 },
    { id: "wall-right", x: 590, y: 0, w: 10, h: 450 },
  ],
  desks: [
    { id: "desk-1", label: "Pod A1", x: 80, y: 70, w: 80, h: 35, color: "#475569" },
    { id: "desk-2", label: "Pod B1", x: 420, y: 70, w: 80, h: 35, color: "#475569" },
    { id: "desk-3", label: "Lounge Table", x: 80, y: 325, w: 80, h: 35, color: "#64748b" },
    { id: "desk-4", label: "Focus Desk", x: 420, y: 325, w: 80, h: 35, color: "#475569" },
  ],
  meetingTables: [
    { id: "meeting-main", label: "Board Table", x: 240, y: 185, w: 120, h: 60, color: "#334155" },
  ],
  plants: [
    { id: "plant-1", x: 32, y: 32, r: 11 },
    { id: "plant-2", x: 568, y: 32, r: 11 },
    { id: "plant-3", x: 32, y: 415, r: 11 },
    { id: "plant-4", x: 568, y: 415, r: 11 },
  ],
};

export function getCollisionObstacles(layout = OFFICE_CONFIG) {
  return [
    ...layout.walls,
    ...layout.desks,
    ...layout.meetingTables,
  ];
}
