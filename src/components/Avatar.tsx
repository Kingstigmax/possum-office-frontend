import React, { useState } from 'react';

interface AvatarProps {
    id: string;
    name: string;
    x: number;
    y: number;
    status: string;
    avatarSeed?: string;
    isMe?: boolean;
  }
  
  export default function Avatar({ id, name, x, y, status, avatarSeed, isMe = false }: AvatarProps) {
    const [isHovered, setIsHovered] = useState(false);
    const statusColors = {
      available: '#10b981',
      busy: '#ef4444',
      meeting: '#f59e0b',
      away: '#6b7280'
    };
  
    // Parse avatar style from seed
    const getAvatarUrl = () => {
      if (avatarSeed && avatarSeed.includes('-')) {
        const [style, seed] = avatarSeed.split('-');
        return `https://api.dicebear.com/7.x/${style.toLowerCase()}/svg?seed=${seed}`;
      }
      // Fallback to original
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
    };
  
    return (
      <div
        className="absolute"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: isMe ? 20 : 10,
          transition: 'left 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Avatar Circle */}
        <div className="relative">
          <div 
            className="rounded-full bg-white cursor-pointer"
            style={{ 
              width: '32px', 
              height: '32px',
              border: '1px solid rgba(0, 0, 0, 0.2)'
            }}
          >
            <img
              src={getAvatarUrl()}
              alt={name}
              className="rounded-full"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          
          {/* Status Indicator - positioned on bottom-left corner */}
          <svg 
            className="absolute"
            style={{
              bottom: '3px',
              left: '3px',
              transform: 'translate(-50%, 50%)',
              width: '12px',
              height: '12px'
            }}
            viewBox="0 0 12 12"
          >
            <circle 
              cx="6" 
              cy="6" 
              r="5" 
              fill={statusColors[status as keyof typeof statusColors] || '#6b7280'}
              stroke="white"
              strokeWidth="2"
            />
          </svg>
        </div>
        
        {/* Hover Name Tag */}
        {isHovered && (
          <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            {name} {isMe && '(You)'}
          </div>
        )}
      </div>
    );
  }