const express = require("express");
const cors = require("cors");

const { players, sessions, transactions, notes } = require("./dataStore");

const app = express();
app.use(cors());
app.use(express.json());

function calculateBalance() {
    const balanceMap = new Map(players.map((player) => [player.id, 0]));
    transactions.forEach((transaction) => {
        balanceMap.set(transaction.from, (balanceMap.get(transaction.from) ?? 0) - transaction.amount);
        balanceMap.set(transaction.to, (balanceMap.get(transaction.to) ?? 0) + transaction.amount);
    });
    return players.map((player) => ({
        playerId: player.id,
        playerName: player.name,
        amount: balanceMap.get(player.id) ?? 0
    }));
}

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.get("/players", (req, res) => {
    res.json(players);
});

app.get("/sessions", (req, res) => {
    const { gameType } = req.query;
    if (!gameType) {
        res.json(sessions);
        return;
    }
    res.json(sessions.filter((session) => session.gameType === gameType));
});

app.post("/sessions", (req, res) => {
    const { date, gameType, players: sessionPlayers } = req.body;
    if (!date || !gameType || !Array.isArray(sessionPlayers)) {
        res.status(400).json({ error: "Missing fields" });
        return;
    }
    const nextId = (sessions.at(-1)?.id ?? 0) + 1;
    const session = {
        id: nextId,
        date,
        gameType,
        players: sessionPlayers.map(Number)
    };
    sessions.push(session);
    res.status(201).json(session);
});

app.put("/sessions/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = sessions.find((session) => session.id === id);
    if (!row) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    const { date, gameType, players: sessionPlayers } = req.body;
    if (!date || !gameType || !Array.isArray(sessionPlayers)) {
        res.status(400).json({ error: "Missing fields" });
        return;
    }
    row.date = date;
    row.gameType = gameType;
    row.players = sessionPlayers.map(Number);
    res.json(row);
});

app.delete("/sessions/:id", (req, res) => {
    const id = Number(req.params.id);
    const index = sessions.findIndex((session) => session.id === id);
    if (index < 0) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    sessions.splice(index, 1);
    res.status(204).send();
});

app.get("/transactions", (req, res) => {
    res.json(transactions);
});

app.get("/balances", (req, res) => {
    res.json(calculateBalance());
});

app.post("/transactions", (req, res) => {
    const { date, from, to, amount } = req.body;
    if (!date || !from || !to || !amount) {
        res.status(400).json({ error: "Missing fields" });
        return;
    }
    const nextId = (transactions.at(-1)?.id ?? 0) + 1;
    const transaction = {
        id: nextId,
        date,
        from: Number(from),
        to: Number(to),
        amount: Number(amount)
    };
    transactions.push(transaction);
    res.status(201).json(transaction);
});

app.put("/transactions/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = transactions.find((transaction) => transaction.id === id);
    if (!row) {
        res.status(404).json({ error: "Transaction not found" });
        return;
    }
    const { date, from, to, amount } = req.body;
    if (!date || !from || !to || !amount) {
        res.status(400).json({ error: "Missing fields" });
        return;
    }
    row.date = date;
    row.from = Number(from);
    row.to = Number(to);
    row.amount = Number(amount);
    res.json(row);
});

app.delete("/transactions/:id", (req, res) => {
    const id = Number(req.params.id);
    const index = transactions.findIndex((transaction) => transaction.id === id);
    if (index < 0) {
        res.status(404).json({ error: "Transaction not found" });
        return;
    }
    transactions.splice(index, 1);
    res.status(204).send();
});

app.get("/notes/:page", (req, res) => {
    const page = req.params.page;
    if (!(page in notes)) {
        res.status(404).json({ error: "Page note not found" });
        return;
    }
    res.json({ page, note: notes[page] });
});

app.put("/notes/:page", (req, res) => {
    const page = req.params.page;
    if (!(page in notes)) {
        res.status(404).json({ error: "Page note not found" });
        return;
    }
    notes[page] = String(req.body.note ?? "");
    res.json({ page, note: notes[page] });
});

app.listen(3000, () => {
    console.log("Data API running on port 3000");
});