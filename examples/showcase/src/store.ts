// Shared state lives in plain TypeScript: `reactive()` objects are tracked
// wherever they are read, in any component.
import { createContext, reactive } from 'owt';

export type Theme = 'light' | 'dark';

export const settings = reactive({
  theme: 'light' as Theme,
  notifications: 0,
});

export function notify() {
  settings.notifications++;
}

/** Context: values provided by an ancestor component. */
export const UserContext = createContext<{ name: string }>('user');

export type User = { id: number; name: string; email: string };

/** A fake API with latency (and the occasional failure). */
export async function fetchUser(id: number): Promise<User> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (id === 13) throw new Error(`User ${id} is unlucky`);
  return { id, name: `User #${id}`, email: `user${id}@example.com` };
}
