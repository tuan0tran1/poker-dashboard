import { useEffect, useState } from "react";
import "./App.css";
import JPBTPage from "./pages/JPBTPage";
import OmahaPage from "./pages/OmahaPage";

const PLAYER_NAMES = ["Nam", "Cường", "Tuấn", "Hải", "Long", "Phong", "Thắng"];
const APP_ACTIVE_TAB_KEY = "poker-dashboard-active-tab-v1";

const DEFAULT_PLAYERS = PLAYER_NAMES.map((name, index) => ({ id: index + 1, name }));

export default function App() {
    const [activeTab, setActiveTab] = useState(() => {
        const saved = localStorage.getItem(APP_ACTIVE_TAB_KEY);
        return saved === "jpbt" ? "jpbt" : "omaha";
    });
    const [players] = useState(DEFAULT_PLAYERS);

    const tabs = [
        { id: "omaha", label: "Omaha" },
        { id: "jpbt", label: "JP + BT" }
    ];

    useEffect(() => {
        localStorage.setItem(APP_ACTIVE_TAB_KEY, activeTab);
    }, [activeTab]);

    return (
        <main className="app-shell">
            <header>
                <h1>Poker Dashboard</h1>
                <p>Clean, fast, localStorage persistence</p>
            </header>

            <div className="tab-row app-tab-row">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={activeTab === tab.id ? "tab tab-active" : "tab"}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "omaha" && (
                <OmahaPage
                    players={players}
                />
            )}
            {activeTab === "jpbt" && (
                <JPBTPage
                    players={players}
                />
            )}
        </main>
    );
}