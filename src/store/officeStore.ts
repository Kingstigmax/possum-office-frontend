import { create } from 'zustand';

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

interface OfficeStore {
  users: User[];
  addUser: (user: User) => void;
  removeUser: (socketId: string) => void;
  updateUserPosition: (socketId: string, x: number, y: number) => void;
  updateUserStatus: (socketId: string, status: string) => void;
  updateUserVoiceStatus: (socketId: string, voiceEnabled: boolean) => void;
  setUsers: (users: User[]) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  users: [],
  
  addUser: (user) => set((state) => ({
    users: [...state.users.filter(u => (u.socketId || u.id) !== (user.socketId || user.id)), user]
  })),
  
  removeUser: (socketId) => set((state) => ({
    users: state.users.filter(user => (user.socketId || user.id) !== socketId)
  })),
  
  updateUserPosition: (socketId, x, y) => set((state) => ({
    users: state.users.map(user => 
      (user.socketId || user.id) === socketId 
        ? { ...user, x, y }
        : user
    )
  })),
  
  updateUserStatus: (socketId, status) => set((state) => ({
    users: state.users.map(user => 
      (user.socketId || user.id) === socketId 
        ? { ...user, status }
        : user
    )
  })),

  updateUserVoiceStatus: (socketId, voiceEnabled) => set((state) => ({
    users: state.users.map(user => 
      (user.socketId || user.id) === socketId 
        ? { ...user, voiceEnabled }
        : user
    )
  })),
  
  setUsers: (users) => set(() => ({
    users: users
  })),
}));