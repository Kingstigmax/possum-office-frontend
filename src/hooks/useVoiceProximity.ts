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
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream from:', targetUserId);
      const remoteStream = event.streams[0];
      
      // Create audio element
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      audioElement.autoplay = true;
      audioElement.volume = 0; // Will be controlled by proximity
      
      // Set up Web Audio API for volume control
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(remoteStream);
      const gainNode = audioContextRef.current.createGain();
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      gainNodesRef.current.set(targetUserId, gainNode);
      
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

      // Detect speaking
      const analyser = audioContextRef.current.createAnalyser();
      source.connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const detectSpeaking = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const isSpeaking = average > 10; // Threshold for speaking detection
        
        setSpeakingUsers(prev => {
          const newSet = new Set(prev);
          if (isSpeaking) {
            newSet.add(targetUserId);
          } else {
            newSet.delete(targetUserId);
          }
          return newSet;
        });
        
        requestAnimationFrame(detectSpeaking);
      };
      detectSpeaking();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice:ice-candidate', {
          to: targetUserId,
          candidate: event.candidate
        });
      }
    };

    return peerConnection;
  }, [socket]);

  // Start voice connection with a user
  const startVoiceConnection = useCallback(async (targetUserId: string) => {
    if (!socket || !localStreamRef.current) return;

    console.log('Starting voice connection with:', targetUserId);
    
    const peerConnection = createPeerConnection(targetUserId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
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
  }, [socket, createPeerConnection]);

  // Handle incoming voice offer
  const handleVoiceOffer = useCallback(async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    if (!socket || !localStreamRef.current) return;

    console.log('Received voice offer from:', data.from);
    
    const peerConnection = createPeerConnection(data.from);
    await peerConnection.setRemoteDescription(data.offer);
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
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
  }, [socket, createPeerConnection]);

  // Handle incoming voice answer
  const handleVoiceAnswer = useCallback(async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    console.log('Received voice answer from:', data.from);
    
    const connection = voiceConnections.get(data.from);
    if (connection) {
      await connection.peerConnection.setRemoteDescription(data.answer);
    }
  }, [voiceConnections]);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    console.log('Received ICE candidate from:', data.from);
    
    const connection = voiceConnections.get(data.from);
    if (connection) {
      await connection.peerConnection.addIceCandidate(data.candidate);
    }
  }, [voiceConnections]);

  // Toggle voice chat
  const toggleVoice = useCallback(async () => {
    if (!isVoiceEnabled) {
      // Enable voice
      const stream = await getMicrophoneAccess();
      if (stream) {
        localStreamRef.current = stream;
        setIsVoiceEnabled(true);
        
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
        connection.peerConnection.close();
        connection.audioElement.pause();
      });
      
      setVoiceConnections(new Map());
      setIsVoiceEnabled(false);
      
      if (socket) {
        socket.emit('voice:status', { enabled: false });
      }
      
      console.log('Voice chat disabled');
    }
  }, [isVoiceEnabled, socket, getMicrophoneAccess, voiceConnections]);

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
    const updatedConnections = new Map(voiceConnections);

    users.forEach(user => {
      if (user.socketId === currentUser.socketId || !user.voiceEnabled) return;

      const distance = calculateDistance(currentUser, user);
      
      if (distance <= proximityThreshold) {
        currentUsersInRange.push(user.socketId!);
        
        // Start connection if not exists
        if (!voiceConnections.has(user.socketId!)) {
          startVoiceConnection(user.socketId!);
        } else {
          // Update distance and volume
          const connection = updatedConnections.get(user.socketId!);
          if (connection) {
            connection.distance = distance;
            const volume = calculateVolume(distance);
            
            // Update volume through Web Audio API
            const gainNode = gainNodesRef.current.get(user.socketId!);
            if (gainNode) {
              gainNode.gain.value = volume;
            }
          }
        }
      } else {
        // Remove connection if out of range
        const connection = voiceConnections.get(user.socketId!);
        if (connection) {
          connection.peerConnection.close();
          connection.audioElement.pause();
          updatedConnections.delete(user.socketId!);
          gainNodesRef.current.delete(user.socketId!);
        }
      }
    });

    setUsersInRange(currentUsersInRange);
    setVoiceConnections(updatedConnections);
  }, [users, currentUser, isVoiceEnabled, proximityThreshold, calculateDistance, calculateVolume, startVoiceConnection, voiceConnections, socket]);

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
  }, [socket, handleVoiceOffer, handleVoiceAnswer, handleIceCandidate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      voiceConnections.forEach(connection => {
        connection.peerConnection.close();
        connection.audioElement.pause();
      });
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [voiceConnections]);

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