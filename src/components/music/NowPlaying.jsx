// «Spilles nå»: nederste spillerlinje (nettbrett), minispiller + fullskjerm-
// ark (mobil), samt delte kontroller (transport, fremdrift, volum).
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart,
  Volume2, Volume1, VolumeX, ListMusic, Speaker, ChevronDown, Ellipsis, Music,
  Cast, Tv, Tablet, Laptop, Users, ArrowLeft, Radio,
} from 'lucide-react';
import { fmtTime, usePlaybackPosition, useArtColor } from './musicUtils';

const PLAYER_ICONS = {
  speaker: Speaker, 'google-nest': Speaker, tv: Tv, cast: Cast, tablet: Tablet,
  mac: Laptop, laptop: Laptop, speakers: Users, group: Users, radio: Radio,
};
export function PlayerIcon({ player, size = 18, className }) {
  const Icon = (player?.type === 'group' && Users) || PLAYER_ICONS[player?.icon] || Speaker;
  return <Icon size={size} className={className} />;
}

const stop = (e) => e.stopPropagation();

// ── Fremdrift ──────────────────────────────────────────────────────

export function ProgressSlider({ engine, showTimes = true, className = '' }) {
  const { nowPlaying } = engine;
  const [pos, setPos, draggingRef] = usePlaybackPosition(nowPlaying);
  const dur = nowPlaying.duration || 0;
  const live = nowPlaying.hasMedia && !dur;
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  const commit = (v) => { draggingRef.current = false; setPos(v); engine.seek(v); };
  return (
    <div className={`mp-progress ${className}`}>
      {showTimes && <span className="mp-time">{dur ? fmtTime(pos) : live ? 'LIVE' : '0:00'}</span>}
      <input
        type="range"
        className="mp-slider mp-slider--progress"
        min={0}
        max={dur || 1}
        step={1}
        value={Math.min(pos, dur || 0)}
        disabled={!dur}
        style={{ '--pct': `${pct}%` }}
        onPointerDown={() => { draggingRef.current = true; }}
        onChange={(e) => setPos(parseFloat(e.target.value))}
        onPointerUp={(e) => commit(parseFloat(e.target.value))}
        onPointerCancel={() => { draggingRef.current = false; }}
        onKeyUp={(e) => commit(parseFloat(e.target.value))}
        aria-label="Posisjon"
      />
      {showTimes && <span className="mp-time mp-time--right">{dur ? fmtTime(dur) : ''}</span>}
    </div>
  );
}

// ── Volum ──────────────────────────────────────────────────────────

export function VolumeSlider({ value = 0, muted, onChange, onMute, className = '' }) {
  const v = muted ? 0 : value;
  const Icon = muted || v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2;
  return (
    <div className={`mp-volume ${className}`} onClick={stop}>
      <button className={`mp-iconbtn${muted ? ' mp-iconbtn--on' : ''}`} onClick={() => onMute?.(!muted)} title={muted ? 'Slå på lyd' : 'Demp'}>
        <Icon size={18} />
      </button>
      <input
        type="range"
        className="mp-slider mp-slider--volume"
        min={0} max={1} step={0.01}
        value={v}
        style={{ '--pct': `${v * 100}%` }}
        onChange={(e) => onChange?.(parseFloat(e.target.value))}
        aria-label="Volum"
      />
    </div>
  );
}

// ── Transportknapper ───────────────────────────────────────────────

export function TransportControls({ engine, size = 'md' }) {
  const { nowPlaying, activePlayer } = engine;
  const big = size === 'lg';
  const disabled = !activePlayer;
  return (
    <div className={`mp-transport mp-transport--${size}`}>
      <button className={`mp-iconbtn${nowPlaying.shuffle ? ' mp-iconbtn--on' : ''}`} onClick={engine.toggleShuffle} disabled={disabled} title="Tilfeldig rekkefølge">
        <Shuffle size={big ? 24 : 18} />
      </button>
      <button className="mp-iconbtn mp-iconbtn--skip" onClick={engine.previous} disabled={disabled || !nowPlaying.hasMedia} title="Forrige">
        <SkipBack size={big ? 32 : 22} fill="currentColor" strokeWidth={0} />
      </button>
      <button className="mp-playbtn mp-playbtn--white" style={{ width: big ? 68 : 36, height: big ? 68 : 36 }} onClick={engine.playPause} disabled={disabled} title={nowPlaying.isPlaying ? 'Pause' : 'Spill'}>
        {nowPlaying.isPlaying
          ? <Pause size={big ? 32 : 18} fill="currentColor" strokeWidth={0} />
          : <Play size={big ? 32 : 18} fill="currentColor" strokeWidth={0} style={{ marginLeft: big ? 4 : 2 }} />}
      </button>
      <button className="mp-iconbtn mp-iconbtn--skip" onClick={engine.next} disabled={disabled || !nowPlaying.hasMedia} title="Neste">
        <SkipForward size={big ? 32 : 22} fill="currentColor" strokeWidth={0} />
      </button>
      <button className={`mp-iconbtn${nowPlaying.repeat !== 'off' ? ' mp-iconbtn--on' : ''}`} onClick={engine.cycleRepeat} disabled={disabled} title="Gjenta">
        {nowPlaying.repeat === 'one' ? <Repeat1 size={big ? 24 : 18} /> : <Repeat size={big ? 24 : 18} />}
      </button>
    </div>
  );
}

