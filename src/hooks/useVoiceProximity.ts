import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';

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

interface VoiceConnection {
  userId: string;
  peerConnection: RTCPeerConnection;
  audioElement: HTMLAudioElement;
  stream?: MediaStream;
  distance: number;
  cleanupSpeakingDetection?: () => void;
}

interface VoiceProximityOptions {
  socket: Socket | null;
  currentUser: User;
  users: User[];
  proximityThreshold?: number; // Distance threshold for voice activation
  maxDistance?: number; // Maximum distance for audio (volume = 0)
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceProximity({
  socket,
  currentUser,
  users,
  proximityThreshold = 25, // 25% of office space
  maxDistance = 50 // 50% of office space
}: VoiceProximityOptions) {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceConnections, setVoiceConnections] = useState<Map<string, VoiceConnection>>(new Map());
  const [usersInRange, setUsersInRange] = useState<string[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const lastVolumeUpdateRef = useRef<Map<string, number>>(new Map());

  // Calculate distance between two users
  const calculateDistance = useCallback((user1: User, user2: User): number => {
    const dx = user1.x - user2.x;
    const dy = user1.y - user2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculate volume based on distance
  const calculateVolume = useCallback((distance: number): number => {
    if (distance <= proximityThreshold) return 1;
    if (distance >= maxDistance) return 0;
    
    // Linear falloff from proximityThreshold to maxDistance
    const falloffRange = maxDistance - proximityThreshold;
    const falloffDistance = distance - proximityThreshold;
    return 1 - (falloffDistance / falloffRange);
  }, [proximityThreshold, maxDistance]);

  // Get microphone access
  const getMicrophoneAccess = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });
      
      console.log('Microphone access granted');
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return null;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((targetUserId: string): RTCPeerConnection => {
    const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    // Add local stream if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming stream
    peerConnection.ontrack = async (event) => {
      console.log('Received remote stream from:', targetUserId);
      const remoteStream = event.streams[0];
      
      // Create audio element
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      audioElement.autoplay = true;
      audioElement.volume = 1; // Will be controlled by Web Audio API
      
      // Ensure audio can play
      try {
        await audioElement.play();
        console.log('Audio element playing for user:', targetUserId);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
      
      // Try to set up Web Audio API for volume control, with fallback to direct audio element volume
      let useWebAudio = true;
      let source: MediaStreamAudioSourceNode | null = null;
      
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // Resume audio context if suspended
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        // Check if context is still valid
        if (audioContextRef.current.state === 'closed') {
          console.warn('AudioContext is closed, using direct audio element volume control');
          useWebAudio = false;
        } else {
          source = audioContextRef.current.createMediaStreamSource(remoteStream);
          const gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = 0; // Start with 0 volume, will be updated by proximity
          
          source.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          
          gainNodesRef.current.set(targetUserId, gainNode);
        }
      } catch (error) {
        console.warn('Web Audio API failed, using direct audio element volume control:', error);
        useWebAudio = false;
      }
      
      // Fallback to direct audio element volume control
      if (!useWebAudio) {
        audioElement.volume = 0; // Start with 0 volume, will be updated by proximity
      }
      
      // Update connection with audio element
      setVoiceConnections(prev => {
        const updated = new Map(prev);
        const connection = updated.get(targetUserId);
        if (connection) {
          connection.audioElement = audioElement;
          connection.stream = remoteStream;
        }
        return updated;
      });

      // Detect speaking (only if Web Audio API is available)
      if (useWebAudio && audioContextRef.current && source) {
        const analyser = audioContextRef.current.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      let lastSpeakingState = false;
      let animationFrameId: number;
      
      const detectSpeaking = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const isSpeaking = average > 10; // Threshold for speaking detection
        
        // Only update state if speaking status changed
        if (isSpeaking !== lastSpeakingState) {
          lastSpeakingState = isSpeaking;
          setSpeakingUsers(prev => {
            const newSet = new Set(prev);
            if (isSpeaking) {
              newSet.add(targetUserId);
            } else {
              newSet.delete(targetUserId);
            }
            return newSet;
          });
        }
        
        animationFrameId = requestAnimationFrame(detectSpeaking);
      };
      
      detectSpeaking();
      
      // Store cleanup function for this connection
      const connection = voiceConnections.get(targetUserId);
      if (connection) {
        connection.cleanupSpeakingDetection = () => {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
        };
      }
      } // Close the if (useWebAudio && audioContextRef.current && source) block
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('Sending ICE candidate to:', targetUserId);
        socket.emit('voice:ice-candidate', {
          to: targetUserId,
          candidate: event.candidate
        });
      }
    };

    // Monitor connection state
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state changed for', targetUserId, ':', peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state changed for', targetUserId, ':', peerConnection.iceConnectionState);
    };

    return peerConnection;
  }, [socket]);

  // Start voice connection with a user
  const startVoiceConnection = useCallback(async (targetUserId: string) => {
    if (!socket || !localStreamRef.current) {
      console.error('Cannot start voice connection - socket or localStream not available');
      return;
    }

    console.log('Starting voice connection with:', targetUserId);
    
    try {
      const peerConnection = createPeerConnection(targetUserId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      console.log('Sending voice offer to:', targetUserId);
      socket.emit('voice:offer', {
        to: targetUserId,
        offer: offer
      });

      const audioElement = new Audio();
      const connection: VoiceConnection = {
        userId: targetUserId,
        peerConnection,
        audioElement,
        distance: 0
      };

      setVoiceConnections(prev => new Map(prev.set(targetUserId, connection)));
    } catch (error) {
      console.error('Error starting voice connection:', error);
    }
  }, [socket]); // Removed createPeerConnection to prevent infinite loops

  // Handle incoming voice offer
  const handleVoiceOffer = useCallback(async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    if (!socket || !localStreamRef.current) {
      console.error('Cannot handle voice offer - socket or localStream not available');
      return;
    }

    console.log('Received voice offer from:', data.from);
    
    try {
      const peerConnection = createPeerConnection(data.from);
      await peerConnection.setRemoteDescription(data.offer);
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      console.log('Sending voice answer to:', data.from);
      socket.emit('voice:answer', {
        to: data.from,
        answer: answer
      });

      const audioElement = new Audio();
      const connection: VoiceConnection = {
        userId: data.from,
        peerConnection,
        audioElement,
        distance: 0
      };

      setVoiceConnections(prev => new Map(prev.set(data.from, connection)));
    } catch (error) {
      console.error('Error handling voice offer:', error);
    }
  }, [socket]); // Removed createPeerConnection to prevent infinite loops

  // Handle incoming voice answer
  const handleVoiceAnswer = useCallback(async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    console.log('Received voice answer from:', data.from);
    
    try {
      const connection = voiceConnections.get(data.from);
      if (connection) {
        await connection.peerConnection.setRemoteDescription(data.answer);
        console.log('Set remote description for answer from:', data.from);
      } else {
        console.warn('No voice connection found for:', data.from);
      }
    } catch (error) {
      console.error('Error handling voice answer:', error);
    }
  }, []); // Removed voiceConnections dependency to prevent infinite loops

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    console.log('Received ICE candidate from:', data.from);
    
    try {
      const connection = voiceConnections.get(data.from);
      if (connection) {
        await connection.peerConnection.addIceCandidate(data.candidate);
        console.log('Added ICE candidate from:', data.from);
      } else {
        console.warn('No voice connection found for ICE candidate from:', data.from);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }, []); // Removed voiceConnections dependency to prevent infinite loops

  // Toggle voice chat
  const toggleVoice = useCallback(async () => {
    if (!isVoiceEnabled) {
      // Enable voice
      const stream = await getMicrophoneAccess();
      if (stream) {
        localStreamRef.current = stream;
        setIsVoiceEnabled(true);
        
        // Initialize audio context
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // Resume audio context if suspended
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        if (socket) {
          socket.emit('voice:status', { enabled: true });
        }
        
        console.log('Voice chat enabled');
      }
    } else {
      // Disable voice
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      // Close all connections
      voiceConnections.forEach(connection => {
        // Clean up speaking detection
        if (connection.cleanupSpeakingDetection) {
          connection.cleanupSpeakingDetection();
        }
        
        connection.peerConnection.close();
        connection.audioElement.pause();
        connection.audioElement.srcObject = null;
      });
      
      setVoiceConnections(new Map());
      gainNodesRef.current.clear();
      lastVolumeUpdateRef.current.clear();
      setIsVoiceEnabled(false);
      
      if (socket) {
        socket.emit('voice:status', { enabled: false });
      }
      
      console.log('Voice chat disabled');
    }
  }, [isVoiceEnabled, socket, getMicrophoneAccess]); // Removed voiceConnections to prevent infinite loops

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  // Update proximity and connections
  useEffect(() => {
    if (!isVoiceEnabled || !socket) return;

    const currentUsersInRange: string[] = [];
    let connectionChanged = false;

    users.forEach(user => {
      const userSocketId = user.socketId || user.id;
      const currentSocketId = currentUser.socketId || currentUser.id;
      
      if (userSocketId === currentSocketId || !user.voiceEnabled) return;

      const distance = calculateDistance(currentUser, user);
      
      if (distance <= proximityThreshold) {
        currentUsersInRange.push(userSocketId);
        
        // Start connection if not exists
        if (!voiceConnections.has(userSocketId)) {
          console.log('Starting voice connection with user:', user.name, 'socketId:', userSocketId);
          startVoiceConnection(userSocketId);
          connectionChanged = true;
        } else {
          // Update distance and volume
          const connection = voiceConnections.get(userSocketId);
          if (connection) {
            connection.distance = distance;
            const volume = calculateVolume(distance);
            
            // Only update volume if it has changed significantly (throttling)
            const lastVolume = lastVolumeUpdateRef.current.get(userSocketId) || 0;
            const volumeDiff = Math.abs(volume - lastVolume);
            
            if (volumeDiff > 0.1) { // Only update if volume changed by more than 10%
              // Update volume through Web Audio API first
              const gainNode = gainNodesRef.current.get(userSocketId);
              if (gainNode) {
                gainNode.gain.value = volume;
                lastVolumeUpdateRef.current.set(userSocketId, volume);
              } else {
                // Fallback to direct audio element volume control
                if (connection.audioElement) {
                  connection.audioElement.volume = volume;
                  lastVolumeUpdateRef.current.set(userSocketId, volume);
                }
              }
              
              console.log('Updated volume for user:', user.name, 'distance:', distance, 'volume:', volume);
            }
          }
        }
      } else {
        // Remove connection if out of range
        const connection = voiceConnections.get(userSocketId);
        if (connection) {
          console.log('Removing voice connection for user:', user.name, 'out of range');
          
          // Clean up speaking detection
          if (connection.cleanupSpeakingDetection) {
            connection.cleanupSpeakingDetection();
          }
          
          connection.peerConnection.close();
          connection.audioElement.pause();
          connection.audioElement.srcObject = null;
          
          setVoiceConnections(prev => {
            const updated = new Map(prev);
            updated.delete(userSocketId);
            return updated;
          });
          gainNodesRef.current.delete(userSocketId);
          lastVolumeUpdateRef.current.delete(userSocketId);
          connectionChanged = true;
        }
      }
    });

    setUsersInRange(currentUsersInRange);
  }, [users, currentUser, isVoiceEnabled, proximityThreshold, calculateDistance, calculateVolume, startVoiceConnection, socket]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('voice:offer', handleVoiceOffer);
    socket.on('voice:answer', handleVoiceAnswer);
    socket.on('voice:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('voice:offer', handleVoiceOffer);
      socket.off('voice:answer', handleVoiceAnswer);
      socket.off('voice:ice-candidate', handleIceCandidate);
    };
  }, [socket]); // Removed callback dependencies to prevent infinite loop

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Use ref to access current voiceConnections at cleanup time
      const currentConnections = voiceConnections;
      currentConnections.forEach(connection => {
        // Clean up speaking detection
        if (connection.cleanupSpeakingDetection) {
          connection.cleanupSpeakingDetection();
        }
        
        connection.peerConnection.close();
        connection.audioElement.pause();
        connection.audioElement.srcObject = null;
      });
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []); // Remove voiceConnections from dependencies to prevent infinite loops

  return {
    // State
    isVoiceEnabled,
    isMuted,
    usersInRange,
    speakingUsers,
    voiceConnections,
    
    // Actions
    toggleVoice,
    toggleMute,
    
    // Utils
    calculateDistance,
    calculateVolume,
    
    // Config
    proximityThreshold,
    maxDistance
  };
} 