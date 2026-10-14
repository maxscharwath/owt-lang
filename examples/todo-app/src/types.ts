export type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

export type Filter = 'all' | 'active' | 'completed';

export const FILTERS: readonly Filter[] = ['all', 'active', 'completed'];
