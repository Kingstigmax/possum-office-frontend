'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  videoEnabled?: boolean;
  isSharing?: boolean;
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

  // Movement state
  const [isMoving, setIsMoving] = useState(false);
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set());
  
  // Social features state
  const [chatBubbles, setChatBubbles] = useState<Array<{
    id: string;
    userId: string;
    message: string;
    timestamp: number;
    x: number;
    y: number;
  }>>([]);
  const [presenceCursors, setPresenceCursors] = useState<Array<{
    userId: string;
    x: number;
    y: number;
    timestamp: number;
  }>>([]);

  // Environmental effects state
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weatherEffect, setWeatherEffect] = useState<'clear' | 'rain' | 'snow' | 'particles'>('clear');
  const [isDayTime, setIsDayTime] = useState(true);
  const [interactiveElements, setInteractiveElements] = useState<Array<{
    id: string;
    x: number;
    y: number;
    type: 'plant' | 'coffee' | 'lamp' | 'window';
    isActive: boolean;
  }>>([
    { id: '1', x: 15, y: 25, type: 'plant', isActive: false },
    { id: '2', x: 85, y: 30, type: 'coffee', isActive: false },
    { id: '4', x: 75, y: 60, type: 'window', isActive: false },
  ]);



  // Video functionality state
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isSharingVideo, setIsSharingVideo] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [videoPreviewRef, setVideoPreviewRef] = useState<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  
  // Video huddle state
  const [isInVideoHuddle, setIsInVideoHuddle] = useState(false);
  const [videoHuddlePartner, setVideoHuddlePartner] = useState<string | null>(null);
  const [videoHuddlePartnerName, setVideoHuddlePartnerName] = useState<string | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [videoInvitation, setVideoInvitation] = useState<{from: string, fromName: string} | null>(null);
  
  // WebRTC peer connection
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [remoteVideoRef, setRemoteVideoRef] = useState<HTMLVideoElement | null>(null);

  // Video functionality
  const toggleCamera = useCallback(async () => {
    try {
      if (!isCameraOn) {
        // Turn camera ON
        setVideoError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 }, 
          audio: false 
        });
        setLocalVideoStream(stream);
        setIsCameraOn(true);
        
        // If we have a video element, attach the stream
        if (videoPreviewRef) {
          videoPreviewRef.srcObject = stream;
        }
      } else {
        // Turn camera OFF
        if (localVideoStream) {
          localVideoStream.getTracks().forEach(track => track.stop());
          setLocalVideoStream(null);
        }
        if (videoPreviewRef) {
          videoPreviewRef.srcObject = null;
        }
        setIsCameraOn(false);
        setIsSharingVideo(false); // Also stop sharing when turning off camera
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setVideoError('Failed to access camera. Please check permissions.');
      setIsCameraOn(false);
    }
  }, [isCameraOn, localVideoStream, videoPreviewRef]);

  const toggleVideoSharing = useCallback(() => {
    if (!isCameraOn) return;
    
    setIsSharingVideo(prev => {
      const newState = !prev;
      
      // Here we would emit to socket when implementing WebRTC
      if (socket && isConnected) {
        socket.emit('video:share', {
          isSharing: newState,
          userId: me.id
        });
      }
      
      return newState;
    });
  }, [isCameraOn, socket, isConnected, me.id]);

  // WebRTC peer connection functions
  const createPeerConnection = useCallback((partnerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      // Force relay for localhost testing
      iceCandidatePoolSize: 10
    });

    pc.onicecandidate = (event) => {
      console.log('ICE candidate event:', event.candidate);
      if (event.candidate && socket) {
        console.log('Sending ICE candidate to', partnerId, event.candidate);
        socket.emit('video:ice-candidate', {
          to: partnerId,
          candidate: event.candidate
        });
      } else {
        console.log('ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote video stream from', partnerId, event.streams);
      const stream = event.streams[0];
      setRemoteVideoStream(stream);
      
      // Set stream on video element immediately and with timeout as backup
      const videoElement = document.querySelector('#remote-video') as HTMLVideoElement;
      if (videoElement && stream) {
        videoElement.srcObject = stream;
        console.log('Remote video stream attached to element immediately');
      }
      
      // Backup attempt
      setTimeout(() => {
        const videoElementBackup = document.querySelector('#remote-video') as HTMLVideoElement;
        if (videoElementBackup && stream && !videoElementBackup.srcObject) {
          videoElementBackup.srcObject = stream;
          console.log('Remote video stream attached to element (backup)');
        }
      }, 100);
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        console.error('WebRTC connection failed!');
        setVideoError('Connection failed - trying to reconnect...');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.error('ICE connection failed!');
        setVideoError('Network connection failed');
      } else if (pc.iceConnectionState === 'connected') {
        console.log('ICE connection established!');
        setVideoError(null);
      }
    };

    return pc;
  }, [socket]);

  // Start video huddle
  const startVideoHuddle = useCallback(async (partnerId: string, partnerName: string) => {
    if (!isCameraOn || !localVideoStream || !socket) return;

    try {
      const pc = createPeerConnection(partnerId);
      setPeerConnection(pc);

      // Add local stream to peer connection
      localVideoStream.getTracks().forEach(track => {
        pc.addTrack(track, localVideoStream);
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to partner
      socket.emit('video:offer', {
        to: partnerId,
        offer: offer
      });

      setIsInVideoHuddle(true);
      setVideoHuddlePartner(partnerId);
      setVideoHuddlePartnerName(partnerName);
      
      console.log('Video huddle started with', partnerName);
    } catch (error) {
      console.error('Error starting video huddle:', error);
      setVideoError('Failed to start video huddle');
    }
  }, [isCameraOn, localVideoStream, socket, createPeerConnection]);

  // Accept video huddle invitation
  const acceptVideoHuddle = useCallback(async (partnerId: string, partnerName: string) => {
    if (!isCameraOn || !localVideoStream || !socket) return;

    try {
      // DON'T create peer connection here - wait for offer
      setIsInVideoHuddle(true);
      setVideoHuddlePartner(partnerId);
      setVideoHuddlePartnerName(partnerName);
      setVideoInvitation(null);

      // Accept the invitation - this will trigger the original inviter to send an offer
      socket.emit('video:accept', { to: partnerId });
      
      console.log('Video huddle accepted with', partnerName, '- waiting for offer...');
    } catch (error) {
      console.error('Error accepting video huddle:', error);
      setVideoError('Failed to accept video huddle');
    }
  }, [isCameraOn, localVideoStream, socket]);

  // Reject video huddle invitation
  const rejectVideoHuddle = useCallback((partnerId: string) => {
    if (!socket) return;
    
    socket.emit('video:reject', { to: partnerId });
    setVideoInvitation(null);
  }, [socket]);

  // End video huddle
  const endVideoHuddle = useCallback(() => {
    if (socket && videoHuddlePartner) {
      socket.emit('video:end', { to: videoHuddlePartner });
    }

    // Clean up peer connection
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }

    // Clean up remote video
    if (remoteVideoRef) {
      remoteVideoRef.srcObject = null;
    }

    setIsInVideoHuddle(false);
    setVideoHuddlePartner(null);
    setVideoHuddlePartnerName(null);
    setRemoteVideoStream(null);
    
    console.log('Video huddle ended');
  }, [socket, videoHuddlePartner, peerConnection, remoteVideoRef]);

  // Invite user to video huddle
  const inviteToVideoHuddle = useCallback((userId: string, userName: string) => {
    if (!socket || !isCameraOn) return;
    
    socket.emit('video:invite', { to: userId });
    console.log('Video huddle invitation sent to', userName);
  }, [socket, isCameraOn]);

  // Cleanup video stream on unmount
  useEffect(() => {
    return () => {
      if (localVideoStream) {
        localVideoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localVideoStream]);

  // Voice proximity hook
  // Room-based voice chat system
  const getRoomFromPosition = useCallback((x: number): number => {
    // Divide office into 3 equal vertical slices with more precise boundaries
    if (x < 33.33) return 1; // Left room
    if (x < 66.66) return 2; // Middle room
    return 3; // Right room
  }, []);

  const currentRoom = useMemo(() => getRoomFromPosition(me.x), [me.x, getRoomFromPosition]);
  const [previousRoom, setPreviousRoom] = useState(currentRoom);

  // Get users in the same room - memoize with specific dependencies
  const usersInCurrentRoom = useMemo(() => {
    return users.filter(user => {
      const userRoom = getRoomFromPosition(user.x);
      return userRoom === currentRoom && user.voiceEnabled;
    });
  }, [users, currentRoom, getRoomFromPosition]);

  // Memoize users array for voice proximity (now room-based)
  const stableUsers = useMemo(() => 
    usersInCurrentRoom.map(u => ({ ...u, voiceEnabled: u.voiceEnabled || false })), 
    [usersInCurrentRoom]
  );

  // Memoize current user to prevent infinite loops
  const stableCurrentUser = useMemo(() => ({ ...me }), [me]);

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
    currentUser: stableCurrentUser,
    users: stableUsers,
    proximityThreshold: 100, // Large threshold - everyone in same room can talk
    maxDistance: 200 // Large max distance
  });

  // Simple room tracking - just update the previous room
  useEffect(() => {
    if (currentRoom !== previousRoom) {
      console.log(`Moved to Room ${currentRoom}`);
      setPreviousRoom(currentRoom);
    }
  }, [currentRoom, previousRoom]);

  // Environmental effects system
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    const weatherInterval = setInterval(() => {
      const effects: Array<'clear' | 'rain' | 'snow' | 'particles'> = ['clear', 'clear', 'clear', 'rain', 'snow', 'particles'];
      setWeatherEffect(effects[Math.floor(Math.random() * effects.length)]);
    }, 30000); // Change weather every 30 seconds

    return () => {
      clearInterval(timeInterval);
      clearInterval(weatherInterval);
    };
  }, []);

  // Day/night cycle
  useEffect(() => {
    const hour = currentTime.getHours();
    setIsDayTime(hour >= 6 && hour < 18);
  }, [currentTime]);



  // Interactive elements logic
  const handleElementInteraction = useCallback((elementId: string) => {
    setInteractiveElements(prev => 
      prev.map(el => 
        el.id === elementId 
          ? { ...el, isActive: !el.isActive }
          : el
      )
    );



    // Add some sparkle effects when interacting
    setTimeout(() => {
      setInteractiveElements(prev => 
        prev.map(el => 
          el.id === elementId 
            ? { ...el, isActive: false }
            : el
        )
      );
          }, 3000);
  }, []);

  // WASD keyboard movement
  useEffect(() => {
    const isInputFocused = () => {
      const activeElement = document.activeElement;
      return activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key) && !isInputFocused()) {
        e.preventDefault();
        setKeysPressed(prev => new Set(prev).add(key));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key) && !isInputFocused()) {
        e.preventDefault();
        setKeysPressed(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle WASD movement
  useEffect(() => {
    if (!isConnected || keysPressed.size === 0) return;

    const moveSpeed = 0.8; // Movement speed (percentage per frame)
    let lastSocketUpdate = 0;
    const socketUpdateInterval = 100; // Only send to socket every 100ms
    let animationFrame: number;

    const updateMovement = () => {
      const currentTime = Date.now();
      
      setMe(prev => {
        let newX = prev.x;
        let newY = prev.y;

        // Apply movement based on pressed keys
        if (keysPressed.has('w')) newY = Math.max(0, newY - moveSpeed);
        if (keysPressed.has('s')) newY = Math.min(100, newY + moveSpeed);
        if (keysPressed.has('a')) newX = Math.max(0, newX - moveSpeed);
        if (keysPressed.has('d')) newX = Math.min(100, newX + moveSpeed);

        // Only update if position changed
        if (newX !== prev.x || newY !== prev.y) {
          // Send to socket less frequently to reduce network load
          if (socket && currentTime - lastSocketUpdate > socketUpdateInterval) {
            socket.emit('user:move', { x: newX, y: newY });
            lastSocketUpdate = currentTime;
          }
          
          return { ...prev, x: newX, y: newY };
        }
        
        return prev;
      });

      // Continue animation if keys are still pressed
      if (keysPressed.size > 0) {
        animationFrame = requestAnimationFrame(updateMovement);
      }
    };

    animationFrame = requestAnimationFrame(updateMovement);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [keysPressed, isConnected, socket]);

  // Handle login
  const handleLogin = useCallback((e: React.FormEvent) => {
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
  }, [userName, selectedStyle, avatarSeed]);

  // Handle possum click effect
  const handlePossumClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
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
  }, []);

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
      
      // Update own voice status when it changes
      newSocket.on('voice:status-updated', ({ socketId, voiceEnabled }: { socketId: string; voiceEnabled: boolean }) => {
        console.log('Own voice status updated:', socketId, voiceEnabled);
        if (socketId === newSocket.id) {
          setMe(prev => ({ ...prev, voiceEnabled }));
        }
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

      // Chat bubble events
      newSocket.on('chat:bubble', (data: {
        userId: string;
        message: string;
        x: number;
        y: number;
      }) => {
        const bubble = {
          id: Math.random().toString(36).substr(2, 9),
          userId: data.userId,
          message: data.message,
          timestamp: Date.now(),
          x: data.x,
          y: data.y
        };
        
        setChatBubbles(prev => [...prev, bubble]);
        
        // Remove bubble after 5 seconds
        setTimeout(() => {
          setChatBubbles(prev => prev.filter(b => b.id !== bubble.id));
        }, 5000);
      });

      // Presence cursor events
      newSocket.on('cursor:moved', (data: {
        userId: string;
        x: number;
        y: number;
      }) => {
        setPresenceCursors(prev => {
          const existing = prev.find(c => c.userId === data.userId);
          if (existing) {
            return prev.map(c => 
              c.userId === data.userId 
                ? { ...c, x: data.x, y: data.y, timestamp: Date.now() }
                : c
            );
          } else {
            return [...prev, { userId: data.userId, x: data.x, y: data.y, timestamp: Date.now() }];
          }
        });
      });

      // Video huddle events
      newSocket.on('video:invite', (data: {
        from: string;
        fromName: string;
      }) => {
        console.log('Video huddle invitation from', data.fromName);
        setVideoInvitation(data);
      });

      newSocket.on('video:accepted', (data: {
        from: string;
        fromName: string;
      }) => {
        console.log('Video huddle accepted by', data.fromName);
        startVideoHuddle(data.from, data.fromName);
      });

      newSocket.on('video:rejected', (data: {
        from: string;
        fromName: string;
      }) => {
        console.log('Video huddle rejected by', data.fromName);
        setVideoError(`${data.fromName} declined the video huddle`);
        setTimeout(() => setVideoError(null), 3000);
      });

      newSocket.on('video:ended', (data: {
        from: string;
        fromName: string;
      }) => {
        console.log('Video huddle ended by', data.fromName);
        endVideoHuddle();
      });

      // WebRTC signaling events
      newSocket.on('video:offer', async (data: {
        from: string;
        offer: RTCSessionDescriptionInit;
      }) => {
        console.log('🎥 Received video offer from', data.from, data.offer);
        
        // Create peer connection when receiving offer (for the person who accepted)
        if (!peerConnection && localVideoStream) {
          console.log('🔧 Creating peer connection for incoming offer');
          const pc = createPeerConnection(data.from);
          setPeerConnection(pc);
          
          // Add local stream to peer connection
          console.log('📹 Adding local video tracks to peer connection');
          localVideoStream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind, track.enabled);
            pc.addTrack(track, localVideoStream);
          });
          
          // Handle the offer
          try {
            console.log('📨 Setting remote description from offer');
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('✅ Remote description set successfully');
            
            console.log('📤 Creating answer');
            const answer = await pc.createAnswer();
            console.log('✅ Answer created:', answer);
            
            console.log('📝 Setting local description');
            await pc.setLocalDescription(answer);
            console.log('✅ Local description set');
            
            newSocket.emit('video:answer', {
              to: data.from,
              answer: answer
            });
            console.log('📨 Sent video answer to', data.from);
          } catch (error) {
            console.error('❌ Error handling video offer:', error);
            setVideoError(`Offer handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else if (peerConnection) {
          console.log('🔄 Using existing peer connection for offer');
          // Handle offer if peer connection already exists
          try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            newSocket.emit('video:answer', {
              to: data.from,
              answer: answer
            });
            console.log('Sent video answer to', data.from);
          } catch (error) {
            console.error('Error handling video offer:', error);
          }
        } else {
          console.error('❌ No local video stream available for offer!');
          setVideoError('Camera not ready - please try again');
        }
      });

      newSocket.on('video:answer', async (data: {
        from: string;
        answer: RTCSessionDescriptionInit;
      }) => {
        console.log('🎥 Received video answer from', data.from, data.answer);
        if (peerConnection) {
          try {
            console.log('📝 Setting remote description from answer');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✅ Remote description set from answer');
          } catch (error) {
            console.error('❌ Error handling video answer:', error);
            setVideoError(`Answer handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          console.error('❌ No peer connection available for answer!');
        }
      });

      newSocket.on('video:ice-candidate', async (data: {
        from: string;
        candidate: RTCIceCandidateInit;
      }) => {
        console.log('🧊 Received ICE candidate from', data.from, data.candidate);
        if (peerConnection) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('✅ ICE candidate added successfully');
          } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
          }
        } else {
          console.error('❌ No peer connection available for ICE candidate!');
        }
      });

      setSocket(newSocket);
    }

    return () => {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, socket]); // Zustand store functions are stable and don't need to be in dependencies

  // Handle office click for movement
  const handleOfficeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isConnected || !officeRef.current || isMoving) return;

    const rect = officeRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Set movement state
    setIsMoving(true);
    
    // Start movement
    setMe(prev => ({ ...prev, x, y }));
    
    // Send to socket immediately
    if (socket) {
      socket.emit('user:move', { x, y });
    }



    // Reset movement state after animation completes
    setTimeout(() => {
      setIsMoving(false);
    }, 800); // Match the CSS transition duration
      }, [isConnected, isMoving, socket]);

  // Handle mouse movement for presence cursors
  const handleOfficeMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isConnected || !officeRef.current || !socket) return;

    const rect = officeRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Throttle cursor updates to reduce network load
    const now = Date.now();
    const mouseMoveHandler = handleOfficeMouseMove as { lastUpdate?: number };
    if (now - (mouseMoveHandler.lastUpdate ?? 0) > 100) {
      socket.emit('cursor:move', { x, y });
      mouseMoveHandler.lastUpdate = now;
    }
  }, [isConnected, socket]);

  // Send chat bubble when sending a message
  const handleChatBubble = useCallback((message: string) => {
    if (!socket || !isConnected) return;
    
    socket.emit('chat:bubble', {
      message: message.length > 30 ? message.substring(0, 30) + '...' : message,
      x: me.x,
      y: me.y
    });

  }, [socket, isConnected, me.x, me.y]);



  // Handle leave office
  const handleLeaveOffice = useCallback(() => {
    // Turn off voice chat if enabled
    if (isVoiceEnabled) {
      toggleVoice();
    }
    
    setIsConnected(false);
    setIsLoggedIn(false);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setUsers([]);
    setUserName('');
    setAvatarSeed(Math.random().toString());
    
    // Reset avatar settings to defaults
    setMe(prev => ({
      ...prev,
      x: 50,
      y: 80,
      status: 'available',
      voiceEnabled: false
    }));
  }, [isVoiceEnabled, toggleVoice, socket, setUsers]);



  // Update status
  const handleStatusChange = useCallback((newStatus: string) => {
    setStatus(newStatus);
    setMe(prev => ({ ...prev, status: newStatus }));
    
    if (socket && isConnected) {
      socket.emit('user:status', newStatus);
    }
  }, [socket, isConnected]);

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return (
      <div 
        className="min-h-screen w-full flex items-center justify-center p-5"
        style={{
          background: 'linear-gradient(-45deg, #0f0f23, #1a1a2e, #16213e, #0f3460)',
          backgroundSize: '400% 400%',
          animation: 'gradientShift 15s ease infinite',
          minHeight: '100vh',
          width: '100vw'
        }}
        onMouseMove={(e) => {
          if (typeof window !== 'undefined' && document?.documentElement) {
            try {
              const { clientX, clientY } = e;
              const { innerWidth, innerHeight } = window;
              const xPercent = Math.max(0, Math.min(100, (clientX / innerWidth) * 100));
              const yPercent = Math.max(0, Math.min(100, (clientY / innerHeight) * 100));
              
              document.documentElement.style.setProperty('--mouse-x', `${xPercent}%`);
              document.documentElement.style.setProperty('--mouse-y', `${yPercent}%`);
            } catch (error) {
              // Silently fail if there's any issue with mouse tracking
              console.log('Mouse tracking disabled due to error:', error);
            }
          }
        }}
      >
        {/* Animated Mesh Gradient Background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 50% 50%, 
              rgba(59, 130, 246, 0.15) 0%, 
              transparent 60%),
            radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.2) 0%, transparent 60%),
            radial-gradient(circle at 20% 80%, rgba(34, 197, 94, 0.15) 0%, transparent 60%)
          `,
          transition: 'background 0.3s ease',
          animation: 'meshFloat 20s ease-in-out infinite alternate'
        }}></div>

        {/* Floating 3D Office Elements */}
        <div style={{ position: 'absolute', top: '10%', left: '10%', zIndex: 1 }}>
          <div style={{
            width: '60px',
            height: '40px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            backdropFilter: 'blur(15px)',
            transform: 'rotateY(25deg) rotateX(10deg)',
            animation: 'float3D 6s ease-in-out infinite',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}></div>
        </div>
        
        <div style={{ position: 'absolute', top: '60%', right: '15%', zIndex: 1 }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: 'rgba(59, 130, 246, 0.15)',
            borderRadius: '50%',
            backdropFilter: 'blur(15px)',
            animation: 'float3D 4s ease-in-out infinite reverse',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}></div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20%', left: '20%', zIndex: 1 }}>
          <div style={{
            width: '80px',
            height: '20px',
            background: 'rgba(139, 92, 246, 0.15)',
            borderRadius: '20px',
            backdropFilter: 'blur(15px)',
            transform: 'rotateZ(15deg)',
            animation: 'float3D 8s ease-in-out infinite',
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}></div>
        </div>

        {/* Particle System */}
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: '3px',
              height: '3px',
              background: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '50%',
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `particleFloat ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
              boxShadow: '0 0 6px rgba(255, 255, 255, 0.2)'
            }}
          />
        ))}

        {/* Main Container */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '480px'
        }}>
          {/* Glassmorphism Login Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            borderRadius: '32px',
            padding: '48px 40px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.12),
              inset 0 1px 0 rgba(255, 255, 255, 0.2)
            `,
            position: 'relative',
            overflow: 'hidden',
            animation: 'cardAppear 1s ease-out'
          }}>
            {/* Card Glow Effect */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(240, 147, 251, 0.1))',
              borderRadius: '32px',
              opacity: 0.5,
              animation: 'cardGlow 3s ease-in-out infinite alternate'
            }}></div>

                         {/* Possum Avatar - Floating Above */}
             <div style={{
               position: 'absolute',
               top: '-5px',
               left: '50%',
               transform: 'translateX(-50%)',
               zIndex: 15
             }}>
               <div style={{
                 position: 'relative',
                 animation: 'possumFloat 4s ease-in-out infinite'
               }}>
                 <Image
                   src="/possum-login.png"
                   alt="Possum mascot"
                   width={120}
                   height={120}
                   style={{
                     width: '120px',
                     height: 'auto',
                     filter: 'drop-shadow(0 15px 30px rgba(0, 0, 0, 0.3))',
                     borderRadius: '15px',
                     cursor: 'pointer',
                     transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                   }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)';
                    e.currentTarget.style.filter = 'drop-shadow(0 25px 50px rgba(102, 126, 234, 0.4))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
                    e.currentTarget.style.filter = 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.3))';
                  }}
                  onClick={handlePossumClick}
                  priority
                  unoptimized
                />
                
                                                                  
                {/* Sparkles */}
                {possumSparkles.map((sparkle) => (
                  <div
                    key={sparkle.id}
                    style={{
                      position: 'absolute',
                      left: `${sparkle.x}px`,
                      top: `${sparkle.y}px`,
                      fontSize: '20px',
                      pointerEvents: 'none',
                      animation: 'possumSparkle 1s ease-out forwards',
                      zIndex: 25
                    }}
                  >
                    {Math.random() > 0.5 ? '✨' : '⭐'}
                  </div>
                ))}
              </div>
            </div>

            {/* Welcome Animation */}
            <div style={{
              textAlign: 'center',
              marginBottom: '40px',
              marginTop: '20px'
            }}>
              <h1 style={{
                fontSize: 'clamp(32px, 8vw, 48px)',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 50%, #ffffff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: '16px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.02em',
                animation: 'titleAppear 1.2s ease-out 0.3s both'
              }}>
                Welcome to Possum Office
              </h1>
              <p style={{
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontWeight: '400',
                lineHeight: '1.6',
                animation: 'titleAppear 1.2s ease-out 0.6s both'
              }}>
                Step into your magical workspace ✨
              </p>
            </div>

            <form onSubmit={handleLogin} style={{ position: 'relative', zIndex: 5 }}>
              {/* Avatar Preview with Real-time Updates */}
              <div style={{
                textAlign: 'center',
                marginBottom: '32px',
                animation: 'titleAppear 1.2s ease-out 0.9s both'
              }}>
                <div style={{
                  display: 'inline-block',
                  position: 'relative',
                  padding: '8px'
                }}>
                  {/* Animated Avatar Ring */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'conic-gradient(from 0deg, #667eea, #764ba2, #f093fb, #f5576c, #667eea)',
                    borderRadius: '50%',
                    animation: 'avatarRing 3s linear infinite',
                    padding: '3px'
                  }}>
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '50%',
                      backdropFilter: 'blur(10px)'
                    }}></div>
                  </div>
                  
                  <Image
                    src={`https://api.dicebear.com/7.x/${selectedStyle.toLowerCase()}/svg?seed=${userName || avatarSeed}`}
                    alt="Your avatar"
                    width={120}
                    height={120}
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.9)',
                      position: 'relative',
                      zIndex: 2,
                      transition: 'all 0.3s ease'
                    }}
                    unoptimized
                  />
                </div>
              </div>

              {/* Smart Name Input */}
              <div style={{
                marginBottom: '24px',
                animation: 'titleAppear 1.2s ease-out 1.2s both'
              }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '20px 24px',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '16px',
                      fontSize: '18px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      color: 'white',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      fontWeight: '500'
                    }}
                    placeholder="Enter your name..."
                    maxLength={20}
                    required
                    onFocus={(e) => {
                      e.currentTarget.style.border = '2px solid rgba(102, 126, 234, 0.8)';
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.2), 0 8px 25px rgba(102, 126, 234, 0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = '2px solid rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  />
                  
                  {/* Enter hint */}
                  {userName && (
                    <div style={{
                      position: 'absolute',
                      right: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      animation: 'fadeIn 0.3s ease'
                    }}>
                      Press Enter ⏎
                    </div>
                  )}
                </div>
              </div>

              {/* Style Selector */}
              <div style={{
                marginBottom: '24px',
                animation: 'titleAppear 1.2s ease-out 1.5s both'
              }}>
                <select 
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    fontSize: '16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    color: 'white',
                    cursor: 'pointer',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.3s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '2px solid rgba(240, 147, 251, 0.8)';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(240, 147, 251, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '2px solid rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {avatarStyles.map(style => (
                    <option key={style} value={style} style={{ color: 'black' }}>
                      {style}
                    </option>
                  ))}
                </select>
              </div>
                
              {/* Magic Randomize Button */}
              <button
                type="button"
                onClick={() => setAvatarSeed(Math.random().toString())}
                style={{
                  width: '100%',
                  padding: '16px',
                  marginBottom: '24px',
                  background: 'rgba(240, 147, 251, 0.2)',
                  border: '2px solid rgba(240, 147, 251, 0.4)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  animation: 'titleAppear 1.2s ease-out 1.8s both'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(240, 147, 251, 0.3)';
                  e.currentTarget.style.border = '2px solid rgba(240, 147, 251, 0.6)';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(240, 147, 251, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(240, 147, 251, 0.2)';
                  e.currentTarget.style.border = '2px solid rgba(240, 147, 251, 0.4)';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: '20px', animation: 'spin 2s linear infinite' }}>🎲</span>
                <span>Randomize Avatar</span>
              </button>

              {/* Enter Office Button */}
              <button
                type="submit"
                disabled={!userName.trim()}
                style={{
                  width: '100%',
                  padding: '20px',
                  background: userName.trim() 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '16px',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: '700',
                  cursor: userName.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  animation: 'titleAppear 1.2s ease-out 2.1s both',
                  boxShadow: userName.trim() 
                    ? '0 8px 25px rgba(102, 126, 234, 0.4)'
                    : 'none'
                }}
                onMouseEnter={(e) => {
                  if (userName.trim()) {
                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.6)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = userName.trim() 
                    ? '0 8px 25px rgba(102, 126, 234, 0.4)'
                    : 'none';
                }}
              >
                <span style={{ 
                  fontSize: '20px',
                  animation: userName.trim() ? 'rocketBounce 1s ease-in-out infinite' : 'none'
                }}>🚀</span>
                <span>Enter Your Workspace</span>
              </button>
            </form>
          </div>
        </div>
        
        {/* CSS Animations */}
        <style jsx>{`
          /* Hero Background Animations */
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          
          @keyframes meshFloat {
            0%, 100% { 
              filter: hue-rotate(0deg) brightness(1); 
              transform: scale(1);
            }
            50% { 
              filter: hue-rotate(30deg) brightness(1.1); 
              transform: scale(1.02);
            }
          }
          
          /* 3D Floating Elements */
          @keyframes float3D {
            0%, 100% { 
              transform: rotateY(25deg) rotateX(10deg) translateY(0px); 
            }
            50% { 
              transform: rotateY(35deg) rotateX(15deg) translateY(-20px); 
            }
          }
          
          /* Particle System */
          @keyframes particleFloat {
            0%, 100% { 
              opacity: 0.3; 
              transform: translateY(0px) scale(1); 
            }
            50% { 
              opacity: 1; 
              transform: translateY(-30px) scale(1.2); 
            }
          }
          
          /* Card Entrance */
          @keyframes cardAppear {
            0% { 
              opacity: 0; 
              transform: translateY(30px) scale(0.95); 
            }
            100% { 
              opacity: 1; 
              transform: translateY(0) scale(1); 
            }
          }
          
          @keyframes cardGlow {
            0%, 100% { 
              opacity: 0.3; 
            }
            50% { 
              opacity: 0.6; 
            }
          }
          
          /* Title Animations */
          @keyframes titleAppear {
            0% { 
              opacity: 0; 
              transform: translateY(20px); 
            }
            100% { 
              opacity: 1; 
              transform: translateY(0); 
            }
          }
          
          /* Possum Animations */
          @keyframes possumFloat {
            0%, 100% { 
              transform: translateY(0px) rotate(0deg); 
            }
            50% { 
              transform: translateY(-8px) rotate(1deg); 
            }
          }
          
          @keyframes magicRing {
            0% { 
              transform: translate(-50%, -50%) rotate(0deg) scale(1); 
              opacity: 0.3; 
            }
            50% { 
              opacity: 0.6; 
            }
            100% { 
              transform: translate(-50%, -50%) rotate(360deg) scale(1.1); 
              opacity: 0.3; 
            }
          }
          
          @keyframes possumSparkle {
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
          
          /* Avatar Animations */
          @keyframes avatarRing {
            0% { 
              transform: rotate(0deg); 
            }
            100% { 
              transform: rotate(360deg); 
            }
          }
          
          /* Button Animations */
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes rocketBounce {
            0%, 100% { 
              transform: translateY(0px); 
            }
            50% { 
              transform: translateY(-3px); 
            }
          }
          
          @keyframes fadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          
          @keyframes inputGlow {
            0% { 
              box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4); 
            }
            100% { 
              box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2), 0 8px 25px rgba(102, 126, 234, 0.3); 
            }
          }
          
          /* Mobile Responsive */
          @media (max-width: 768px) {
            .login-container {
              padding: 20px !important;
              margin: 20px !important;
            }
          }
          
          /* Gaming UI Animations */
          @keyframes ambientGlow {
            0%, 100% { 
              filter: hue-rotate(0deg) brightness(1);
              transform: scale(1);
            }
            50% { 
              filter: hue-rotate(15deg) brightness(1.1);
              transform: scale(1.02);
            }
          }
          
          @keyframes headerGlow {
            0%, 100% { 
              opacity: 0.4;
              transform: translateX(0%);
            }
            50% { 
              opacity: 0.8;
              transform: translateX(100%);
            }
          }
          
          @keyframes statusPulse {
            0%, 100% { 
              opacity: 1;
              transform: scale(1);
            }
            50% { 
              opacity: 0.6;
              transform: scale(0.8);
            }
          }
          
          @keyframes officeParticleFloat {
            0%, 100% { 
              opacity: 0.2;
              transform: translateY(0px) translateX(0px) scale(1);
            }
            25% {
              opacity: 0.8;
              transform: translateY(-20px) translateX(10px) scale(1.2);
            }
            50% {
              opacity: 0.5;
              transform: translateY(-40px) translateX(-5px) scale(0.8);
            }
            75% {
              opacity: 0.9;
              transform: translateY(-60px) translateX(15px) scale(1.1);
            }
          }
          
          @keyframes steamRise {
            0% { 
              opacity: 0;
              transform: translateY(0px) scale(1);
            }
            20% {
              opacity: 0.6;
              transform: translateY(-10px) scale(1.2);
            }
            80% {
              opacity: 0.3;
              transform: translateY(-30px) scale(0.8);
            }
            100% { 
              opacity: 0;
              transform: translateY(-50px) scale(0.5);
            }
          }
          
          @keyframes shadowShift {
            0% { 
              transform: translateX(-10px);
              opacity: 0.1;
            }
            25% {
              transform: translateX(5px);
              opacity: 0.05;
            }
            50% { 
              transform: translateX(10px);
              opacity: 0.08;
            }
            75% {
              transform: translateX(-5px);
              opacity: 0.03;
            }
            100% { 
              transform: translateX(-10px);
              opacity: 0.1;
            }
          }
          
          @keyframes gameHover {
            0%, 100% { 
              transform: translateY(0px) scale(1);
            }
            50% { 
              transform: translateY(-2px) scale(1.02);
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
          
          /* Proximity Chat Ripple Animations - Start from Avatar */
          @keyframes ripple-from-avatar-idle {
            0% { 
              transform: translate(-50%, -50%) scale(1); 
              opacity: 0.7; 
            }
            100% { 
              transform: translate(-50%, -50%) scale(10); 
              opacity: 0; 
            }
          }
          
          @keyframes ripple-from-avatar-active {
            0% { 
              transform: translate(-50%, -50%) scale(1); 
              opacity: 0.9; 
            }
            100% { 
              transform: translate(-50%, -50%) scale(10); 
              opacity: 0; 
            }
          }
          
          @keyframes ripple-blue-from-avatar-idle {
            0% { 
              transform: translate(-50%, -50%) scale(1); 
              opacity: 0.5; 
            }
            100% { 
              transform: translate(-50%, -50%) scale(10); 
              opacity: 0; 
            }
          }
          
          @keyframes ripple-blue-from-avatar-active {
            0% { 
              transform: translate(-50%, -50%) scale(1); 
              opacity: 0.7; 
            }
            100% { 
              transform: translate(-50%, -50%) scale(10); 
              opacity: 0; 
            }
          }
          
          @keyframes text-glow {
            0%, 100% { 
              color: #10b981; 
              text-shadow: 0 0 5px rgba(16, 185, 129, 0.3); 
            }
            50% { 
              color: #059669; 
              text-shadow: 0 0 10px rgba(16, 185, 129, 0.6); 
            }
                      }
          
          /* Movement Target Animation */
          @keyframes target-pulse {
            0% { 
              transform: translate(-50%, -50%) scale(0.5); 
              opacity: 0; 
            }
            20% { 
              transform: translate(-50%, -50%) scale(1.2); 
              opacity: 0.8; 
            }
            100% { 
              transform: translate(-50%, -50%) scale(1); 
              opacity: 0.3; 
            }
          }
          
          @media (max-width: 1024px) {
            .office-main-layout {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
            }
          }
          
          /* Enhanced Avatar Movement Effects */
          @keyframes energyPulse {
            0%, 100% {
              opacity: 0.3;
              transform: scale(1) rotate(0deg);
            }
            50% {
              opacity: 0.8;
              transform: scale(1.2) rotate(180deg);
            }
          }
          
          @keyframes movementBurst {
            0% {
              transform: translate(-50%, -50%) scale(0.8);
              opacity: 0.8;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
          }
          
          @keyframes burstParticle {
            0% {
              opacity: 1;
              transform: translate(-50%, -50%) rotate(0deg) translateX(0px) scale(1);
            }
            100% {
              opacity: 0;
              transform: translate(-50%, -50%) rotate(360deg) translateX(40px) scale(0.3);
            }
          }
          
          @keyframes ambientFloat {
            0%, 100% {
              opacity: 0.3;
              transform: translateY(0px) translateX(0px) rotate(0deg);
            }
            25% {
              opacity: 0.8;
              transform: translateY(-15px) translateX(10px) rotate(90deg);
            }
            50% {
              opacity: 0.5;
              transform: translateY(-25px) translateX(-5px) rotate(180deg);
            }
            75% {
              opacity: 0.9;
              transform: translateY(-10px) translateX(15px) rotate(270deg);
            }
          }
          
          /* Audio Visualizer Animations */
          @keyframes audioBar {
            0% {
              transform: translate(-50%, -50%) rotate(var(--rotation, 0deg)) translateX(var(--distance, 25px)) scaleY(0.3);
              opacity: 0.6;
            }
            100% {
              transform: translate(-50%, -50%) rotate(var(--rotation, 0deg)) translateX(var(--distance, 25px)) scaleY(1.2);
              opacity: 1;
            }
          }
          
          @keyframes myAudioBar {
            0% {
              transform: translate(-50%, -50%) rotate(var(--rotation, 0deg)) translateX(var(--distance, 30px)) scaleY(0.4);
              opacity: 0.7;
            }
            100% {
              transform: translate(-50%, -50%) rotate(var(--rotation, 0deg)) translateX(var(--distance, 30px)) scaleY(1.5);
              opacity: 1;
            }
          }
          
          @keyframes audioPulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.6;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 1;
            }
          }
          
          @keyframes myAudioPulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.8;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.3);
              opacity: 1;
            }
          }
          
          @keyframes videoBubble {
            0% {
              transform: translate(-50%, -50%) scale(1) rotate(0deg);
              opacity: 0.9;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.05) rotate(1deg);
              opacity: 1;
            }
          }
          
          @keyframes connectionPulse {
            0%, 100% {
              transform: scale(1);
              opacity: 1;
            }
            50% {
              transform: scale(1.3);
              opacity: 0.7;
            }
          }
          
          /* Chat Bubble and Cursor Animations */
          @keyframes chatBubbleAppear {
            0% {
              opacity: 0;
              transform: translate(-50%, -100%) scale(0.8) translateY(10px);
            }
            100% {
              opacity: 1;
              transform: translate(-50%, -100%) scale(1) translateY(0);
            }
          }
          
          @keyframes cursorAppear {
            0% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.5);
            }
            100% {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
          
          @keyframes cursorTrail {
            0% {
              transform: translate(-50%, -50%) scale(0.8);
              opacity: 0.6;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.4);
              opacity: 0;
            }
          }
          
          /* Weather Effects Animations */
          @keyframes rainDrop {
            0% {
              transform: translateY(-10px) rotate(15deg);
              opacity: 0;
            }
            10% {
              opacity: 1;
            }
            100% {
              transform: translateY(calc(100vh + 50px)) rotate(15deg);
              opacity: 0.3;
            }
          }
          
          @keyframes snowFall {
            0% {
              transform: translateY(-10px) translateX(0px);
              opacity: 0;
            }
            10% {
              opacity: 1;
            }
            50% {
              transform: translateY(50vh) translateX(20px);
              opacity: 0.8;
            }
            100% {
              transform: translateY(calc(100vh + 50px)) translateX(-10px);
              opacity: 0;
            }
          }
          
          @keyframes magicFloat {
            0%, 100% {
              transform: translateY(0px) scale(1) rotate(0deg);
              opacity: 0.3;
            }
            25% {
              transform: translateY(-20px) scale(1.2) rotate(90deg);
              opacity: 1;
            }
            50% {
              transform: translateY(-40px) scale(0.8) rotate(180deg);
              opacity: 0.7;
            }
            75% {
              transform: translateY(-20px) scale(1.1) rotate(270deg);
              opacity: 0.9;
            }
          }
          
          /* Interactive Element Animations */
          @keyframes interactiveGlow {
            0% {
              box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
              background: rgba(34, 197, 94, 0.2);
            }
            100% {
              box-shadow: 0 0 30px rgba(34, 197, 94, 0.8);
              background: rgba(34, 197, 94, 0.3);
            }
          }
          
          @keyframes sparkleOrbit {
            0% {
              transform: translate(-50%, -50%) rotate(0deg) translateX(25px) scale(0.5);
              opacity: 0;
            }
            50% {
              transform: translate(-50%, -50%) rotate(180deg) translateX(25px) scale(1);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) rotate(360deg) translateX(25px) scale(0.5);
              opacity: 0;
            }
          }
          
          /* Gaming UI Animations */
          @keyframes achievementSlide {
            0% {
              transform: translateX(100%);
              opacity: 0;
            }
            100% {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes minimapSlide {
            0% {
              transform: scale(0.8);
              opacity: 0;
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          
          @keyframes minimapPulse {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              box-shadow: 0 0 8px #10b981;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              box-shadow: 0 0 15px #10b981;
            }
          }
          
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  // Show office view when logged in
  return (
    <div 
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseMove={(e) => {
        if (typeof window !== 'undefined' && document?.documentElement) {
          try {
            const { clientX, clientY } = e;
            const { innerWidth, innerHeight } = window;
            const xPercent = Math.max(0, Math.min(100, (clientX / innerWidth) * 100));
            const yPercent = Math.max(0, Math.min(100, (clientY / innerHeight) * 100));
            
            document.documentElement.style.setProperty('--office-mouse-x', `${xPercent}%`);
            document.documentElement.style.setProperty('--office-mouse-y', `${yPercent}%`);
          } catch (error) {
            console.log('Office mouse tracking disabled:', error);
          }
        }
      }}
    >
      {/* Dynamic Day/Night Lighting Layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: isDayTime 
          ? `
            radial-gradient(circle at 30% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
            radial-gradient(circle at 90% 10%, rgba(34, 197, 94, 0.06) 0%, transparent 40%)
          `
          : `
            radial-gradient(circle at 30% 20%, rgba(30, 58, 138, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(67, 56, 202, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 90% 10%, rgba(5, 46, 22, 0.08) 0%, transparent 40%),
            linear-gradient(0deg, rgba(15, 23, 42, 0.3) 0%, transparent 100%)
          `,
        animation: 'ambientGlow 25s ease-in-out infinite alternate',
        pointerEvents: 'none',
        transition: 'background 2s ease-in-out'
      }}></div>

      {/* Weather Effects Layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4
      }}>
        {/* Rain Effect */}
        {weatherEffect === 'rain' && Array.from({ length: 30 }).map((_, i) => (
          <div
            key={`rain-${i}`}
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: '-5px',
              width: '2px',
              height: `${15 + Math.random() * 25}px`,
              background: 'linear-gradient(to bottom, rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.2))',
              borderRadius: '1px',
              animation: `rainDrop ${0.5 + Math.random() * 1}s linear infinite`,
              animationDelay: `${Math.random() * 2}s`,
              transform: 'rotate(15deg)'
            }}
          />
        ))}

        {/* Snow Effect */}
        {weatherEffect === 'snow' && Array.from({ length: 20 }).map((_, i) => (
          <div
            key={`snow-${i}`}
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: '-10px',
              width: `${4 + Math.random() * 6}px`,
              height: `${4 + Math.random() * 6}px`,
              background: 'rgba(255, 255, 255, 0.8)',
              borderRadius: '50%',
              animation: `snowFall ${3 + Math.random() * 4}s linear infinite`,
              animationDelay: `${Math.random() * 3}s`,
              boxShadow: '0 0 6px rgba(255, 255, 255, 0.6)'
            }}
          />
        ))}

        {/* Magic Particles Effect */}
        {weatherEffect === 'particles' && Array.from({ length: 15 }).map((_, i) => (
          <div
            key={`magic-${i}`}
            style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: '4px',
              height: '4px',
              background: `rgba(${Math.random() > 0.5 ? '255, 215, 0' : '255, 105, 180'}, 0.8)`,
              borderRadius: '50%',
              animation: `magicFloat ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
              boxShadow: '0 0 10px currentColor'
            }}
          />
        ))}
      </div>

      {/* Ambient Particles System */}
      {Array.from({ length: 20 }, (_, i) => (
        <div
          key={`office-particle-${i}`}
          style={{
            position: 'absolute',
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
            background: `rgba(255, 255, 255, ${0.1 + Math.random() * 0.3})`,
            borderRadius: '50%',
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animation: `officeParticleFloat ${8 + Math.random() * 12}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(255, 255, 255, 0.2)'
          }}
        />
      ))}

      {/* Coffee Steam Effects */}
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={`steam-${i}`}
          style={{
            position: 'absolute',
            width: '2px',
            height: '15px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            top: `${20 + i * 15}%`,
            left: `${15 + i * 25}%`,
            animation: `steamRise ${3 + Math.random() * 2}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
            pointerEvents: 'none',
            filter: 'blur(1px)'
          }}
        />
      ))}

      {/* Spatial Audio Visualizers */}
      {users.map((user) => {
        const isUserSpeaking = speakingUsers.has(user.socketId || user.id);
        const isUserInRange = usersInRange.includes(user.socketId || user.id);
        
        return (
          <div key={`audio-viz-${user.socketId || user.id}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {/* Voice Activity Indicator */}
            {user.voiceEnabled && isUserSpeaking && (
              <div
                style={{
                  position: 'absolute',
                  left: `${user.x}%`,
                  top: `${user.y}%`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 5
                }}
              >
                {/* Audio Visualizer Bars */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={`bar-${i}`}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: '3px',
                      height: `${8 + Math.random() * 16}px`,
                      background: 'linear-gradient(to top, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.9))',
                      borderRadius: '2px',
                      transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateX(${25 + i * 3}px)`,
                      animation: `audioBar ${0.3 + Math.random() * 0.4}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.05}s`,
                      boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
                    }}
                  />
                ))}
                
                {/* Central Audio Pulse */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, rgba(16, 185, 129, 0.2) 50%, transparent 100%)',
                    animation: 'audioPulse 0.6s ease-in-out infinite',
                    border: '2px solid rgba(16, 185, 129, 0.8)'
                  }}
                />
              </div>
            )}
            
            {/* Video Bubble (Simulated) */}
            {user.voiceEnabled && isUserInRange && (
              <div
                style={{
                  position: 'absolute',
                  left: `${user.x + 5}%`,
                  top: `${user.y - 8}%`,
                  transform: 'translate(-50%, -50%)',
                  width: '60px',
                  height: '45px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.9) 100%)',
                  border: '2px solid rgba(59, 130, 246, 0.6)',
                  boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  animation: 'videoBubble 2s ease-in-out infinite alternate'
                }}
              >
                {/* Video Placeholder */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '4px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: 'rgba(255, 255, 255, 0.8)'
                  }}
                >
                  🎥
                </div>
                
                {/* Video Connection Indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isUserSpeaking ? '#ef4444' : '#10b981',
                    boxShadow: `0 0 6px ${isUserSpeaking ? '#ef4444' : '#10b981'}`,
                    animation: 'connectionPulse 1s ease-in-out infinite'
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* My Audio Visualizer */}
      {isVoiceEnabled && (
        <div
          style={{
            position: 'absolute',
            left: `${me.x}%`,
            top: `${me.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 5
          }}
        >
          {/* Enhanced Audio Visualizer */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`my-bar-${i}`}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '2px',
                height: `${10 + Math.random() * 20}px`,
                background: 'linear-gradient(to top, rgba(102, 126, 234, 0.9), rgba(59, 130, 246, 1))',
                borderRadius: '2px',
                transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateX(${30 + i * 2}px)`,
                animation: `myAudioBar ${0.2 + Math.random() * 0.3}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.04}s`,
                boxShadow: '0 0 10px rgba(102, 126, 234, 0.8)'
              }}
            />
          ))}
          
          {/* Central Pulse */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '25px',
              height: '25px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(102, 126, 234, 0.8) 0%, rgba(102, 126, 234, 0.3) 50%, transparent 100%)',
              animation: 'myAudioPulse 0.5s ease-in-out infinite',
              border: '3px solid rgba(102, 126, 234, 0.9)'
            }}
          />
                 </div>
       )}

      {/* Chat Bubbles */}
      {chatBubbles.map((bubble) => {
        const user = users.find(u => u.socketId === bubble.userId) || (bubble.userId === me.id ? me : null);
        if (!user) return null;
        
        return (
          <div
            key={bubble.id}
            style={{
              position: 'absolute',
              left: `${bubble.x}%`,
              top: `${bubble.y - 10}%`,
              transform: 'translate(-50%, -100%)',
              maxWidth: '200px',
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '500',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
              animation: 'chatBubbleAppear 0.3s ease-out forwards',
              zIndex: 20,
              pointerEvents: 'none'
            }}
          >
            <div style={{ 
              marginBottom: '4px', 
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: '600'
            }}>
              {user.name}
            </div>
            <div>{bubble.message}</div>
            
            {/* Chat bubble tail */}
            <div
              style={{
                position: 'absolute',
                bottom: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '0',
                height: '0',
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid rgba(0, 0, 0, 0.9)'
              }}
            />
          </div>
        );
      })}

      {/* Presence Cursors */}
      {presenceCursors.map((cursor) => {
        const user = users.find(u => u.socketId === cursor.userId);
        if (!user || cursor.userId === me.id) return null;
        
        return (
          <div
            key={cursor.userId}
            style={{
              position: 'absolute',
              left: `${cursor.x}%`,
              top: `${cursor.y}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 15,
              animation: 'cursorAppear 0.3s ease-out forwards'
            }}
          >
            {/* Cursor */}
            <div
              style={{
                width: '20px',
                height: '20px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                borderRadius: '50% 50% 50% 0',
                transform: 'rotate(-45deg)',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                position: 'relative'
              }}
            >
              {/* Cursor trail */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '30px',
                  height: '30px',
                  background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  animation: 'cursorTrail 1s ease-out infinite'
                }}
              />
            </div>
            
            {/* User name tag */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: '4px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                border: '1px solid rgba(59, 130, 246, 0.5)'
              }}
            >
              {user.name}
            </div>
          </div>
        );
      })}

      {/* Time-based Dynamic Shadows */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          linear-gradient(120deg, 
            rgba(0, 0, 0, 0.1) 0%, 
            transparent 30%, 
            transparent 70%, 
            rgba(0, 0, 0, 0.05) 100%
          )
        `,
        animation: 'shadowShift 60s ease-in-out infinite',
        pointerEvents: 'none'
      }}></div>
      
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '20px',
        maxWidth: '1600px',
        margin: '0 auto'
      }}>
        {/* Gaming-Style Header */}
        <div style={{
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '20px',
          padding: '20px 30px',
          marginBottom: '25px',
          boxShadow: `
            0 20px 40px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Header Glow Effect */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1), rgba(34, 197, 94, 0.1))',
            opacity: 0.6,
            animation: 'headerGlow 8s ease-in-out infinite alternate'
          }}></div>
          
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2
          }}>
            {/* Logo and Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #ffffff 0%, #3b82f6 50%, #8b5cf6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: '0',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.5px'
              }}>
                🏢 Possum Office
              </h1>
              
              {/* Online Status */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(34, 197, 94, 0.2)',
                padding: '6px 12px',
                borderRadius: '20px',
                border: '1px solid rgba(34, 197, 94, 0.3)'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  background: '#22c55e',
                  borderRadius: '50%',
                  animation: 'statusPulse 2s ease-in-out infinite'
                }}></div>
                <span style={{
                  fontSize: '12px',
                  color: '#22c55e',
                  fontWeight: '600'
                }}>
                  {users.length + 1} Online
                </span>
              </div>
            </div>
            


            {/* Controls Panel */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px'
            }}>
              {/* Gaming-Style Voice Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '8px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <button
                  onClick={toggleVoice}
                  style={{
                    padding: '10px',
                    background: isVoiceEnabled 
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'rgba(107, 114, 128, 0.3)',
                    border: isVoiceEnabled 
                      ? '1px solid rgba(34, 197, 94, 0.5)'
                      : '1px solid rgba(107, 114, 128, 0.3)',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: isVoiceEnabled 
                      ? '0 0 15px rgba(34, 197, 94, 0.3)'
                      : 'none',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  title={isVoiceEnabled ? 'Disable Voice Chat [V]' : 'Enable Voice Chat [V]'}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = isVoiceEnabled 
                      ? '0 0 20px rgba(34, 197, 94, 0.5)'
                      : '0 0 15px rgba(107, 114, 128, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = isVoiceEnabled 
                      ? '0 0 15px rgba(34, 197, 94, 0.3)'
                      : 'none';
                  }}
                >
                  {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  {isVoiceEnabled && (
                    <div style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '6px',
                      height: '6px',
                      background: '#22c55e',
                      borderRadius: '50%',
                      animation: 'statusPulse 1.5s ease-in-out infinite'
                    }}></div>
                  )}
                </button>
                
                {isVoiceEnabled && (
                  <button
                    onClick={toggleMute}
                    style={{
                      padding: '10px',
                      background: isMuted 
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      border: isMuted 
                        ? '1px solid rgba(239, 68, 68, 0.5)'
                        : '1px solid rgba(59, 130, 246, 0.5)',
                      borderRadius: '10px',
                      color: 'white',
                      cursor: 'pointer',
                      boxShadow: isMuted 
                        ? '0 0 15px rgba(239, 68, 68, 0.3)'
                        : '0 0 15px rgba(59, 130, 246, 0.3)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={isMuted ? 'Unmute [SPACE]' : 'Mute [SPACE]'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = isMuted 
                        ? '0 0 20px rgba(239, 68, 68, 0.5)'
                        : '0 0 20px rgba(59, 130, 246, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = isMuted 
                        ? '0 0 15px rgba(239, 68, 68, 0.3)'
                        : '0 0 15px rgba(59, 130, 246, 0.3)';
                    }}
                  >
                    {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}

                {/* Camera Button */}
                <button
                  onClick={toggleCamera}
                  style={{
                    padding: '10px',
                    background: isCameraOn 
                      ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                      : 'rgba(107, 114, 128, 0.3)',
                    border: isCameraOn 
                      ? '1px solid rgba(245, 158, 11, 0.5)'
                      : '1px solid rgba(107, 114, 128, 0.3)',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: isCameraOn 
                      ? '0 0 15px rgba(245, 158, 11, 0.3)'
                      : 'none',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                  title={isCameraOn ? 'Turn Camera OFF [C]' : 'Turn Camera ON [C]'}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = isCameraOn 
                      ? '0 0 20px rgba(245, 158, 11, 0.5)'
                      : '0 0 15px rgba(107, 114, 128, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = isCameraOn 
                      ? '0 0 15px rgba(245, 158, 11, 0.3)'
                      : 'none';
                  }}
                >
                  <span style={{ fontSize: '16px' }}>
                    {isCameraOn ? '📷' : '📹'}
                  </span>
                  {isCameraOn && (
                    <div style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '6px',
                      height: '6px',
                      background: '#f59e0b',
                      borderRadius: '50%',
                      animation: 'statusPulse 1.5s ease-in-out infinite'
                    }}></div>
                  )}
                </button>

                {/* Video Share Button */}
                {isCameraOn && (
                  <button
                    onClick={toggleVideoSharing}
                    style={{
                      padding: '10px',
                      background: isSharingVideo 
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'rgba(107, 114, 128, 0.3)',
                      border: isSharingVideo 
                        ? '1px solid rgba(139, 92, 246, 0.5)'
                        : '1px solid rgba(107, 114, 128, 0.3)',
                      borderRadius: '10px',
                      color: 'white',
                      cursor: 'pointer',
                      boxShadow: isSharingVideo 
                        ? '0 0 15px rgba(139, 92, 246, 0.3)'
                        : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={isSharingVideo ? 'Stop Video Sharing [X]' : 'Share Video [X]'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = isSharingVideo 
                        ? '0 0 20px rgba(139, 92, 246, 0.5)'
                        : '0 0 15px rgba(107, 114, 128, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = isSharingVideo 
                        ? '0 0 15px rgba(139, 92, 246, 0.3)'
                        : 'none';
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>
                      {isSharingVideo ? '🔗' : '📤'}
                    </span>
                  </button>
                )}

                {/* Keyboard Hint */}
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontFamily: 'monospace',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  [V] [SPACE] [C] [X]
                </div>
              </div>
              {/* Gaming Status Selector */}
              <select 
                value={status} 
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  fontSize: '13px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  color: 'white',
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  fontWeight: '500'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.3)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.2)';
                }}
              >
                <option value="available" style={{ background: '#1a1a2e', color: 'white' }}>🟢 Available</option>
                <option value="busy" style={{ background: '#1a1a2e', color: 'white' }}>🔴 Busy</option>
                <option value="meeting" style={{ background: '#1a1a2e', color: 'white' }}>🟡 In Meeting</option>
                <option value="away" style={{ background: '#1a1a2e', color: 'white' }}>⚪ Away</option>
              </select>
              
              {/* Quick Settings */}
              <button
                onClick={() => alert('Settings coming soon! 🚀')}
                style={{
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Settings [S]"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ⚙️
              </button>
              
              {/* Gaming-style Leave Button */}
              <button
                onClick={handleLeaveOffice}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.8) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                title="Leave Office [ESC]"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 5px 25px rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 1) 0%, rgba(220, 38, 38, 1) 100%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.2)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.8) 100%)';
                }}
              >
                <span>🚪</span>
                <span>Leave</span>
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
          {/* Gaming-Style Office Map */}
          <div style={{
            background: 'rgba(10, 10, 15, 0.7)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '25px',
            boxShadow: `
              0 20px 40px rgba(0, 0, 0, 0.5),
              inset 0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            border: '1px solid rgba(59, 130, 246, 0.3)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Map Header with HUD styling */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #ffffff 0%, #3b82f6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  margin: 0,
                  letterSpacing: '-0.5px'
                }}>
                  🗺️ Office Map
                </h2>
                
                {/* Movement Mode Indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isMoving 
                    ? 'rgba(34, 197, 94, 0.2)' 
                    : 'rgba(59, 130, 246, 0.2)',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  border: `1px solid ${isMoving 
                    ? 'rgba(34, 197, 94, 0.3)' 
                    : 'rgba(59, 130, 246, 0.3)'}`,
                  fontSize: '11px',
                  color: isMoving ? '#22c55e' : '#3b82f6',
                  fontWeight: '600'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isMoving ? '#22c55e' : '#3b82f6',
                    animation: isMoving ? 'statusPulse 1s ease-in-out infinite' : 'none'
                  }}></div>
                  {isMoving ? 'MOVING' : 'READY'}
                </div>
              </div>
              
              {/* Mini Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.6)',
                fontFamily: 'monospace'
              }}>
                <span style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  [WASD] Move
                </span>
                <span style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  [CLICK] Teleport
                </span>
              </div>
            </div>
            
            {/* Enhanced Office Container */}
            <div 
              ref={officeRef}
              style={{
                position: 'relative',
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: isMoving ? 'wait' : 'crosshair',
                boxShadow: `
                  0 0 0 1px rgba(59, 130, 246, 0.3),
                  0 10px 30px rgba(0, 0, 0, 0.3),
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: 'perspective(1000px) rotateX(2deg)',
                background: 'linear-gradient(145deg, rgba(0, 0, 0, 0.1), rgba(59, 130, 246, 0.05))'
              }}
              onClick={handleOfficeClick}
              onMouseMove={handleOfficeMouseMove}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) translateY(-3px)';
                e.currentTarget.style.boxShadow = `
                  0 0 0 1px rgba(59, 130, 246, 0.5),
                  0 20px 50px rgba(59, 130, 246, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.2)
                `;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'perspective(1000px) rotateX(2deg) translateY(0)';
                e.currentTarget.style.boxShadow = `
                  0 0 0 1px rgba(59, 130, 246, 0.3),
                  0 10px 30px rgba(0, 0, 0, 0.3),
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `;
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
              
              {/* Gaming-Style Room Boundaries */}
              <div style={{
                position: 'absolute',
                left: '33.33%',
                top: '0',
                width: '1px',
                height: '100%',
                background: 'linear-gradient(to bottom, transparent 0%, rgba(59, 130, 246, 0.6) 20%, rgba(59, 130, 246, 0.6) 80%, transparent 100%)',
                zIndex: 1,
                pointerEvents: 'none',
                boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)'
              }} />
              <div style={{
                position: 'absolute',
                left: '66.66%',
                top: '0',
                width: '1px',
                height: '100%',
                background: 'linear-gradient(to bottom, transparent 0%, rgba(59, 130, 246, 0.6) 20%, rgba(59, 130, 246, 0.6) 80%, transparent 100%)',
                zIndex: 1,
                pointerEvents: 'none',
                boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)'
              }} />
              
              {/* Futuristic Room Labels */}
              <div style={{
                position: 'absolute',
                left: '16.66%',
                top: '12px',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                color: '#22c55e',
                padding: '6px 12px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700',
                fontFamily: 'monospace',
                zIndex: 2,
                pointerEvents: 'none',
                boxShadow: '0 0 15px rgba(34, 197, 94, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                🏢 Workspace Alpha
              </div>
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '12px',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                color: '#3b82f6',
                padding: '6px 12px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700',
                fontFamily: 'monospace',
                zIndex: 2,
                pointerEvents: 'none',
                boxShadow: '0 0 15px rgba(59, 130, 246, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                💬 Lounge Beta
              </div>
              <div style={{
                position: 'absolute',
                left: '83.33%',
                top: '12px',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(139, 92, 246, 0.5)',
                color: '#8b5cf6',
                padding: '6px 12px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700',
                fontFamily: 'monospace',
                zIndex: 2,
                pointerEvents: 'none',
                boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                🔬 Innovation Lab
              </div>

              {/* Interactive Elements */}
              {interactiveElements.map((element) => (
                <div
                  key={element.id}
                  style={{
                    position: 'absolute',
                    left: `${element.x}%`,
                    top: `${element.y}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    zIndex: 8,
                    fontSize: '24px',
                    padding: '8px',
                    borderRadius: '12px',
                    background: element.isActive 
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    border: element.isActive
                      ? '2px solid rgba(34, 197, 94, 0.6)'
                      : '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: element.isActive
                      ? '0 0 20px rgba(34, 197, 94, 0.4)'
                      : '0 4px 15px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: element.isActive ? 'interactiveGlow 1s ease-in-out infinite alternate' : 'none'
                  }}
                  onClick={() => handleElementInteraction(element.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
                    e.currentTarget.style.boxShadow = element.isActive
                      ? '0 0 25px rgba(34, 197, 94, 0.6)'
                      : '0 8px 25px rgba(0, 0, 0, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                    e.currentTarget.style.boxShadow = element.isActive
                      ? '0 0 20px rgba(34, 197, 94, 0.4)'
                      : '0 4px 15px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  {element.type === 'plant' && '🌱'}
                  {element.type === 'coffee' && '☕'}
                  {element.type === 'lamp' && '💡'}
                  {element.type === 'window' && '🪟'}
                  
                  {/* Interaction sparkles */}
                  {element.isActive && (
                    <>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={`sparkle-${i}`}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            fontSize: '12px',
                            transform: `translate(-50%, -50%) rotate(${i * 60}deg) translateX(25px)`,
                            animation: `sparkleOrbit ${1 + i * 0.1}s ease-in-out infinite`,
                            pointerEvents: 'none'
                          }}
                        >
                          ✨
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}

              {/* Environmental Status Indicator */}
              <div
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  background: 'rgba(0, 0, 0, 0.8)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  zIndex: 10
                }}
              >
                <span>{isDayTime ? '☀️' : '🌙'}</span>
                <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>
                  {weatherEffect === 'rain' && '🌧️'}
                  {weatherEffect === 'snow' && '❄️'}
                  {weatherEffect === 'particles' && '✨'}
                  {weatherEffect === 'clear' && '☀️'}
                </span>
              </div>

              {/* Render my avatar */}
              <Avatar
                id={me.id}
                name={me.name}
                x={me.x}
                y={me.y}
                status={me.status}
                avatarSeed={me.avatarSeed}
                isMe={true}
                isMoving={isMoving}
                isInVoiceRange={usersInRange.length > 0}
                isSpeaking={false}
                voiceEnabled={isVoiceEnabled}
                isMuted={isMuted}
              />

              {/* Render other users */}
              {users.map((user) => (
                <div key={user.socketId || user.id}>
                  {/* Other user's voice proximity indicator */}
                  {user.voiceEnabled && (
                    <div style={{
                      position: 'absolute',
                      left: `${user.x}%`,
                      top: `${user.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: `${proximityThreshold * 0.6}%`,
                      aspectRatio: '1',
                      pointerEvents: 'none',
                      zIndex: 0
                    }}>

                      
                      {/* Ripple for other users - starts from avatar */}
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '10%',
                        height: '10%',
                        borderRadius: '50%',
                        border: 'none',
                        animation: usersInRange.includes(user.socketId || user.id)
                          ? 'ripple-blue-from-avatar-active 1.2s ease-out infinite'
                          : 'ripple-blue-from-avatar-idle 2.5s ease-out infinite'
                      }} />
                    </div>
                  )}
                  
                  <Avatar
                    id={user.id}
                    name={user.name}
                    x={user.x}
                    y={user.y}
                    status={user.status}
                    avatarSeed={user.avatarSeed}
                    isMe={false}
                    isMoving={false}
                    isInVoiceRange={usersInRange.includes(user.socketId || user.id)}
                    isSpeaking={speakingUsers.has(user.socketId || user.id)}
                    voiceEnabled={user.voiceEnabled || false}
                    isMuted={false}
                  />
                </div>
              ))}

              {/* Voice proximity indicator */}
              {isVoiceEnabled && (
                <div style={{
                  position: 'absolute',
                  left: `${me.x}%`,
                  top: `${me.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: `${proximityThreshold * 0.6}%`,
                  aspectRatio: '1',
                  pointerEvents: 'none',
                  zIndex: 1
                }}>

                  
                  {/* Expanding ripple circles - start from avatar and expand outward */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '10%',
                    height: '10%',
                    borderRadius: '50%',
                    border: 'none',
                    animation: usersInRange.length > 0 
                      ? 'ripple-from-avatar-active 1.2s ease-out infinite' 
                      : 'ripple-from-avatar-idle 2.5s ease-out infinite'
                  }} />
                  
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '10%',
                    height: '10%',
                    borderRadius: '50%',
                    border: 'none',
                    animation: usersInRange.length > 0 
                      ? 'ripple-from-avatar-active 1.2s ease-out infinite 0.4s' 
                      : 'ripple-from-avatar-idle 2.5s ease-out infinite 0.8s'
                  }} />
                  
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '10%',
                    height: '10%',
                    borderRadius: '50%',
                    border: 'none',
                    animation: usersInRange.length > 0 
                      ? 'ripple-from-avatar-active 1.2s ease-out infinite 0.8s' 
                      : 'ripple-from-avatar-idle 2.5s ease-out infinite 1.6s'
                  }} />
                  

                </div>
              )}


            </div>
            {/* Gaming HUD Info Panel */}
            <div style={{
              marginTop: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(15px)',
              borderRadius: '12px',
              padding: '15px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px'
            }}>
              {/* Movement Info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isMoving ? '#22c55e' : '#3b82f6',
                  animation: isMoving ? 'statusPulse 1s ease-in-out infinite' : 'none'
                }}></div>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  {isMoving ? '🚀 TELEPORTING...' : '🎮 READY TO MOVE'}
                </span>
              </div>
              
              {/* Voice Status */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isVoiceEnabled ? '#22c55e' : '#6b7280',
                  animation: isVoiceEnabled ? 'statusPulse 1s ease-in-out infinite' : 'none'
                }}></div>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  {isVoiceEnabled 
                    ? `🎤 VOICE ACTIVE - ${usersInCurrentRoom.length} NEARBY`
                    : '🔇 VOICE DISABLED'
                  }
                </span>
              </div>
              
              {/* Current Zone */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: currentRoom === 1 ? '#22c55e' : currentRoom === 2 ? '#3b82f6' : '#8b5cf6'
              }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: currentRoom === 1 ? '#22c55e' : currentRoom === 2 ? '#3b82f6' : '#8b5cf6',
                  animation: 'statusPulse 2s ease-in-out infinite'
                }}></div>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  📍 ZONE: {currentRoom === 1 ? 'WORKSPACE ALPHA' : currentRoom === 2 ? 'LOUNGE BETA' : 'INNOVATION LAB'}
                </span>
              </div>
            </div>
            
            {/* Quick Tips */}
            <div style={{
              marginTop: '12px',
              display: 'flex',
              justifyContent: 'center',
              gap: '15px',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'monospace'
            }}>
              <span style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                💡 TIP: Use WASD for smooth movement
              </span>
              <span style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                🎯 TIP: Click to teleport instantly
              </span>
              <span style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                🗣️ TIP: Move between zones for spatial audio
              </span>
            </div>



            {/* Video Preview / Huddle Area */}
            <div style={{
              marginTop: '20px',
              width: '100%',
              height: '500px',
              background: isCameraOn 
                ? 'rgba(0, 0, 0, 0.9)' 
                : 'linear-gradient(135deg, rgba(107, 114, 128, 0.3) 0%, rgba(75, 85, 99, 0.3) 100%)',
              borderRadius: '24px',
              border: isCameraOn 
                ? '2px solid rgba(245, 158, 11, 0.5)' 
                : '2px dashed rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)'
            }}>
              {!isCameraOn ? (
                <div style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.6)'
                }}>
                  <div style={{ fontSize: '72px', marginBottom: '16px' }}>📷</div>
                  <div style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Camera Off</div>
                  <div style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.4)' }}>Turn on camera to see preview</div>
                </div>
              ) : isInVideoHuddle ? (
                // Video Huddle Layout - Side by Side
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                  width: '100%',
                  height: '100%',
                  padding: '20px'
                }}>
                  {/* Local Video */}
                  <div style={{
                    position: 'relative',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '2px solid rgba(34, 197, 94, 0.5)'
                  }}>
                    <video
                      ref={(ref) => {
                        setVideoPreviewRef(ref);
                        if (ref && localVideoStream) {
                          ref.srcObject = localVideoStream;
                        }
                      }}
                      autoPlay
                      muted
                      playsInline
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)' // Mirror effect for preview
                      }}
                    />
                    
                    {/* Your Video Label */}
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      background: 'rgba(0, 0, 0, 0.8)',
                      backdropFilter: 'blur(10px)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      You
                    </div>
                  </div>

                  {/* Remote Video */}
                  <div style={{
                    position: 'relative',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: 'rgba(0, 0, 0, 0.8)',
                    border: '2px solid rgba(139, 92, 246, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {remoteVideoStream ? (
                      <video
                        id="remote-video"
                        ref={(ref) => {
                          setRemoteVideoRef(ref);
                          if (ref && remoteVideoStream) {
                            ref.srcObject = remoteVideoStream;
                          }
                        }}
                        autoPlay
                        playsInline
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.6)'
                      }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔄</div>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>Connecting...</div>
                      </div>
                    )}
                    
                    {/* Partner Video Label */}
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      background: 'rgba(0, 0, 0, 0.8)',
                      backdropFilter: 'blur(10px)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {videoHuddlePartnerName || 'Partner'}
                    </div>
                  </div>

                  {/* End Huddle Button */}
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    zIndex: 10
                  }}>
                    <button
                      onClick={endVideoHuddle}
                      style={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 6px 24px rgba(239, 68, 68, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';
                      }}
                    >
                      🔚 End Huddle
                    </button>
                  </div>
                </div>
              ) : (
                // Single Video Preview
                <>
                  <video
                    ref={(ref) => {
                      setVideoPreviewRef(ref);
                      if (ref && localVideoStream) {
                        ref.srcObject = localVideoStream;
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '22px',
                      transform: 'scaleX(-1)' // Mirror effect for preview
                    }}
                  />
                  
                  {/* Status Overlay */}
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(10px)',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: isSharingVideo ? '#8b5cf6' : '#f59e0b',
                      animation: 'status-pulse 2s infinite'
                    }}></div>
                    {isSharingVideo ? 'SHARING' : 'PRIVATE'}
                  </div>

                  {/* Recording Indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'rgba(239, 68, 68, 0.9)',
                    backdropFilter: 'blur(10px)',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    animation: 'badge-pulse 1s infinite'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'white',
                      animation: 'statusPulse 1s infinite'
                    }}></div>
                    LIVE
                  </div>
                </>
              )}
            </div>

            {/* Status Display */}
            {videoError && (
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '16px',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: '500',
                textAlign: 'center'
              }}>
                ⚠️ {videoError}
              </div>
            )}

            {/* Video Invitation Notification */}
            {videoInvitation && (
              <div style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 50%, rgba(51, 65, 85, 0.98) 100%)',
                borderRadius: '24px',
                padding: '24px',
                boxShadow: '0 32px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                zIndex: 1000,
                animation: 'slideInRight 0.3s ease-out',
                maxWidth: '320px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    animation: 'pulse 2s infinite'
                  }}>
                    🎥
                  </div>
                  <div>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: 'white',
                      margin: 0,
                      marginBottom: '4px'
                    }}>
                      Video Huddle Invitation
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      margin: 0
                    }}>
                      {videoInvitation.fromName} wants to start a video huddle
                    </p>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <button
                    onClick={() => acceptVideoHuddle(videoInvitation.from, videoInvitation.fromName)}
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 24px rgba(34, 197, 94, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    ✅ Accept
                  </button>
                  <button
                    onClick={() => rejectVideoHuddle(videoInvitation.from)}
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 24px rgba(239, 68, 68, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.4)';
                    }}
                  >
                    ❌ Decline
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '30px'
          }}>
            {/* Team Members - SPECTACULAR DESIGN */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(51, 65, 85, 0.95) 100%)',
              borderRadius: '32px',
              padding: '32px',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              animation: 'gentle-float 7s ease-in-out infinite',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Animated Aurora Background */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'linear-gradient(45deg, rgba(147, 51, 234, 0.05) 0%, rgba(79, 70, 229, 0.05) 25%, rgba(59, 130, 246, 0.05) 50%, rgba(16, 185, 129, 0.05) 75%, rgba(236, 72, 153, 0.05) 100%)',
                animation: 'aurora-drift 15s linear infinite',
                zIndex: -1
              }}></div>
              
              {/* Floating Particles */}
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                width: '4px',
                height: '4px',
                background: 'rgba(147, 51, 234, 0.6)',
                borderRadius: '50%',
                animation: 'float-particle 4s ease-in-out infinite'
              }}></div>
              <div style={{
                position: 'absolute',
                top: '60px',
                right: '40px',
                width: '3px',
                height: '3px',
                background: 'rgba(79, 70, 229, 0.4)',
                borderRadius: '50%',
                animation: 'float-particle 6s ease-in-out infinite reverse'
              }}></div>
              
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  boxShadow: '0 12px 40px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  animation: 'icon-glow 3s ease-in-out infinite',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  👥
                </div>
                <div>
                  <h2 style={{
                    fontSize: '26px',
                    fontWeight: '800',
                    color: 'white',
                    margin: 0,
                    textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    letterSpacing: '0.02em',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}>
                    Team Members
                  </h2>
                  <div style={{
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '2px'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      animation: 'status-pulse 2s infinite'
                    }}></div>
                    {users.length + 1} members online
                  </div>
                </div>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                height: '400px', // Fixed height instead of maxHeight
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
                paddingRight: '8px' // Space for scrollbar
              }}>
                {/* Current User - Premium Design */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.15) 50%, rgba(6, 95, 70, 0.1) 100%)',
                  borderRadius: '24px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  position: 'relative',
                  boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  overflow: 'hidden'
                }}>
                  {/* Animated background shine */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '-100%',
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                    animation: 'shine 4s infinite'
                  }}></div>
                  
                  <div style={{ position: 'relative' }}>
                    <Image
                      src={`https://api.dicebear.com/7.x/${me.avatarSeed?.split('-')[0].toLowerCase()}/svg?seed=${me.avatarSeed?.split('-')[1]}`}
                      alt={me.name}
                      width={48}
                      height={48}
                      style={{ 
                        width: '48px', 
                        height: '48px',
                        borderRadius: '16px',
                        border: '2px solid rgba(16, 185, 129, 0.5)',
                        background: 'white',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
                      }}
                      unoptimized
                    />
                    {isVoiceEnabled && (
                      <div style={{
                        position: 'absolute',
                        bottom: '-4px',
                        right: '-4px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: '3px solid white',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                        animation: 'mic-pulse 2s infinite'
                      }}>
                        {isMuted ? '🔇' : '🎤'}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }}>
                      {me.name}
                      <span style={{
                        fontSize: '12px',
                        background: 'rgba(16, 185, 129, 0.3)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontWeight: '600',
                        border: '1px solid rgba(16, 185, 129, 0.4)'
                      }}>
                        YOU
                      </span>
                      {isVoiceEnabled && usersInRange.length > 0 && (
                        <span style={{
                          fontSize: '10px',
                          background: 'rgba(245, 158, 11, 0.9)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontWeight: '600'
                        }}>
                          {usersInRange.length} nearby
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.8)',
                      textTransform: 'capitalize',
                      fontWeight: '500'
                    }}>
                      {me.status}
                    </div>
                  </div>
                </div>
                {/* Other Users - Spectacular Design */}
                {users.map((user) => {
                  const isUserSpeaking = speakingUsers.has(user.socketId || user.id);
                  const isUserInRange = usersInRange.includes(user.socketId || user.id);
                  
                  return (
                    <div 
                      key={user.socketId || user.id} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '20px',
                        background: isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.15) 50%, rgba(180, 83, 9, 0.1) 100%)'
                          : 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '24px',
                        border: isUserSpeaking 
                          ? '1px solid rgba(245, 158, 11, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: isUserSpeaking 
                          ? '0 8px 32px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.2) 50%, rgba(180, 83, 9, 0.15) 100%)'
                          : 'rgba(255, 255, 255, 0.15)';
                        e.currentTarget.style.transform = 'translateX(8px) scale(1.02)';
                        e.currentTarget.style.boxShadow = isUserSpeaking 
                          ? '0 12px 48px rgba(245, 158, 11, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          : '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isUserSpeaking 
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.15) 50%, rgba(180, 83, 9, 0.1) 100%)'
                          : 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.transform = 'translateX(0) scale(1)';
                        e.currentTarget.style.boxShadow = isUserSpeaking 
                          ? '0 8px 32px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                      }}
                    >
                      {/* Animated background for speaking users */}
                      {isUserSpeaking && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: '-100%',
                          width: '100%',
                          height: '100%',
                          background: 'linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.1), transparent)',
                          animation: 'shine 2s infinite'
                        }}></div>
                      )}
                      
                      <div style={{ position: 'relative' }}>
                        <Image
                          src={user.avatarSeed ? 
                            `https://api.dicebear.com/7.x/${user.avatarSeed.split('-')[0].toLowerCase()}/svg?seed=${user.avatarSeed.split('-')[1]}` :
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                          }
                          alt={user.name}
                          width={48}
                          height={48}
                          style={{ 
                            width: '48px', 
                            height: '48px',
                            borderRadius: '16px',
                            border: isUserSpeaking 
                              ? '2px solid rgba(245, 158, 11, 0.6)'
                              : '2px solid rgba(255, 255, 255, 0.2)',
                            background: 'white',
                            boxShadow: isUserSpeaking 
                              ? '0 4px 16px rgba(245, 158, 11, 0.3), 0 0 20px rgba(245, 158, 11, 0.2)'
                              : '0 4px 16px rgba(0, 0, 0, 0.1)',
                            animation: isUserSpeaking ? 'avatar-pulse 1s infinite' : 'none'
                          }}
                          unoptimized
                        />
                        {user.voiceEnabled && (
                          <div style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: isUserSpeaking 
                              ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                              : 'linear-gradient(135deg, #10b981, #059669)',
                            border: '3px solid white',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            boxShadow: isUserSpeaking 
                              ? '0 2px 8px rgba(245, 158, 11, 0.4)'
                              : '0 2px 8px rgba(16, 185, 129, 0.4)',
                            animation: isUserSpeaking ? 'mic-pulse 1s infinite' : 'none'
                          }}>
                            🎤
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '4px',
                          textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}>
                          {user.name}
                          {isUserInRange && (
                            <span style={{
                              fontSize: '10px',
                              background: 'rgba(16, 185, 129, 0.9)',
                              color: 'white',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontWeight: '600',
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                            }}>
                              NEARBY
                            </span>
                          )}
                          {isUserSpeaking && (
                            <span style={{
                              fontSize: '10px',
                              background: 'rgba(245, 158, 11, 0.9)',
                              color: 'white',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontWeight: '600',
                              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                              animation: 'badge-pulse 1s infinite'
                            }}>
                              🎙️ SPEAKING
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '13px',
                          color: 'rgba(255, 255, 255, 0.7)',
                          textTransform: 'capitalize',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {user.status}
                          {isCameraOn && !isInVideoHuddle && (
                            <button
                              onClick={() => inviteToVideoHuddle(user.socketId || user.id, user.name)}
                              style={{
                                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '4px 8px',
                                fontSize: '10px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.05)';
                                e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.5)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                              }}
                            >
                              🎥 Invite
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Office Activity Overview - SPECTACULAR DESIGN */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(51, 65, 85, 0.95) 100%)',
              borderRadius: '32px',
              padding: '32px',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              animation: 'gentle-float 8s ease-in-out infinite',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Animated Neural Network Background */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'linear-gradient(45deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 25%, rgba(236, 72, 153, 0.05) 50%, rgba(239, 68, 68, 0.05) 75%, rgba(245, 158, 11, 0.05) 100%)',
                animation: 'neural-drift 12s linear infinite',
                zIndex: -1
              }}></div>
              
              {/* Floating Activity Indicators */}
              <div style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                width: '6px',
                height: '6px',
                background: 'rgba(59, 130, 246, 0.7)',
                borderRadius: '50%',
                animation: 'float-particle 3s ease-in-out infinite'
              }}></div>
              <div style={{
                position: 'absolute',
                top: '50px',
                right: '50px',
                width: '4px',
                height: '4px',
                background: 'rgba(147, 51, 234, 0.5)',
                borderRadius: '50%',
                animation: 'float-particle 5s ease-in-out infinite reverse'
              }}></div>
              
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  boxShadow: '0 12px 40px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  animation: 'icon-glow 4s ease-in-out infinite',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  🏢
                </div>
                <div>
                  <h2 style={{
                    fontSize: '26px',
                    fontWeight: '800',
                    color: 'white',
                    margin: 0,
                    textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    letterSpacing: '0.02em',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}>
                    Office Activity
                  </h2>
                  <div style={{
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '2px'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6, #9333ea)',
                      animation: 'status-pulse 2s infinite'
                    }}></div>
                    Real-time updates
                  </div>
                </div>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                height: '300px', // Fixed height instead of maxHeight
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
                paddingRight: '8px' // Space for scrollbar
              }}>
                {activities.length === 0 ? (
                  <div style={{
                    fontSize: '15px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    fontStyle: 'italic',
                    padding: '32px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    borderRadius: '24px',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '48px',
                      opacity: 0.1,
                      zIndex: -1
                    }}>
                      🌟
                    </div>
                    <div style={{
                      fontSize: '18px',
                      marginBottom: '8px',
                      fontWeight: '600'
                    }}>
                      🌟 Peaceful Workspace
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.5)'
                    }}>
                      No recent activity to display
                    </div>
                  </div>
                ) : (
                  activities.slice().reverse().map((activity, idx) => (
                    <div
                      key={`${activity.timestamp.getTime()}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '20px',
                        background: activity.type === 'join' 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 50%, rgba(6, 95, 70, 0.05) 100%)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.1) 50%, rgba(127, 29, 29, 0.05) 100%)',
                        borderRadius: '20px',
                        border: activity.type === 'join'
                          ? '1px solid rgba(16, 185, 129, 0.25)'
                          : '1px solid rgba(239, 68, 68, 0.25)',
                        animation: 'activity-appear 0.5s ease-out',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: activity.type === 'join'
                          ? '0 4px 20px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : '0 4px 20px rgba(239, 68, 68, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateX(8px) scale(1.02)';
                        e.currentTarget.style.boxShadow = activity.type === 'join'
                          ? '0 8px 32px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                          : '0 8px 32px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateX(0) scale(1)';
                        e.currentTarget.style.boxShadow = activity.type === 'join'
                          ? '0 4px 20px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : '0 4px 20px rgba(239, 68, 68, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                      }}
                    >
                      {/* Activity type indicator */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '16px',
                        background: activity.type === 'join' 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(5, 150, 105, 0.2) 100%)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(185, 28, 28, 0.2) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        border: activity.type === 'join'
                          ? '1px solid rgba(16, 185, 129, 0.3)'
                          : '1px solid rgba(239, 68, 68, 0.3)',
                        boxShadow: activity.type === 'join'
                          ? '0 4px 16px rgba(16, 185, 129, 0.2)'
                          : '0 4px 16px rgba(239, 68, 68, 0.2)'
                      }}>
                        {activity.type === 'join' ? '🚪➡️' : '🚪⬅️'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '15px',
                          fontWeight: '700',
                          color: 'white',
                          marginBottom: '4px',
                          textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}>
                          {activity.message}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: 'rgba(255, 255, 255, 0.6)',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <div style={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.4)'
                          }}></div>
                          {activity.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Global Chat - SPECTACULAR DESIGN */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(51, 65, 85, 0.95) 100%)',
              borderRadius: '32px',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Animated Communication Waves Background */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: 'linear-gradient(45deg, rgba(236, 72, 153, 0.05) 0%, rgba(147, 51, 234, 0.05) 25%, rgba(59, 130, 246, 0.05) 50%, rgba(16, 185, 129, 0.05) 75%, rgba(245, 158, 11, 0.05) 100%)',
                animation: 'communication-waves 10s linear infinite',
                zIndex: -1
              }}></div>
              
              {/* Chat Header Enhancement */}
              <div style={{
                padding: '24px 32px 0',
                marginBottom: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #9333ea 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    boxShadow: '0 12px 40px rgba(236, 72, 153, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    animation: 'icon-glow 5s ease-in-out infinite',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    💬
                  </div>
                  <div>
                    <h2 style={{
                      fontSize: '26px',
                      fontWeight: '800',
                      color: 'white',
                      margin: 0,
                      textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      letterSpacing: '0.02em',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}>
                      Team Chat
                    </h2>
                    <div style={{
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '2px'
                    }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ec4899, #9333ea)',
                        animation: 'status-pulse 2s infinite'
                      }}></div>
                      Connected & secure
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Chat Component with Enhanced Container */}
              <div style={{
                position: 'relative',
                zIndex: 1
              }}>
                <Chat
                  socket={socket}
                  currentUserId={socket?.id || me.id}
                  currentUserName={me.name}
                  onMessageSent={handleChatBubble}
                />
              </div>
            </div>
          </div>
        </div>



      </div>
    </div>
  );
}