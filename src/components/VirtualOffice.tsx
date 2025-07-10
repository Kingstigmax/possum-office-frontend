'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Avatar from './Avatar';
import Chat from './Chat';
import { useOfficeStore } from '@/store/officeStore';
import { useVoiceProximity } from '@/hooks/useVoiceProximity';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import io, { Socket } from 'socket.io-client';

// Backend URL configuration
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface User {
  id: string;
  socketId?: string;
  name: string;
  x: number;
  y: number;
  status: string;
  avatarSeed?: string;
  voiceEnabled?: boolean;
}

const avatarStyles = [
  'Adventurer', 'Adventurer-Neutral', 'Avataaars', 'Big-Ears', 
  'Big-Smile', 'Bottts', 'Croodles', 'Fun-Emoji', 'Lorelei', 
  'Micah', 'Miniavs', 'Personas', 'Pixel-Art'
];

export default function VirtualOffice() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('available');
  const [socket, setSocket] = useState<Socket | null>(null);
  const officeRef = useRef<HTMLDivElement>(null);
  
  // Login form states
  const [userName, setUserName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Avataaars');
  const [avatarSeed, setAvatarSeed] = useState(Math.random().toString());
  const [possumSparkles, setPossumSparkles] = useState<Array<{id: number, x: number, y: number}>>([]);
  
  // Office activity states
  const [activities, setActivities] = useState<Array<{
    type: 'join' | 'leave';
    userName: string;
    timestamp: Date;
    message: string;
  }>>([]);
  
  // Zustand store
  const { users, addUser, removeUser, updateUserPosition, updateUserStatus, updateUserVoiceStatus, setUsers } = useOfficeStore();
  
  // Current user
  const [me, setMe] = useState<User & { avatarSeed?: string }>({
    id: Math.random().toString(36).substr(2, 9),
    name: `User${Math.floor(Math.random() * 1000)}`,
    x: 50,
    y: 80,
    status: 'available',
    avatarSeed: undefined,
    voiceEnabled: false
  });

  // Voice proximity hook
  const {
    isVoiceEnabled,
    isMuted,
    usersInRange,
    speakingUsers,
    toggleVoice,
    toggleMute,
    proximityThreshold
  } = useVoiceProximity({
    socket,
    currentUser: me,
    users: users.map(u => ({ ...u, voiceEnabled: u.voiceEnabled || false })),
    proximityThreshold: 25,
    maxDistance: 50
  });

  // Handle login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      const fullAvatarSeed = `${selectedStyle}-${avatarSeed}`;
      setMe(prev => ({ 
        ...prev, 
        name: userName.trim(), 
        avatarSeed: fullAvatarSeed,
        status: 'available'
      }));
      setIsLoggedIn(true);
      setIsConnected(true);
    }
  };

  // Handle possum click effect
  const handlePossumClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Create multiple sparkles around the click point
    const newSparkles = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i,
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 60
    }));
    
    setPossumSparkles(newSparkles);
    
    // Remove sparkles after animation
    setTimeout(() => {
      setPossumSparkles([]);
    }, 1000);
  };

  // Socket connection
  useEffect(() => {
    if (isConnected && !socket) {
      const newSocket = io(BACKEND_URL);
      
      newSocket.on('connect', () => {
        console.log('Connected to server');
        newSocket.emit('user:join', { ...me, avatarSeed: me.avatarSeed });
      });

      newSocket.on('users:list', (usersList: User[]) => {
        console.log('Received users:', usersList);
        setUsers(usersList.filter(u => u.id !== me.id));
      });

      newSocket.on('user:joined', (user: User) => {
        console.log('User joined:', user);
        addUser(user);
      });

      newSocket.on('user:moved', ({ socketId, x, y }) => {
        updateUserPosition(socketId, x, y);
      });

      newSocket.on('user:status-changed', ({ socketId, status }) => {
        updateUserStatus(socketId, status);
      });

      newSocket.on('user:left', (socketId: string) => {
        console.log('User left:', socketId);
        removeUser(socketId);
      });

      newSocket.on('voice:status-changed', ({ socketId, voiceEnabled }: { socketId: string; voiceEnabled: boolean }) => {
        console.log('Voice status changed:', socketId, voiceEnabled);
        updateUserVoiceStatus(socketId, voiceEnabled);
      });

      newSocket.on('office:activity', (activity: {
        type: 'join' | 'leave';
        userName: string;
        timestamp: Date;
        message: string;
      }) => {
        console.log('Office activity:', activity);
        setActivities(prev => [...prev.slice(-9), { ...activity, timestamp: new Date(activity.timestamp) }]); // Keep last 10 activities
      });

      setSocket(newSocket);
    }

    return () => {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    };
  }, [isConnected, socket, me.id, me.avatarSeed, addUser, removeUser, updateUserPosition, updateUserStatus, updateUserVoiceStatus, setUsers]);

  // Handle office click for movement
  const handleOfficeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isConnected || !officeRef.current) return;

    const rect = officeRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setMe(prev => ({ ...prev, x, y }));
    
    if (socket) {
      socket.emit('user:move', { x, y });
    }
  };

  // Handle leave office
  const handleLeaveOffice = () => {
    setIsConnected(false);
    setIsLoggedIn(false);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setUsers([]);
    setUserName('');
    setAvatarSeed(Math.random().toString());
  };

  // Update status
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setMe(prev => ({ ...prev, status: newStatus }));
    
    if (socket && isConnected) {
      socket.emit('user:status', newStatus);
    }
  };

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Sparkles scattered around */}
        <div style={{
          position: 'absolute',
          top: '5%',
          left: '5%',
          fontSize: '20px',
          animation: 'sparkle 3s ease-in-out infinite'
        }}>✨</div>
        <div style={{
          position: 'absolute',
          top: '15%',
          right: '8%',
          fontSize: '16px',
          animation: 'sparkle 2s ease-in-out infinite 0.5s'
        }}>⭐</div>
        <div style={{
          position: 'absolute',
          bottom: '20%',
          left: '8%',
          fontSize: '18px',
          animation: 'sparkle 2.5s ease-in-out infinite 1s'
        }}>✨</div>
        <div style={{
          position: 'absolute',
          bottom: '10%',
          right: '15%',
          fontSize: '14px',
          animation: 'sparkle 3.5s ease-in-out infinite 1.5s'
        }}>⭐</div>
        <div style={{
          position: 'absolute',
          top: '35%',
          left: '3%',
          fontSize: '12px',
          animation: 'sparkle 2.8s ease-in-out infinite 2s'
        }}>✨</div>
        <div style={{
          position: 'absolute',
          top: '60%',
          right: '5%',
          fontSize: '22px',
          animation: 'sparkle 3.2s ease-in-out infinite 0.8s'
        }}>⭐</div>
        
        {/* Rainbow at bottom left corner of background */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          width: '200px',
          height: '100px',
          zIndex: 5
        }}>
          <div style={{
            position: 'absolute',
            width: '200px',
            height: '100px',
            border: '5px solid #ff0000',
            borderBottom: 'none',
            borderRadius: '200px 200px 0 0',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite'
          }}></div>
          <div style={{
            position: 'absolute',
            width: '170px',
            height: '85px',
            border: '5px solid #ff7f00',
            borderBottom: 'none',
            borderRadius: '170px 170px 0 0',
            top: '8px',
            left: '8px',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite 0.2s'
          }}></div>
          <div style={{
            position: 'absolute',
            width: '140px',
            height: '70px',
            border: '5px solid #ffff00',
            borderBottom: 'none',
            borderRadius: '140px 140px 0 0',
            top: '16px',
            left: '16px',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite 0.4s'
          }}></div>
          <div style={{
            position: 'absolute',
            width: '110px',
            height: '55px',
            border: '5px solid #00ff00',
            borderBottom: 'none',
            borderRadius: '110px 110px 0 0',
            top: '24px',
            left: '24px',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite 0.6s'
          }}></div>
          <div style={{
            position: 'absolute',
            width: '80px',
            height: '40px',
            border: '5px solid #0000ff',
            borderBottom: 'none',
            borderRadius: '80px 80px 0 0',
            top: '32px',
            left: '32px',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite 0.8s'
          }}></div>
          <div style={{
            position: 'absolute',
            width: '50px',
            height: '25px',
            border: '5px solid #4b0082',
            borderBottom: 'none',
            borderRadius: '50px 50px 0 0',
            top: '40px',
            left: '40px',
            opacity: '0.4',
            animation: 'rainbow-glow 4s ease-in-out infinite 1s'
          }}></div>
        </div>
        
        {/* Animated Background Elements */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          animation: 'float 6s ease-in-out infinite'
        }}></div>
        <div style={{
          position: 'absolute',
          bottom: '10%',
          right: '10%',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
          borderRadius: '50%',
          animation: 'float 4s ease-in-out infinite reverse'
        }}></div>
        
        {/* Main Container with Possum and Form */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          maxWidth: '1200px',
          width: '100%',
          position: 'relative',
          zIndex: 10
        }}>
          {/* Possum Image */}
          <div style={{
            flex: '1.5',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingLeft: '20px',
            overflow: 'visible',
            position: 'relative'
          }}>
            <Image
              src="/possum-login.png"
              alt="Possum mascot"
              width={650}
              height={650}
              style={{
                maxWidth: 'none',
                width: '650px',
                height: 'auto',
                filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.3))',
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'transform 0.1s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onClick={handlePossumClick}
              priority
              unoptimized
            />
            
            {/* Sparkles from clicking possum */}
            {possumSparkles.map((sparkle) => (
              <div
                key={sparkle.id}
                style={{
                  position: 'absolute',
                  left: `${sparkle.x}px`,
                  top: `${sparkle.y}px`,
                  fontSize: '24px',
                  pointerEvents: 'none',
                  animation: 'possum-sparkle 1s ease-out forwards',
                  zIndex: 20
                }}
              >
                {Math.random() > 0.5 ? '✨' : '⭐'}
              </div>
            ))}
          </div>
          
          {/* Login Form */}
          <div style={{
            flex: '0 0 450px',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '24px',
            padding: '40px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{
              fontSize: '48px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '10px',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              Possum Office
            </h1>
            <p style={{
              fontSize: '18px',
              color: '#6b7280',
              fontWeight: '300'
            }}>
              Create your digital presence and join the workspace
            </p>
          </div>
          
          <form onSubmit={handleLogin}>
            {/* Avatar Preview */}
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{
                display: 'inline-block',
                position: 'relative',
                padding: '10px'
              }}>
                <div style={{
                  position: 'absolute',
                  inset: '0',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  borderRadius: '50%',
                  opacity: '0.2',
                  filter: 'blur(20px)',
                  animation: 'pulse 3s ease-in-out infinite'
                }}></div>
                <img
                  src={`https://api.dicebear.com/7.x/${selectedStyle.toLowerCase()}/svg?seed=${avatarSeed}`}
                  alt="Avatar preview"
                  style={{
                    width: '150px',
                    height: '150px',
                    borderRadius: '50%',
                    border: '4px solid #667eea',
                    background: 'white',
                    position: 'relative',
                    boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)'
                  }}
                />
              </div>
            </div>

            {/* Name Input */}
            <div style={{ marginBottom: '25px' }}>
              <label style={{
                display: 'block',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '16px',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                  background: 'white',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter your name"
                maxLength={20}
                required
              />
            </div>

            {/* Avatar Style Selector */}
            <div style={{ marginBottom: '25px' }}>
              <label style={{
                display: 'block',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Choose Your Avatar Style
              </label>
              <select 
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '16px',
                  background: 'white',
                  cursor: 'pointer',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              >
                {avatarStyles.map(style => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </div>
              
            {/* Randomize Button */}
            <button
              type="button"
              onClick={() => setAvatarSeed(Math.random().toString())}
              style={{
                width: '100%',
                padding: '15px',
                marginBottom: '25px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '20px' }}>🎲</span>
              <span>Randomize Look</span>
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '18px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '20px' }}>🚀</span>
              <span>Enter Possum Office</span>
            </button>
          </form>
          </div>
        </div>
        
        {/* CSS Animations */}
        <style jsx>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 0.4; }
          }
          @keyframes sparkle {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes rainbow-glow {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          @keyframes possum-sparkle {
            0% { 
              opacity: 0; 
              transform: scale(0) translateY(0px); 
            }
            20% { 
              opacity: 1; 
              transform: scale(1.2) translateY(-10px); 
            }
            100% { 
              opacity: 0; 
              transform: scale(0.5) translateY(-40px) rotate(180deg); 
            }
          }
          @keyframes office-glow {
            0%, 100% { 
              box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2); 
            }
            50% { 
              box-shadow: 0 35px 70px rgba(102, 126, 234, 0.3); 
            }
          }
          @keyframes gentle-float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-5px); }
          }
          @keyframes gentle-pulse {
            0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.15; transform: translate(-50%, -50%) scale(1.05); }
          }
          @keyframes activity-appear {
            0% { 
              opacity: 0; 
              transform: translateX(-10px) scale(0.95); 
            }
            100% { 
              opacity: 1; 
              transform: translateX(0) scale(1); 
            }
          }
          @media (max-width: 1024px) {
            .office-main-layout {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // Show office view when logged in
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Background Elements */}
      <div style={{
        position: 'absolute',
        top: '5%',
        left: '5%',
        width: '200px',
        height: '200px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 8s ease-in-out infinite'
      }}></div>
      <div style={{
        position: 'absolute',
        top: '60%',
        right: '10%',
        width: '150px',
        height: '150px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 6s ease-in-out infinite reverse'
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '15%',
        width: '100px',
        height: '100px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'float 7s ease-in-out infinite'
      }}></div>
      
      {/* Office Sparkles */}
      <div style={{
        position: 'absolute',
        top: '10%',
        right: '20%',
        fontSize: '16px',
        animation: 'sparkle 4s ease-in-out infinite'
      }}>✨</div>
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '8%',
        fontSize: '12px',
        animation: 'sparkle 3s ease-in-out infinite 1s'
      }}>⭐</div>
      <div style={{
        position: 'absolute',
        bottom: '40%',
        right: '5%',
        fontSize: '14px',
        animation: 'sparkle 3.5s ease-in-out infinite 2s'
      }}>✨</div>
      <div style={{
        position: 'absolute',
        bottom: '15%',
        right: '25%',
        fontSize: '18px',
        animation: 'sparkle 4.5s ease-in-out infinite 0.5s'
      }}>⭐</div>
      
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '20px',
        maxWidth: '1600px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '24px',
          padding: '30px',
          marginBottom: '30px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          animation: 'gentle-float 10s ease-in-out infinite'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h1 style={{
              fontSize: '36px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              Possum Office Space
            </h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              {/* Voice Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <button
                  onClick={toggleVoice}
                  style={{
                    padding: '12px',
                    background: isVoiceEnabled 
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={isVoiceEnabled ? 'Disable Voice Chat' : 'Enable Voice Chat'}
                >
                  {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                {isVoiceEnabled && (
                  <button
                    onClick={toggleMute}
                    style={{
                      padding: '12px',
                      background: isMuted 
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
              </div>
              <select 
                value={status} 
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: '12px 20px',
                  border: '2px solid rgba(102, 126, 234, 0.3)',
                  borderRadius: '16px',
                  fontSize: '14px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease'
                }}
              >
                <option value="available">🟢 Available</option>
                <option value="busy">🔴 Busy</option>
                <option value="meeting">🟡 In Meeting</option>
                <option value="away">⚪ Away</option>
              </select>
              <button
                onClick={handleLeaveOffice}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  border: 'none',
                  borderRadius: '16px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(240, 147, 251, 0.4)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(240, 147, 251, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(240, 147, 251, 0.4)';
                }}
              >
                Leave Office
              </button>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 400px',
          gap: '30px'
        }}
        className="office-main-layout"
        >
          {/* Office Map */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '24px',
            padding: '30px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            animation: 'gentle-float 6s ease-in-out infinite'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              Office Floor Plan
            </h2>
            <div 
              ref={officeRef}
              style={{
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: '0 15px 35px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s ease'
              }}
              onClick={handleOfficeClick}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.1)';
              }}
            >
              <Image
                src="/office-floorplan.jpg"
                alt="Office Floor Plan"
                width={1400}
                height={700}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block'
                }}
                priority
              />
              
              {/* Render my avatar */}
              <Avatar
                id={me.id}
                name={me.name}
                x={me.x}
                y={me.y}
                status={me.status}
                avatarSeed={me.avatarSeed}
                isMe={true}
              />

              {/* Render other users */}
              {users.map((user) => (
                <Avatar
                  key={user.socketId || user.id}
                  id={user.id}
                  name={user.name}
                  x={user.x}
                  y={user.y}
                  status={user.status}
                  avatarSeed={user.avatarSeed}
                  isMe={false}
                />
              ))}

              {/* Voice proximity indicator */}
              {isVoiceEnabled && (
                <div style={{
                  position: 'absolute',
                  left: `${me.x}%`,
                  top: `${me.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: `${proximityThreshold * 2}%`,
                  height: `${proximityThreshold * 2}%`,
                  borderRadius: '50%',
                  border: '2px dashed rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.05)',
                  pointerEvents: 'none',
                  zIndex: 1,
                  animation: 'gentle-pulse 3s ease-in-out infinite'
                }}
                />
              )}

              {/* Connection indicator */}
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                Connected as {me.name}
                {isVoiceEnabled && (
                  <span style={{
                    fontSize: '12px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '2px 6px',
                    borderRadius: '8px'
                  }}>
                    🎤 Voice Active
                  </span>
                )}
              </div>
            </div>
            <div style={{
              fontSize: '14px',
              color: 'rgba(107, 114, 128, 0.8)',
              marginTop: '15px',
              textAlign: 'center',
              fontStyle: 'italic',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}>
              <p style={{ margin: 0 }}>✨ Click anywhere on the floor to move around the office</p>
              {isVoiceEnabled && (
                <p style={{ 
                  margin: 0,
                  color: 'rgba(16, 185, 129, 0.8)',
                  fontSize: '13px'
                }}>
                  🎤 Voice chat active - get close to others to talk!
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '30px'
          }}>
            {/* Team Members */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '24px',
              padding: '25px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              animation: 'gentle-float 7s ease-in-out infinite'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                marginBottom: '20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                Team Members ({users.length + 1})
              </h2>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                  borderRadius: '16px',
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  position: 'relative'
                }}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={`https://api.dicebear.com/7.x/${me.avatarSeed?.split('-')[0].toLowerCase()}/svg?seed=${me.avatarSeed?.split('-')[1]}`}
                      alt={me.name}
                      style={{ 
                        width: '32px', 
                        height: '32px',
                        borderRadius: '50%',
                        border: '2px solid #667eea',
                        background: 'white'
                      }}
                    />
                    {isVoiceEnabled && (
                      <div style={{
                        position: 'absolute',
                        bottom: '-2px',
                        right: '-2px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: isMuted ? '#ef4444' : '#10b981',
                        border: '2px solid white',
                        fontSize: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white'
                      }}>
                        {isMuted ? '🔇' : '🎤'}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {me.name} (You)
                      {isVoiceEnabled && usersInRange.length > 0 && (
                        <span style={{
                          fontSize: '10px',
                          background: '#10b981',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontWeight: '500'
                        }}>
                          {usersInRange.length} nearby
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      textTransform: 'capitalize'
                    }}>
                      {me.status}
                    </div>
                  </div>
                </div>
                {users.map((user) => {
                  const isUserSpeaking = speakingUsers.has(user.socketId || user.id);
                  const isUserInRange = usersInRange.includes(user.socketId || user.id);
                  
                  return (
                    <div 
                      key={user.socketId || user.id} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        background: isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                          : 'rgba(255, 255, 255, 0.6)',
                        borderRadius: '16px',
                        border: isUserSpeaking 
                          ? '2px solid rgba(16, 185, 129, 0.3)'
                          : '1px solid rgba(255, 255, 255, 0.5)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)'
                          : 'rgba(255, 255, 255, 0.8)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                          : 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <img
                          src={user.avatarSeed ? 
                            `https://api.dicebear.com/7.x/${user.avatarSeed.split('-')[0].toLowerCase()}/svg?seed=${user.avatarSeed.split('-')[1]}` :
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                          }
                          alt={user.name}
                          style={{ 
                            width: '32px', 
                            height: '32px',
                            borderRadius: '50%',
                            border: isUserSpeaking 
                              ? '2px solid #10b981'
                              : '2px solid rgba(102, 126, 234, 0.3)',
                            background: 'white',
                            animation: isUserSpeaking ? 'pulse 1s infinite' : 'none'
                          }}
                        />
                        {user.voiceEnabled && (
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#10b981',
                            border: '2px solid white',
                            fontSize: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white'
                          }}>
                            🎤
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#374151',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {user.name}
                          {isUserInRange && (
                            <span style={{
                              fontSize: '10px',
                              background: '#10b981',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '8px',
                              fontWeight: '500'
                            }}>
                              nearby
                            </span>
                          )}
                          {isUserSpeaking && (
                            <span style={{
                              fontSize: '10px',
                              background: '#f59e0b',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '8px',
                              fontWeight: '500'
                            }}>
                              speaking
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          textTransform: 'capitalize'
                        }}>
                          {user.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Office Activity Overview */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '24px',
              padding: '25px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              animation: 'gentle-float 8s ease-in-out infinite'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: 'bold',
                marginBottom: '20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '22px' }}>🏢</span>
                Office Activity
              </h2>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {activities.length === 0 ? (
                  <div style={{
                    fontSize: '14px',
                    color: 'rgba(107, 114, 128, 0.8)',
                    textAlign: 'center',
                    fontStyle: 'italic',
                    padding: '20px',
                    background: 'rgba(102, 126, 234, 0.05)',
                    borderRadius: '16px',
                    border: '1px solid rgba(102, 126, 234, 0.1)'
                  }}>
                    🌟 No recent activity
                  </div>
                ) : (
                  activities.slice().reverse().map((activity, idx) => (
                    <div
                      key={`${activity.timestamp.getTime()}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        background: activity.type === 'join' 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(185, 28, 28, 0.1) 100%)',
                        borderRadius: '16px',
                        border: activity.type === 'join'
                          ? '1px solid rgba(16, 185, 129, 0.2)'
                          : '1px solid rgba(239, 68, 68, 0.2)',
                        animation: 'activity-appear 0.5s ease-out',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px'
                      }}>
                        {activity.type === 'join' ? '🚪➡️' : '🚪⬅️'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#374151',
                          marginBottom: '2px'
                        }}>
                          {activity.message}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: 'rgba(107, 114, 128, 0.7)'
                        }}>
                          {activity.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Global Chat */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '24px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              overflow: 'hidden',
              animation: 'gentle-float 9s ease-in-out infinite'
            }}>
              <Chat
                socket={socket}
                currentUserId={me.id}
                currentUserName={me.name}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}