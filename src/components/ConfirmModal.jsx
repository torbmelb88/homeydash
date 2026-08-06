import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmModal = ({ title, message, onConfirm, onCancel, confirmText = 'Slett', cancelText = 'Avbryt', isDangerous = false }) => {
    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isDangerous && <AlertTriangle size={24} color="var(--color-error)" />}
                        {title}
                    </h2>
                    <button className="icon-btn close-modal" onClick={onCancel}>
                        <X size={24} />
                    </button>
                </div>
                <div className="modal-body">
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
                        {message}
                    </p>
                </div>
                <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        className={`btn ${isDangerous ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        style={isDangerous ? { backgroundColor: 'var(--color-error)', color: 'white', border: 'none' } : {}}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
