'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Avatar from './Avatar';
import Chat from './Chat';
import { useOfficeStore } from '@/store/officeStore';
import io, { Socket } from 'socket.io-client';

// Backend URL configuration
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface User {
  id: string;
  socketId?: string;
  name: string;
  x: number;
  y: number;
  status: string;
  avatarSeed?: string;
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
  
  // Zustand store
  const { users, addUser, removeUser, updateUserPosition, updateUserStatus, setUsers } = useOfficeStore();
  
  // Current user
  const [me, setMe] = useState<User & { avatarSeed?: string }>({
    id: Math.random().toString(36).substr(2, 9),
    name: `User${Math.floor(Math.random() * 1000)}`,
    x: 50,
    y: 80,
    status: 'available',
    avatarSeed: undefined
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

      setSocket(newSocket);
    }

    return () => {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    };
  }, [isConnected, socket, me.id, me.avatarSeed, addUser, removeUser, updateUserPosition, updateUserStatus, setUsers]);

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
        `}</style>
      </div>
    );
  }

  // Show office view when logged in
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-4 max-w-7xl">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">Possum Office Space</h1>
            <div className="flex items-center gap-4">
              <select 
                value={status} 
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="available">🟢 Available</option>
                <option value="busy">🔴 Busy</option>
                <option value="meeting">🟡 In Meeting</option>
                <option value="away">⚪ Away</option>
              </select>
              <button
                onClick={handleLeaveOffice}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
              >
                Leave Office
              </button>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Office Map */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-3">Office Floor Plan</h2>
            <div 
              ref={officeRef}
              className="relative bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
              onClick={handleOfficeClick}
            >
              <Image
                src="/office-floorplan.jpg"
                alt="Office Floor Plan"
                width={1400}
                height={700}
                className="w-full h-auto"
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

              {/* Connection indicator */}
              <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                Connected as {me.name}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Click anywhere on the floor to move
            </p>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Team Members */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Team Members ({users.length + 1})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <img
                    src={`https://api.dicebear.com/7.x/${me.avatarSeed?.split('-')[0].toLowerCase()}/svg?seed=${me.avatarSeed?.split('-')[1]}`}
                    alt={me.name}
                    style={{ width: '20px', height: '20px' }}
                    className="rounded-full"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{me.name} (You)</div>
                    <div className="text-xs text-gray-500 capitalize">{me.status}</div>
                  </div>
                </div>
                {users.map((user) => (
                  <div key={user.socketId || user.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                    <img
                      src={user.avatarSeed ? 
                        `https://api.dicebear.com/7.x/${user.avatarSeed.split('-')[0].toLowerCase()}/svg?seed=${user.avatarSeed.split('-')[1]}` :
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                      }
                      alt={user.name}
                      style={{ width: '20px', height: '20px' }}
                      className="rounded-full"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{user.name}</div>
                      <div className="text-xs text-gray-500 capitalize">{user.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
              <div className="space-y-2">
                <p className="text-sm text-gray-500">More actions coming soon...</p>
              </div>
            </div>

            {/* Global Chat */}
            <Chat
              socket={socket}
              currentUserId={me.id}
              currentUserName={me.name}
            />
          </div>
        </div>
      </div>
    </div>
  );
}