import { useState } from "react";

export default function NoteEditor({ title = "Ghi chú", initialValue = "", onSave }) {
    const [value, setValue] = useState(initialValue);

    return (
        <div className="card">
            <h2>{title}</h2>
            <textarea
                className="note-input"
                rows={4}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Nhập ghi chú cho trang..."
            />
            <div className="row-actions">
                <button className="btn btn-primary" onClick={() => onSave(value)}>
                    Lưu note
                </button>
            </div>
        </div>
    );
}
