// «Koble til en høyttaler» – Spotify Connect-lignende enhetsvelger.
// Bunnark på mobil, popover over spillerlinjen på nettbrett.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, Check, Volume2 } from 'lucide-react';
import { PlayerIcon, VolumeSlider } from './NowPlaying';

const stop = (e) => e.stopPropagation();

function stateLabel(p) {
  if (p.state === 'playing') return { text: p.mediaTitle ? `Spiller · ${p.mediaTitle}` : 'Spiller', cls: 'playing' };
  if (p.state === 'paused') return { text: 'Pause', cls: 'paused' };
  return { text: p.area || 'Inaktiv', cls: 'idle' };
}

export default function DevicePicker({ engine, layout, anchorRect, onClose }) {
  const { players, activePlayer, activePlayerId, nowPlaying } = engine;
  const mobile = layout === 'mobile';
  const [pending, setPending] = useState({}); // playerId → true mens gruppering pågår

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const others = players.filter(p => p.entityId !== activePlayerId);

  // Grupperingskandidater: allerede grupperte + de MA sier kan grupperes med aktiv spiller
  const groupRows = useMemo(() => {
    if (!activePlayer) return [];
    const ids = [...new Set([...(activePlayer.groupMembers || []), ...(activePlayer.canGroupWith || [])])]
      .filter(id => id !== activePlayer.playerId);
    return ids.map(id => players.find(p => p.playerId === id)).filter(Boolean);
  }, [activePlayer, players]);

  // Nullstill «venter»-markeringer når MA har bekreftet ny gruppesammensetning
  const [seenMembers, setSeenMembers] = useState(activePlayer?.groupMembers);
  if (activePlayer?.groupMembers !== seenMembers) {
    setSeenMembers(activePlayer?.groupMembers);
    setPending({});
  }

  const toggleMember = (p) => {
    const inGroup = activePlayer.groupMembers.includes(p.playerId);
    setPending(s => ({ ...s, [p.playerId]: true }));
    engine.setGroupMembers(inGroup ? [] : [p.playerId], inGroup ? [p.playerId] : []);
    setTimeout(() => setPending(s => { const n = { ...s }; delete n[p.playerId]; return n; }), 6000);
  };

  const style = !mobile && anchorRect ? {
    right: Math.max(8, window.innerWidth - anchorRect.right),
    bottom: Math.max(8, window.innerHeight - anchorRect.top + 10),
  } : undefined;

  return createPortal(
    <div className={`mp-menu-layer${mobile ? ' mp-menu-layer--sheet' : ''}`} onClick={onClose}>
      <div className={`mp-devices${mobile ? ' mp-devices--sheet' : ''}`} style={style} onClick={stop}>
        <div className="mp-dev-head">
          <h3>Koble til en høyttaler</h3>
          <button className="mp-iconbtn" onClick={onClose} title="Lukk"><X size={20} /></button>
        </div>

        {activePlayer ? (
          <div className="mp-dev-current">
            <div className="mp-dev-current-row">
              <PlayerIcon player={activePlayer} size={30} className="mp-dev-current-icon" />
              <div className="mp-dev-current-meta">
                <div className="mp-dev-label">Aktiv høyttaler</div>
                <div className="mp-dev-current-name">{activePlayer.name}</div>
                {activePlayer.area && <div className="mp-dev-sub">{activePlayer.area}</div>}
              </div>
            </div>
            <VolumeSlider
              value={nowPlaying.volume}
              muted={nowPlaying.muted}
              onChange={(v) => engine.setVolume(activePlayer.entityId, v)}
              onMute={(m) => engine.setMute(activePlayer.entityId, m)}
            />
            {groupRows.length > 0 && (
              <div className="mp-dev-group">
                <div className="mp-dev-label">Spill på flere samtidig</div>
                {groupRows.map(p => {
                  const on = activePlayer.groupMembers.includes(p.playerId);
                  return (
                    <button key={p.playerId} className={`mp-dev-grouprow${on ? ' mp-dev-grouprow--on' : ''}`} onClick={() => toggleMember(p)} disabled={!!pending[p.playerId]}>
                      <span className={`mp-check${on ? ' mp-check--on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                      <PlayerIcon player={p} size={16} />
                      <span className="mp-dev-grouprow-name">{p.name}</span>
                      {on && (
                        <span className="mp-dev-grouprow-vol" onClick={stop}>
                          <Volume2 size={13} />
                          <input type="range" className="mp-slider mp-slider--volume" min={0} max={1} step={0.02}
                            value={p.muted ? 0 : p.volume} style={{ '--pct': `${(p.muted ? 0 : p.volume) * 100}%` }}
                            onChange={(e) => engine.setVolume(p.entityId, parseFloat(e.target.value))} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mp-empty">Ingen høyttaler valgt</div>
        )}

        <div className="mp-dev-label mp-dev-listlabel">Velg en annen høyttaler</div>
        <div className="mp-dev-list">
          {others.length === 0 && <div className="mp-empty">Ingen andre høyttalere funnet</div>}
          {others.map(p => {
            const st = stateLabel(p);
            return (
              <div key={p.entityId} className="mp-dev-row" onClick={() => { engine.selectPlayer(p.entityId); onClose(); }} role="button" tabIndex={0}>
                <PlayerIcon player={p} size={22} className={`mp-dev-row-icon mp-dev-row-icon--${st.cls}`} />
                <div className="mp-dev-row-meta">
                  <div className="mp-dev-row-name">{p.name}</div>
                  <div className={`mp-dev-row-state mp-dev-row-state--${st.cls}`}>{st.text}</div>
                </div>
                {nowPlaying.hasMedia && (
                  <button className="mp-dev-transfer" onClick={(e) => { stop(e); engine.transferTo(p.entityId); onClose(); }} title="Flytt musikken hit">
                    <ArrowRightLeft size={14} />
                    <span>Flytt hit</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
