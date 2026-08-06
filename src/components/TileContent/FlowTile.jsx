import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';

const FlowTile = ({ tile }) => {
    const { api } = useHomey();
    const [isTriggering, setIsTriggering] = useState(false);
    const [triggered, setTriggered] = useState(false);

    // Confugration
    const settings = tile.settings || {};
    const label = settings.label || tile.name || 'Flow';
    const iconName = settings.icon || 'Play';
    const color = settings.color || 'blue'; // blue, red, green, purple, orange, teal
    const flowId = settings.flowId;

    // Resolve Icon
    const Icon = Icons[iconName] || Icons.Play;

    const handleTrigger = async (e) => {
        e.stopPropagation();

        if (!flowId) {
            console.warn("No flow ID configured for tile", tile.id);
            return;
        }

        setIsTriggering(true);
        try {
            await api.triggerFlow(flowId);
            setTriggered(true);
            setTimeout(() => setTriggered(false), 2000); // Reset "success" state after 2s
        } catch (error) {
            console.error("Failed to trigger flow", error);
        } finally {
            setIsTriggering(false);
        }
    };

    // Color gradients map
    const gradients = {
        blue: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        red: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        green: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        purple: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
        orange: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        teal: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
        pink: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        indigo: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        gray: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
    };

    const background = gradients[color] || gradients.blue;

    return (
        <div
            className={`flow-tile-content ${isTriggering ? 'triggering' : ''}`}
            style={{ background }}
            onClick={handleTrigger}
        >
            {/* Active Ripple/Pulse Effect */}
            {isTriggering && <div className="flow-ripple" />}

            {/* Success Feedback */}
            {triggered && (
                <div className="flow-success">
                    <Icons.Check size={48} color="white" />
                </div>
            )}

            {/* Main Content */}
            <div className="flow-tile-inner">
                <Icon size={48} strokeWidth={1.5} />
                <span className="flow-tile-label">
                    {label}
                </span>
            </div>

            {/* Missing config warning */}
            {!flowId && (
                <div style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(0,0,0,0.5)',
                    borderRadius: '50%',
                    padding: 4,
                    zIndex: 20
                }}>
                    <Icons.AlertCircle size={14} color="#fbbf24" />
                </div>
            )}
        </div>
    );
};

export default FlowTile;
