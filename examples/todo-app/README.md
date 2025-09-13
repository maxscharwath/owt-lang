# OWT Todo App Example

A fully-featured todo application built with the OWT language and styled with Tailwind CSS 4.1.

## Features

- ✅ **Add todos** - Create new todo items with a clean input form
- ✅ **Edit todos** - Double-click any todo to edit it inline
- ✅ **Toggle completion** - Click the checkbox to mark todos as complete/incomplete
- ✅ **Delete todos** - Remove todos with the delete button
- ✅ **Filter todos** - View all, active, or completed todos
- ✅ **Clear completed** - Remove all completed todos at once
- ✅ **Responsive design** - Works great on desktop and mobile
- ✅ **Modern UI** - Beautiful design with Tailwind CSS 4.1
- ✅ **Accessibility** - Keyboard navigation and focus management

## OWT Language Features Demonstrated

This example showcases many key features of the OWT language:

### Reactive State Management
```owt
var todos: Todo[] = [];
var currentFilter: Filter = 'all';
```

### Computed Values
```owt
val filteredTodos = todos.filter(todo => {
  switch (currentFilter) {
    case 'active': return !todo.completed;
    case 'completed': return todo.completed;
    default: return true;
  }
});
```

### Control Flow
```owt
if (isEditing) {
  <input ... />
} else {
  <span ... />
}

for (todo of todos, meta) {
  <TodoItem ... />
} empty {
  <li>No todos yet...</li>
}
```

### Component Composition
- `App.owt` - Main application component
- `AddTodo.owt` - Form for adding new todos
- `TodoList.owt` - List display with statistics
- `TodoItem.owt` - Individual todo item with edit functionality
- `FilterBar.owt` - Filter controls

### TypeScript Integration
Full type safety with TypeScript interfaces and type annotations.

## Getting Started

1. **Install dependencies:**
   ```bash
   cd examples/todo-app
   pnpm install
   ```

2. **Start development server:**
   ```bash
   pnpm dev
   ```

3. **Build for production:**
   ```bash
   pnpm build
   ```

4. **Preview production build:**
   ```bash
   pnpm preview
   ```

## Project Structure

```
src/
├── App.owt           # Main application component
├── AddTodo.owt       # Add todo form component
├── TodoList.owt      # Todo list display component
├── TodoItem.owt      # Individual todo item component
├── FilterBar.owt     # Filter controls component
├── main.ts           # Application entry point
└── styles.css        # Global styles and Tailwind imports
```

## Styling

The app uses Tailwind CSS 4.1 with:
- Custom animations for smooth interactions
- Responsive design patterns
- Modern color palette
- Accessibility-focused focus states
- Custom scrollbar styling

## Keyboard Shortcuts

- **Enter** - Save todo when editing
- **Escape** - Cancel editing
- **Double-click** - Start editing a todo

## Browser Support

This app works in all modern browsers that support:
- ES2022 features
- CSS Grid and Flexbox
- Modern JavaScript APIs
