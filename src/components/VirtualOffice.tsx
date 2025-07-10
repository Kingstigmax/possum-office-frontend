'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Avatar from './Avatar';
import { useOfficeStore } from '@/store/officeStore';
import io, { Socket } from 'socket.io-client';

// Backend URL configuration
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface User {
  id: string;
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

  // Socket connection
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [isConnected, me]);

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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2">Virtual Office</h1>
          <p className="text-gray-600 text-center mb-8">Create your character and join the office</p>
          
          <form onSubmit={handleLogin}>
            {/* Name Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your name"
                maxLength={20}
                required
              />
            </div>

            {/* Avatar Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Choose Your Avatar</label>
              <div className="flex items-center gap-4">
                <img
                  src={`https://api.dicebear.com/7.x/${selectedStyle.toLowerCase()}/svg?seed=${avatarSeed}`}
                  alt="Avatar preview"
                  className="w-24 h-24 rounded-full bg-gray-100"
                />
                <div className="flex-1">
                  <select 
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mb-2"
                  >
                    {avatarStyles.map(style => (
                      <option key={style} value={style}>{style}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAvatarSeed(Math.random().toString())}
                    className="w-full px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                  >
                    🎲 Randomize Look
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition"
            >
              Enter Office
            </button>
          </form>
        </div>
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
            <h1 className="text-2xl font-bold text-gray-800">Virtual Office Space</h1>
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
              {Array.from(users.values()).map((user) => (
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
              <h2 className="text-lg font-semibold mb-3">Team Members ({users.size + 1})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <img
                    src={`https://api.dicebear.com/7.x/${me.avatarSeed?.split('-')[0].toLowerCase()}/svg?seed=${me.avatarSeed?.split('-')[1]}`}
                    alt={me.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{me.name} (You)</div>
                    <div className="text-xs text-gray-500 capitalize">{me.status}</div>
                  </div>
                </div>
                {Array.from(users.values()).map((user) => (
                  <div key={user.socketId || user.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                    <img
                      src={user.avatarSeed ? 
                        `https://api.dicebear.com/7.x/${user.avatarSeed.split('-')[0].toLowerCase()}/svg?seed=${user.avatarSeed.split('-')[1]}` :
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                      }
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
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
                <button className="w-full px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition">
                  Start Huddle
                </button>
                <button className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition">
                  Find Quiet Space
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}