import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

interface AvatarProps {
    id: string;
    name: string;
    x: number;
    y: number;
    status: string;
    avatarSeed?: string;
    isMe?: boolean;
    isMoving?: boolean;
    isInVoiceRange?: boolean;
    isSpeaking?: boolean;
    voiceEnabled?: boolean;
    isMuted?: boolean;
  }
  
  export default function Avatar({ 
    id, 
    name, 
    x, 
    y, 
    status, 
    avatarSeed, 
    isMe = false, 
    isMoving = false,
    isInVoiceRange = false,
    isSpeaking = false,
    voiceEnabled = false,
    isMuted = false
  }: AvatarProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [ghostTrail, setGhostTrail] = useState<Array<{x: number, y: number, id: number, opacity: number}>>([]);
    const [isPathfinding, setIsPathfinding] = useState(false);
    const [previousX, setPreviousX] = useState(x);
    const [previousY, setPreviousY] = useState(y);
    const animationRef = useRef<number | null>(null);
    const trailUpdateRef = useRef<NodeJS.Timeout | null>(null);
    const [imageError, setImageError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    const statusColors = {
      available: '#10b981',
      busy: '#ef4444',
      meeting: '#f59e0b',
      away: '#6b7280'
    };
  
    // Generate a simple data URI avatar as final fallback
    const generateDataUriAvatar = () => {
      const initials = name ? name.substring(0, 2).toUpperCase() : 'XX';
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const bgColor = colors[Math.abs(name.charCodeAt(0) || 0) % colors.length];
      
      const svg = `
        <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
          <circle cx="64" cy="64" r="64" fill="${bgColor}"/>
          <text x="64" y="80" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
                text-anchor="middle" fill="white">${initials}</text>
        </svg>
      `;
      
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    };

    // Parse avatar style from seed
    const getAvatarUrl = () => {
      if (imageError) {
        // Try ui-avatars first, then data URI as final fallback
        try {
          return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=random&color=fff&size=128&rounded=true&format=svg`;
        } catch {
          return generateDataUriAvatar();
        }
      }
      
      if (avatarSeed && avatarSeed.includes('-')) {
        const [style, seed] = avatarSeed.split('-');
        return `https://api.dicebear.com/7.x/${style.toLowerCase()}/svg?seed=${seed}`;
      }
      // Fallback to original
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
    };

    // Handle image loading errors
    const handleImageError = () => {
      console.warn(`Avatar image failed to load for ${name}:`, getAvatarUrl());
      setImageError(true);
      setIsLoading(false);
    };

    // Handle image loading success
    const handleImageLoad = () => {
      setIsLoading(false);
      setImageError(false);
    };



    // Ghost trail system
    const updateGhostTrail = (newX: number, newY: number) => {
      if (Math.abs(newX - previousX) > 0.5 || Math.abs(newY - previousY) > 0.5) {
        const newTrailPoint = {
          x: previousX,
          y: previousY,
          id: Date.now() + Math.random(),
          opacity: 0.6
        };
        
        setGhostTrail(prev => {
          const updated = [...prev, newTrailPoint];
          // Keep only last 12 trail points
          return updated.slice(-12);
        });
        
        setPreviousX(newX);
        setPreviousY(newY);
      }
    };

    // Handle position changes with pathfinding effects
    useEffect(() => {
      if (x !== previousX || y !== previousY) {
        setIsPathfinding(true);
        updateGhostTrail(x, y);
        
        // Clear pathfinding state after movement
        const timeoutId = window.setTimeout(() => {
          setIsPathfinding(false);
        }, 800);
        
        return () => window.clearTimeout(timeoutId);
      }
    }, [x, y, previousX, previousY, updateGhostTrail]);

    // Animate ghost trail opacity decay
    useEffect(() => {
      const updateTrail = () => {
        setGhostTrail(prev => 
          prev.map(point => ({
            ...point,
            opacity: Math.max(0, point.opacity - 0.02)
          })).filter(point => point.opacity > 0.1)
        );
      };

      trailUpdateRef.current = setInterval(updateTrail, 50);
      return () => {
        if (trailUpdateRef.current) {
          clearInterval(trailUpdateRef.current);
        }
      };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        if (trailUpdateRef.current) {
          clearInterval(trailUpdateRef.current);
        }
      };
    }, []);

    return (
      <div
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: isMe ? 25 : 15,
          transition: 'left 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Ghost Trail System */}
        {ghostTrail.map((trailPoint, index) => (
          <div
            key={trailPoint.id}
            style={{
              position: 'absolute',
              left: `${(trailPoint.x - x) * 100}%`,
              top: `${(trailPoint.y - y) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: `${28 - index * 2}px`,
              height: `${28 - index * 2}px`,
              borderRadius: '50%',
              background: isMe 
                ? `radial-gradient(circle, rgba(102, 126, 234, ${trailPoint.opacity * 0.6}) 0%, rgba(102, 126, 234, ${trailPoint.opacity * 0.2}) 70%, transparent 100%)`
                : `radial-gradient(circle, rgba(59, 130, 246, ${trailPoint.opacity * 0.4}) 0%, rgba(59, 130, 246, ${trailPoint.opacity * 0.1}) 70%, transparent 100%)`,
              pointerEvents: 'none',
              zIndex: -1,
              animation: `ghostFade ${0.8 + index * 0.1}s ease-out forwards`,
              border: `1px solid rgba(255, 255, 255, ${trailPoint.opacity * 0.3})`,
              boxShadow: `0 0 ${10 + index * 2}px rgba(102, 126, 234, ${trailPoint.opacity * 0.3})`
            }}
          />
        ))}

        {/* Proximity Glow Effect */}
        {(isInVoiceRange || isSpeaking) && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: isSpeaking 
                ? `radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 50%, transparent 70%)`
                : `radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.05) 50%, transparent 70%)`,
              pointerEvents: 'none',
              zIndex: -1,
              animation: isSpeaking 
                ? 'proximityPulse 1s ease-in-out infinite'
                : 'proximityGlow 2s ease-in-out infinite alternate',
              border: `2px solid rgba(${isSpeaking ? '16, 185, 129' : '59, 130, 246'}, 0.4)`,
              boxShadow: `0 0 25px rgba(${isSpeaking ? '16, 185, 129' : '59, 130, 246'}, 0.6)`
            }}
          />
        )}

        {/* Enhanced Avatar Circle with Gaming Effects */}
        <div className="relative">
          {/* Pathfinding Visual Indicator */}
          {isPathfinding && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '2px solid rgba(34, 197, 94, 0.6)',
                animation: 'pathfindingPulse 0.8s ease-out infinite',
                pointerEvents: 'none',
                zIndex: -1
              }}
            />
          )}

          {/* Main Avatar */}
          <div 
            className="rounded-full bg-white cursor-pointer"
            style={{ 
              width: '32px', 
              height: '32px',
              border: isMe 
                ? '2px solid rgba(102, 126, 234, 0.8)'
                : '2px solid rgba(59, 130, 246, 0.6)',
              boxShadow: isMe 
                ? '0 0 15px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                : '0 0 10px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: isMe 
                ? 'linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(248, 250, 252, 1) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isLoading && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(59, 130, 246, 0.3)',
                borderTop: '2px solid rgba(59, 130, 246, 0.8)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            )}
            <Image
              src={getAvatarUrl()}
              alt={name}
              className="rounded-full"
              width={32}
              height={32}
              style={{ 
                width: '100%', 
                height: '100%',
                opacity: isLoading ? 0 : 1,
                transition: 'opacity 0.3s ease'
              }}
              unoptimized
              onLoad={handleImageLoad}
              onError={handleImageError}
              priority={isMe}
            />
          </div>

          {/* Enhanced Status Indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '3px',
              transform: 'translate(-50%, 50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: statusColors[status as keyof typeof statusColors] || '#6b7280',
              border: '2px solid white',
              boxShadow: `0 0 8px ${statusColors[status as keyof typeof statusColors] || '#6b7280'}`,
              animation: isMoving ? 'statusPulse 1s ease-in-out infinite' : 'none'
            }}
          />

          {/* Voice Status Indicator */}
          {voiceEnabled && !isMuted && (
            <div
              style={{
                position: 'absolute',
                bottom: '3px',
                right: '3px',
                transform: 'translate(50%, 50%)',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isSpeaking ? '#ef4444' : '#10b981',
                border: '2px solid white',
                boxShadow: `0 0 8px ${isSpeaking ? '#ef4444' : '#10b981'}`,
                animation: isSpeaking ? 'voicePulse 0.6s ease-in-out infinite' : 'none',
                fontSize: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold'
              }}
            >
              {isSpeaking ? '🔊' : '🎤'}
            </div>
          )}
        </div>
        
        {/* Enhanced Hover Name Tag */}
        {isHovered && (
          <div 
            style={{
              position: 'absolute',
              top: '100%',
              marginTop: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
              animation: 'nameTagAppear 0.3s ease-out forwards',
              zIndex: 30
            }}
          >
            <div style={{ 
              fontWeight: '600',
              marginBottom: isMe ? '2px' : '0'
            }}>
              {name} {isMe && '(You)'}
            </div>
            {isMe && (
              <div style={{ 
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.7)',
                textTransform: 'uppercase'
              }}>
                {status}
              </div>
            )}
          </div>
        )}

        {/* Add CSS animations */}
        <style jsx>{`
          @keyframes ghostFade {
            0% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          }
          
          @keyframes proximityPulse {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
            50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.5; }
          }
          
          @keyframes proximityGlow {
            0% { opacity: 0.2; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1.05); }
          }
          
          @keyframes pathfindingPulse {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
            100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
          }
          
          @keyframes statusPulse {
            0%, 100% { transform: translate(-50%, 50%) scale(1); }
            50% { transform: translate(-50%, 50%) scale(1.2); }
          }
          
          @keyframes voicePulse {
            0%, 100% { transform: translate(50%, 50%) scale(1); }
            50% { transform: translate(50%, 50%) scale(1.3); }
          }
          
          @keyframes nameTagAppear {
            0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            100% { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }