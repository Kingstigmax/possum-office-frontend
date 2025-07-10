import { create } from 'zustand';

interface User {
  id: string;
  socketId?: string;
  name: string;
  x: number;
  y: number;
  status: string;
  avatarSeed?: string;
}

interface OfficeStore {
  users: Map<string, User>;
  addUser: (user: User) => void;
  removeUser: (socketId: string) => void;
  updateUserPosition: (socketId: string, x: number, y: number) => void;
  updateUserStatus: (socketId: string, status: string) => void;
  setUsers: (users: User[]) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  users: new Map(),
  
  addUser: (user) => set((state) => {
    const newUsers = new Map(state.users);
    newUsers.set(user.socketId || user.id, user);
    return { users: newUsers };
  }),
  
  removeUser: (socketId) => set((state) => {
    const newUsers = new Map(state.users);
    newUsers.delete(socketId);
    return { users: newUsers };
  }),
  
  updateUserPosition: (socketId, x, y) => set((state) => {
    const newUsers = new Map(state.users);
    const user = newUsers.get(socketId);
    if (user) {
      user.x = x;
      user.y = y;
    }
    return { users: newUsers };
  }),
  
  updateUserStatus: (socketId, status) => set((state) => {
    const newUsers = new Map(state.users);
    const user = newUsers.get(socketId);
    if (user) {
      user.status = status;
    }
    return { users: newUsers };
  }),
  
  setUsers: (users) => set(() => {
    const newUsers = new Map();
    users.forEach(user => {
      newUsers.set(user.socketId || user.id, user);
    });
    return { users: newUsers };
  }),
}));