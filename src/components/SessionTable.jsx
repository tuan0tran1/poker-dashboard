import { useState } from "react";

function PlayerPicker({ players, value, onChange }) {
    return (
        <div className="player-picker">
            {players.map((player) => (
                <label key={player.id}>
                    <input
                        type="checkbox"
                        checked={value.includes(player.id)}
                        onChange={(event) => {
                            if (event.target.checked) onChange([...value, player.id]);
                            else onChange(value.filter((id) => id !== player.id));
                        }}
                    />
                    {player.name}
                </label>
            ))}
        </div>
    );
}

export default function SessionTable({ title, sessions, playersById, players, gameType, onCreate, onUpdate, onDelete }) {
    const [newDate, setNewDate] = useState("");
    const [newPlayers, setNewPlayers] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingDate, setEditingDate] = useState("");
    const [editingPlayers, setEditingPlayers] = useState([]);
    const [error, setError] = useState("");

    const startEdit = (session) => {
        setEditingId(session.id);
        setEditingDate(session.date);
        setEditingPlayers(session.players);
    };

    return (
        <div className="card">
            <h2>{title}</h2>
            <div className="editor-block">
                <h3>Thêm session</h3>
                <div className="form-grid">
                    <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
                    <PlayerPicker players={players} value={newPlayers} onChange={setNewPlayers} />
                </div>
                <div className="row-actions">
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            if (!newDate || newPlayers.length === 0) {
                                setError("Vui lòng chọn ngày và ít nhất 1 người chơi.");
                                return;
                            }
                            onCreate({ date: newDate, gameType, players: newPlayers });
                            setNewDate("");
                            setNewPlayers([]);
                            setError("");
                        }}
                    >
                        Thêm
                    </button>
                </div>
                {error && <p className="error-text">{error}</p>}
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Người tham gia</th>
                        <th>Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map((session) => (
                        <tr key={session.id}>
                            <td>
                                {editingId === session.id ? (
                                    <input
                                        type="date"
                                        value={editingDate}
                                        onChange={(event) => setEditingDate(event.target.value)}
                                    />
                                ) : (
                                    session.date
                                )}
                            </td>
                            <td>
                                {editingId === session.id ? (
                                    <PlayerPicker players={players} value={editingPlayers} onChange={setEditingPlayers} />
                                ) : (
                                    session.players
                                        .map((playerId) => playersById.get(playerId)?.name ?? playerId)
                                        .join(", ")
                                )}
                            </td>
                            <td>
                                {editingId === session.id ? (
                                    <div className="row-actions">
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => {
                                                if (!editingDate || editingPlayers.length === 0) {
                                                    setError("Session cần có ngày và ít nhất 1 người chơi.");
                                                    return;
                                                }
                                                onUpdate(session.id, {
                                                    date: editingDate,
                                                    gameType,
                                                    players: editingPlayers
                                                });
                                                setEditingId(null);
                                                setError("");
                                            }}
                                        >
                                            Lưu
                                        </button>
                                        <button className="btn" onClick={() => setEditingId(null)}>
                                            Hủy
                                        </button>
                                    </div>
                                ) : (
                                    <div className="row-actions">
                                        <button className="btn" onClick={() => startEdit(session)}>
                                            Sửa
                                        </button>
                                        <button className="btn btn-danger" onClick={() => onDelete(session.id)}>
                                            Xóa
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                    {sessions.length === 0 && (
                        <tr>
                            <td colSpan={3}>Chưa có session.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
