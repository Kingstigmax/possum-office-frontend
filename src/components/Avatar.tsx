import React from 'react';

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
        className="absolute transition-all duration-300 ease-out"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: isMe ? 20 : 10
        }}
      >
        {/* Avatar Circle */}
        <div className="relative">
          <div 
            className={`rounded-full ${isMe ? 'ring-2 ring-blue-500' : ''} bg-white border-2 border-gray-200`}
            style={{ width: '24px', height: '24px' }}
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
              bottom: '1px',
              left: '1px',
              transform: 'translate(-50%, 50%)',
              width: '10px',
              height: '10px'
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
        
        {/* Name Tag */}
        <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {name} {isMe && '(You)'}
        </div>
      </div>
    );
  }