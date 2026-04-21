import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { models as initialModels, notifications as initialNotifications, type Model, type NotificationItem } from "./model-data";

interface ModelContextType {
  models: Model[];
  setModels: React.Dispatch<React.SetStateAction<Model[]>>;
  notifications: NotificationItem[];
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>;
}

const ModelContext = createContext<ModelContextType>({
  models: initialModels,
  setModels: () => {},
  notifications: initialNotifications,
  setNotifications: () => {},
});

/** Merge backend operational data (status, baseUrl, etc.) onto local display data */
function mergeModels(local: Model[], remote: Record<string, any>[]): Model[] {
  const remoteMap = new Map(remote.map((r) => [r.id, r]));
  // Update existing local models with backend status/config
  const merged = local.map((m) => {
    const r = remoteMap.get(m.id);
    if (!r) return m;
    return {
      ...m,
      status:        (r.status as Model["status"]) || m.status,
      baseUrl:       r.baseUrl       ?? m.baseUrl,
      modelApiName:  r.modelApiName  ?? m.modelApiName,
      importFormat:  r.importFormat  ?? m.importFormat,
      customHeaders: r.customHeaders ?? m.customHeaders,
    };
  });
  // Append backend-only models (added via admin panel, not in model-data.ts)
  const localIds = new Set(local.map((m) => m.id));
  for (const r of remote) {
    if (!localIds.has(r.id)) {
      merged.push({
        id: r.id,
        name: r.name || r.id,
        provider: r.provider || "",
        shortDescription: r.shortDescription || "",
        description: r.description || "",
        contextWindow: r.contextWindow || "-",
        status: r.status || "online",
        category: r.category || "chat",
        speed: r.speed || "medium",
        pricing: "",
        addedAt: "",
        baseUrl:       r.baseUrl,
        modelApiName:  r.modelApiName,
        importFormat:  r.importFormat  || "openai",
        customHeaders: r.customHeaders || undefined,
      });
    }
  }
  return merged;
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Model[]>([...initialModels]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([...initialNotifications]);

  // Hydrate from backend on mount — silent fallback to local data on error
  useEffect(() => {
    fetch("/api/public/models")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Record<string, any>[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setModels((local) => mergeModels(local, data));
        }
      })
      .catch(() => { /* keep local data */ });

    fetch("/api/public/notifications")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setNotifications(
            data.map((n) => ({
              id: n.id,
              title: n.title,
              description: n.description || "",
              type: n.type as NotificationItem["type"],
              date: n.date,
              isNew: n.isNew ?? false,
            }))
          );
        }
      })
      .catch(() => { /* keep local data */ });
  }, []);

  return (
    <ModelContext.Provider value={{ models, setModels, notifications, setNotifications }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModels() {
  return useContext(ModelContext);
}