function NowArtists({ engine, ui, className }) {
  const { nowPlaying } = engine;
  if (nowPlaying.artists?.length) {
    return (
      <div className={className}>
        {nowPlaying.artists.map((a, i) => (
          <React.Fragment key={a.uri || i}>
            {i > 0 && ', '}
            <span className="mp-link" onClick={(e) => { stop(e); ui.goToArtist(a); }}>{a.name}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }
  return <div className={className}>{nowPlaying.artist || (nowPlaying.sourceLabel ? `Fra ${nowPlaying.sourceLabel}` : '')}</div>;
}

function NowHeart({ engine, size = 18 }) {
  const { nowPlaying, canFavoriteNowPlaying } = engine;
  if (!nowPlaying.hasMedia || !canFavoriteNowPlaying) return null;
  const fav = nowPlaying.mediaItem ? engine.isFavorite(nowPlaying.mediaItem) : false;
  return (
    <button className={`mp-iconbtn mp-heart${fav ? ' mp-heart--on' : ''}`} onClick={(e) => { stop(e); engine.favoriteNowPlaying(); }}
      title={fav ? 'Fjern fra favoritter' : 'Legg til i favoritter'}>
      <Heart size={size} fill={fav ? 'currentColor' : 'none'} />
    </button>
  );
}

// ── Nettbrett: spillerlinje nederst ────────────────────────────────

export function NowPlayingBar({ engine, ui, queueOpen, onToggleQueue, onOpenDevices, devicesOpen }) {
  const { nowPlaying, activePlayer } = engine;
  const openAlbum = () => { if (nowPlaying.albumItem?.uri) ui.openItem(nowPlaying.albumItem); };
  return (
    <footer className="mp-nowbar">
      <div className="mp-nowbar-left">
        {nowPlaying.art && nowPlaying.hasMedia
          ? <img className="mp-nowbar-art" src={nowPlaying.art} alt="" onClick={openAlbum} />
          : <div className="mp-nowbar-art mp-art--empty"><Music size={22} /></div>}
        <div className="mp-nowbar-meta">
          <div className={`mp-nowbar-title${nowPlaying.albumItem?.uri ? ' mp-link' : ''}`} onClick={openAlbum} title={nowPlaying.album || undefined}>
            {nowPlaying.hasMedia ? nowPlaying.title : (activePlayer ? 'Ingenting spilles' : 'Velg en høyttaler')}
          </div>
          {nowPlaying.hasMedia && <NowArtists engine={engine} ui={ui} className="mp-nowbar-artist" />}
        </div>
        <NowHeart engine={engine} />
      </div>

      <div className="mp-nowbar-center">
        <TransportControls engine={engine} />
        <ProgressSlider engine={engine} />
      </div>

      <div className="mp-nowbar-right">
        <button className={`mp-iconbtn${queueOpen ? ' mp-iconbtn--on' : ''}`} onClick={onToggleQueue} title="Kø">
          <ListMusic size={20} />
        </button>
        <button className={`mp-devicebtn${devicesOpen ? ' mp-devicebtn--on' : ''}${nowPlaying.isPlaying ? ' mp-devicebtn--playing' : ''}`}
          onClick={(e) => onOpenDevices(e.currentTarget.getBoundingClientRect())} title="Velg høyttaler">
          <PlayerIcon player={activePlayer} size={18} />
          <span className="mp-devicebtn-name">{activePlayer?.name || 'Velg høyttaler'}</span>
        </button>
        {activePlayer && (
          <VolumeSlider
            className="mp-nowbar-volume"
            value={nowPlaying.volume}
            muted={nowPlaying.muted}
            onChange={(v) => engine.setVolume(activePlayer.entityId, v)}
            onMute={(m) => engine.setMute(activePlayer.entityId, m)}
          />
        )}
      </div>
    </footer>
  );
}

// ── Mobil: minispiller ─────────────────────────────────────────────

export function MiniPlayer({ engine, onExpand, onOpenDevices }) {
  const { nowPlaying, activePlayer } = engine;
  const tint = useArtColor(nowPlaying.hasMedia ? nowPlaying.art : null);
  const [pos] = usePlaybackPosition(nowPlaying);
  const pct = nowPlaying.duration ? Math.min(100, (pos / nowPlaying.duration) * 100) : 0;
  return (
    <div className="mp-mini" style={tint ? { '--mp-tint': tint } : undefined} onClick={onExpand} role="button" tabIndex={0}>
      {nowPlaying.art && nowPlaying.hasMedia
        ? <img className="mp-mini-art" src={nowPlaying.art} alt="" />
        : <div className="mp-mini-art mp-art--empty"><Music size={18} /></div>}
      <div className="mp-mini-meta">
        <div className="mp-mini-title">{nowPlaying.hasMedia ? nowPlaying.title : (activePlayer ? 'Ingenting spilles' : 'Velg en høyttaler')}</div>
        <div className="mp-mini-sub">
          {nowPlaying.hasMedia && nowPlaying.artist ? nowPlaying.artist : activePlayer?.name}
        </div>
      </div>
      <button className={`mp-iconbtn${nowPlaying.isPlaying ? ' mp-iconbtn--on' : ''}`} onClick={(e) => { stop(e); onOpenDevices(null); }} title="Velg høyttaler">
        <PlayerIcon player={activePlayer} size={20} />
      </button>
      <button className="mp-iconbtn mp-mini-play" onClick={(e) => { stop(e); engine.playPause(); }} disabled={!activePlayer} title={nowPlaying.isPlaying ? 'Pause' : 'Spill'}>
        {nowPlaying.isPlaying ? <Pause size={26} fill="currentColor" strokeWidth={0} /> : <Play size={26} fill="currentColor" strokeWidth={0} />}
      </button>
      <div className="mp-mini-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ── Mobil: fullskjerm «spilles nå» ─────────────────────────────────

export function NowPlayingSheet({ engine, ui, onClose, onOpenDevices, renderQueue }) {
  const { nowPlaying, activePlayer } = engine;
  const tint = useArtColor(nowPlaying.hasMedia ? nowPlaying.art : null);
  const [showQueue, setShowQueue] = useState(false);
  const touchY = useRef(null);

  const onTouchStart = (e) => { touchY.current = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (touchY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchY.current;
    touchY.current = null;
    if (dy > 90) { if (showQueue) setShowQueue(false); else onClose(); }
  };

  return createPortal(
    <div className="mp-sheet" style={tint ? { '--mp-tint': tint } : undefined}>
      {showQueue ? (
        <>
          <div className="mp-sheet-head" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <button className="mp-iconbtn" onClick={() => setShowQueue(false)} title="Tilbake"><ArrowLeft size={24} /></button>
            <div className="mp-sheet-headtxt"><span>Kø</span><strong>{activePlayer?.name}</strong></div>
            <span style={{ width: 40 }} />
          </div>
          <div className="mp-sheet-queue">{renderQueue?.()}</div>
        </>
      ) : (
        <>
          <div className="mp-sheet-head" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <button className="mp-iconbtn" onClick={onClose} title="Lukk"><ChevronDown size={26} /></button>
            <div className="mp-sheet-headtxt">
              <span>Spiller på</span>
              <strong>{activePlayer?.name || 'Ingen høyttaler'}{nowPlaying.sourceLabel ? ` · ${nowPlaying.sourceLabel}` : ''}</strong>
            </div>
            <button className="mp-iconbtn" onClick={(e) => nowPlaying.mediaItem && ui.openMenu(nowPlaying.mediaItem, e)} disabled={!nowPlaying.mediaItem} title="Mer">
              <Ellipsis size={24} />
            </button>
          </div>

          <div className="mp-sheet-body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="mp-sheet-artwrap">
              {nowPlaying.art && nowPlaying.hasMedia
                ? <img className="mp-sheet-art" src={nowPlaying.art} alt="" />
                : <div className="mp-sheet-art mp-art--empty"><Music size={72} /></div>}
            </div>

            <div className="mp-sheet-meta">
              <div className="mp-sheet-text">
                <div className={`mp-sheet-title${nowPlaying.albumItem?.uri ? ' mp-link' : ''}`}
                  onClick={() => nowPlaying.albumItem?.uri && ui.openItem(nowPlaying.albumItem)}>
                  {nowPlaying.hasMedia ? nowPlaying.title : 'Ingenting spilles'}
                </div>
                <NowArtists engine={engine} ui={ui} className="mp-sheet-artist" />
              </div>
              <NowHeart engine={engine} size={26} />
            </div>

            <ProgressSlider engine={engine} className="mp-sheet-progress" />
            <TransportControls engine={engine} size="lg" />

            <div className="mp-sheet-foot">
              <button className={`mp-devicebtn${nowPlaying.isPlaying ? ' mp-devicebtn--playing' : ''}`} onClick={() => onOpenDevices(null)}>
                <PlayerIcon player={activePlayer} size={18} />
                <span className="mp-devicebtn-name">{activePlayer?.name || 'Velg høyttaler'}</span>
              </button>
              <button className="mp-iconbtn" onClick={() => setShowQueue(true)} title="Kø"><ListMusic size={22} /></button>
            </div>
            {activePlayer && (
              <VolumeSlider
                className="mp-sheet-volume"
                value={nowPlaying.volume}
                muted={nowPlaying.muted}
                onChange={(v) => engine.setVolume(activePlayer.entityId, v)}
                onMute={(m) => engine.setMute(activePlayer.entityId, m)}
              />
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
