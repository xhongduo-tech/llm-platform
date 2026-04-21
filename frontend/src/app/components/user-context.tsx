import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface UserData {
  token: string;
  authId: string;
  name: string;
  department: string;
}

interface UserContextValue {
  user: UserData | null;
  login: (data: UserData) => void;
  logout: () => void;
}

const STORAGE_KEY = "brdc_user";

const UserContext = createContext<UserContextValue | null>(null);

function loadFromStorage(): UserData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(loadFromStorage);

  const login = useCallback((data: UserData) => {
    setUser(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
