export const players = [
    { id: 1, name: "Nam" },
    { id: 2, name: "Cường" },
    { id: 3, name: "Tuấn" },
    { id: 4, name: "Hải" },
    { id: 5, name: "Long" },
    { id: 6, name: "Phong" },
    { id: 7, name: "Thắng" }
];

export const sessions = [
    { id: 1, date: "2026-03-01", gameType: "Omaha", players: [1, 2, 3, 4, 5, 6] },
    { id: 2, date: "2026-03-02", gameType: "Omaha", players: [1, 2, 4, 5, 7] },
    { id: 3, date: "2026-03-01", gameType: "JP_BT", players: [1, 2, 3, 4, 5, 6, 7] },
    { id: 4, date: "2026-03-03", gameType: "JP_BT", players: [2, 3, 4, 6, 7] }
];

export const transactions = [
    { id: 1, date: "2026-04-12", from: 5, to: 2, amount: 300 },
    { id: 2, date: "2026-04-12", from: 4, to: 6, amount: 1200 },
    { id: 3, date: "2026-04-13", from: 1, to: 3, amount: 500 },
    { id: 4, date: "2026-04-14", from: 2, to: 6, amount: 735 },
    { id: 5, date: "2026-04-14", from: 7, to: 5, amount: 650 }
];
