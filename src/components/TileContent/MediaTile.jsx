import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, Music } from 'lucide-react';

const MediaTile = ({ tile, device }) => {
    const { api } = useHomey();
    const [isPlaying, setIsPlaying] = useState(device.capabilitiesObj?.speaker_playing?.value || false);
    const [volume, setVolume] = useState(device.capabilitiesObj?.volume_set?.value || 0);
    const [track, setTrack] = useState(device.capabilitiesObj?.speaker_track?.value || '');
    const [artist, setArtist] = useState(device.capabilitiesObj?.speaker_artist?.value || '');
    const [album, setAlbum] = useState(device.capabilitiesObj?.speaker_album?.value || '');
    const [albumArtUrl, setAlbumArtUrl] = useState(null);

    // Sync state with device updates
    useEffect(() => {
        setIsPlaying(device.capabilitiesObj?.speaker_playing?.value || false);
        setVolume(device.capabilitiesObj?.volume_set?.value || 0);
        setTrack(device.capabilitiesObj?.speaker_track?.value || '');
        setArtist(device.capabilitiesObj?.speaker_artist?.value || '');
        setAlbum(device.capabilitiesObj?.speaker_album?.value || '');

        // Fetch album art
        const fetchAlbumArt = async () => {
            if (device.images && device.images.length > 0) {
                // Try to find a 'media' image or just the first one.
                const mediaImage = device.images.find(img => img.id.includes('albumart')) || device.images[0];

                if (mediaImage) {
                    try {
                        // Use the UUID from imageObj if available, otherwise fallback to the id (e.g. 'albumart')
                        const imageId = mediaImage.imageObj ? mediaImage.imageObj.id : mediaImage.id;

                        const url = await api.getDeviceImageUrl(device.id, imageId);
                        setAlbumArtUrl(url);
                    } catch (e) {
                        console.error("Failed to get album art url", e);
                        setAlbumArtUrl(null);
                    }
                }
            } else {
                setAlbumArtUrl(null);
            }
        };

        fetchAlbumArt();

    }, [device.capabilitiesObj, device.images, device.id, api]);


    const handlePlayPause = (e) => {
        e.stopPropagation();
        const newState = !isPlaying;
        setIsPlaying(newState);
        api.setCapability(device.id, 'speaker_playing', newState);
    };

    const handleNext = (e) => {
        e.stopPropagation();
        api.setCapability(device.id, 'speaker_next', true);
    };

    const handlePrev = (e) => {
        e.stopPropagation();
        api.setCapability(device.id, 'speaker_prev', true);
    };

    const handleVolumeChange = (e) => {
        e.stopPropagation();
        const newVol = parseFloat(e.target.value);
        setVolume(newVol);
        api.setCapability(device.id, 'volume_set', newVol);
    };

    const hasTrackInfo = track || artist;

    return (
        <div className="tile-content" style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden',
            padding: 0
        }}>
            {/* Background Image (Blurred) */}
            {albumArtUrl && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: `url(${albumArtUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(10px) brightness(0.4)',
                    zIndex: 0
                }} />
            )}

            {/* Gradient Overlay for better text/control visibility */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.8) 100%)',
                zIndex: 1,
                pointerEvents: 'none'
            }} />

            {/* Content Overlay */}
            <div style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                padding: '12px',
                justifyContent: 'space-between'
            }}>

                {/* Top: Album Art & Info */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', gap: '10px' }}>
                    {/* Album Art / Icon */}
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                        background: 'rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {albumArtUrl ? (
                            <img src={albumArtUrl} alt="Album Art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <Music size={40} color="var(--color-text-secondary)" />
                        )}
                    </div>

                    {/* Text Info */}
                    <div style={{ textAlign: 'center', width: '100%' }}>
                        <div style={{
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            color: 'white',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                        }}>
                            {track || device.name}
                        </div>
                        <div style={{
                            fontSize: '0.8rem',
                            color: 'rgba(255,255,255,0.8)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                        }}>
                            {artist || (hasTrackInfo ? '' : 'Ingen avspilling')}
                        </div>
                    </div>
                </div>

                {/* Bottom: Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>

                    {/* Progress / Volume (Using volume for now as progress is rare) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 48px' }}>
                        <Volume2 size={14} color="rgba(255,255,255,0.8)" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="media-slider"
                            style={{
                                flex: 1
                            }}
                        />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                        <button
                            className="icon-btn"
                            onClick={handlePrev}
                            style={{ color: 'white', background: 'transparent', padding: '8px' }}
                        >
                            <SkipBack size={20} fill="white" />
                        </button>

                        <button
                            className="icon-btn"
                            onClick={handlePlayPause}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'white',
                                color: 'black',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                            }}
                        >
                            {isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" style={{ marginLeft: '2px' }} />}
                        </button>

                        <button
                            className="icon-btn"
                            onClick={handleNext}
                            style={{ color: 'white', background: 'transparent', padding: '8px' }}
                        >
                            <SkipForward size={20} fill="white" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MediaTile;
